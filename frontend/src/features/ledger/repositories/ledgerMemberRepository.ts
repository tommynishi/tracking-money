/**
 * ledger_members への DB アクセス（Repository 層）。
 * 業務判断・認可判定は行わず、クエリ実行のみを担う（architecture.md 4 レイヤー責務）。
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

import type { LedgerMember, MemberRole } from "../types";

const LEDGER_MEMBERS_TABLE = "ledger_members";

const memberRowSchema = z.object({
  user_id: z.string(),
  role: z.enum(["owner", "member"]),
  created_at: z.string(),
  expense_weight: z.number().int(),
  users: z.object({
    display_name: z.string(),
    avatar_url: z.string().nullable(),
  }),
});

const toMember = (row: z.infer<typeof memberRowSchema>): LedgerMember => ({
  userId: row.user_id,
  role: row.role,
  displayName: row.users.display_name,
  avatarUrl: row.users.avatar_url,
  joinedAt: row.created_at,
  weight: row.expense_weight,
});

export type LedgerMemberRepository = {
  /**
   * 対象ユーザーが対象帳簿の有効な（論理削除されていない）メンバーかを返す。
   * database.md §4 の認可クエリに相当する。
   */
  hasActiveMembership(userId: string, ledgerId: string): Promise<boolean>;
  /** 対象ユーザーの帳簿内 role を返す。メンバーでなければ null。 */
  getMembershipRole(userId: string, ledgerId: string): Promise<MemberRole | null>;
  /** 帳簿の有効メンバー一覧を参加日時の昇順で取得する（api.md 3.6）。 */
  listMembers(ledgerId: string): Promise<LedgerMember[]>;
  /** 対象ユーザーの所属を論理削除する（除外・退出・api.md 3.7）。 */
  softDeleteMembership(userId: string, ledgerId: string): Promise<void>;
  /** 既定按分比重を一括更新する（FR-SPLIT-01/02・api.md 12.1）。更新後のメンバー一覧を返す。 */
  updateWeights(
    ledgerId: string,
    weights: readonly { userId: string; weight: number }[],
  ): Promise<LedgerMember[]>;
};

const fetchMembers = async (client: SupabaseClient, ledgerId: string): Promise<LedgerMember[]> => {
  // users の埋め込みは表示情報の参照であり、所属の有効性は ledger_members.deleted_at が正。
  // ユーザー退会時は退会フロー側で所属を論理削除する（埋め込み側の deleted_at では絞らない）
  const { data, error } = await client
    .from(LEDGER_MEMBERS_TABLE)
    .select("user_id, role, created_at, expense_weight, users!inner(display_name, avatar_url)")
    .eq("ledger_id", ledgerId)
    .is("deleted_at", null)
    .order("created_at", { ascending: true });

  if (error) {
    throw new Error(`Failed to list members: ${error.message}`);
  }

  return z.array(memberRowSchema).parse(data).map(toMember);
};

export const createLedgerMemberRepository = (client: SupabaseClient): LedgerMemberRepository => ({
  async hasActiveMembership(userId, ledgerId) {
    const { data, error } = await client
      .from(LEDGER_MEMBERS_TABLE)
      .select("id")
      .eq("ledger_id", ledgerId)
      .eq("user_id", userId)
      .is("deleted_at", null)
      .limit(1)
      .maybeSingle();

    // DB障害等は業務エラーではないため、Route Handler 最上位で 500 に変換させる
    if (error) {
      throw new Error(`Failed to query ledger membership: ${error.message}`);
    }

    return data !== null;
  },

  async getMembershipRole(userId, ledgerId) {
    const { data, error } = await client
      .from(LEDGER_MEMBERS_TABLE)
      .select("role")
      .eq("ledger_id", ledgerId)
      .eq("user_id", userId)
      .is("deleted_at", null)
      .maybeSingle();

    if (error) {
      throw new Error(`Failed to query membership role: ${error.message}`);
    }

    return data === null ? null : z.object({ role: z.enum(["owner", "member"]) }).parse(data).role;
  },

  async listMembers(ledgerId) {
    return fetchMembers(client, ledgerId);
  },

  async softDeleteMembership(userId, ledgerId) {
    const { error } = await client
      .from(LEDGER_MEMBERS_TABLE)
      .update({ deleted_at: new Date().toISOString() })
      .eq("ledger_id", ledgerId)
      .eq("user_id", userId)
      .is("deleted_at", null);

    if (error) {
      throw new Error(`Failed to remove membership: ${error.message}`);
    }
  },

  async updateWeights(ledgerId, weights) {
    await Promise.all(
      weights.map(async ({ userId, weight }) => {
        const { error } = await client
          .from(LEDGER_MEMBERS_TABLE)
          .update({ expense_weight: weight })
          .eq("ledger_id", ledgerId)
          .eq("user_id", userId)
          .is("deleted_at", null);

        if (error) {
          throw new Error(`Failed to update member weight: ${error.message}`);
        }
      }),
    );

    return fetchMembers(client, ledgerId);
  },
});
