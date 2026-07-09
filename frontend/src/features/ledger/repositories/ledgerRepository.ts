/**
 * ledgers への DB アクセス（Repository 層）。DB行⇔ドメイン型の変換を担い、業務判断は持たない。
 * 作成は原子性のため RPC `create_ledger_with_defaults` を呼ぶ（database.md §5 / マイグレーション 20260706000200）。
 */
import type { PostgrestError, SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

import { ConflictError, NotFoundError } from "@/shared/errors/appError";

import type { UserLedgerSummary } from "../services/ledgerCreationPolicy";
import type { DefaultCategorySeed, Ledger, LedgerType, MemberRole } from "../types";

const LEDGERS_TABLE = "ledgers";
const LEDGER_MEMBERS_TABLE = "ledger_members";
const CREATE_LEDGER_RPC = "create_ledger_with_defaults";
const DELETE_LEDGER_RPC = "delete_ledger_cascade";

/** 一意制約違反（Postgres）。同時実行で個人/家族の重複作成が起きた場合に返る。 */
const UNIQUE_VIOLATION_CODE = "23505";
/** 既に家族家計簿へ所属している（FR-LEDGER-05 のDBバックストップ・マイグレーション 20260710000100）。 */
const FAMILY_MEMBERSHIP_CONFLICT_CODE = "FML01";

const ledgerRowSchema = z.object({
  id: z.string(),
  owner_user_id: z.string(),
  type: z.enum(["personal", "family"]),
  name: z.string(),
  created_at: z.string(),
  updated_at: z.string(),
});

const toLedger = (row: z.infer<typeof ledgerRowSchema>): Ledger => ({
  id: row.id,
  ownerUserId: row.owner_user_id,
  type: row.type,
  name: row.name,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

const isUniqueViolation = (error: PostgrestError): boolean => error.code === UNIQUE_VIOLATION_CODE;

/** ユーザーが所属する家族家計簿と、その帳簿内での role。 */
export type FamilyMembership = {
  readonly ledgerId: string;
  readonly role: MemberRole;
};

export type CreateLedgerWithDefaultsInput = {
  readonly ownerUserId: string;
  readonly type: LedgerType;
  readonly name: string;
  readonly categories: readonly DefaultCategorySeed[];
};

/** ledgers から1行を取得する際に選択するカラム（DB行→ドメイン変換用）。 */
const LEDGER_COLUMNS = "id, owner_user_id, type, name, created_at, updated_at";

export type LedgerRepository = {
  /** 作成可否判定に使う、対象ユーザーの帳簿所属サマリー（ledgerCreationPolicy 用）。 */
  getUserLedgerSummary(userId: string): Promise<UserLedgerSummary>;
  /** 家計簿・オーナーmember・デフォルトカテゴリを原子的に作成する。 */
  createLedgerWithDefaults(input: CreateLedgerWithDefaultsInput): Promise<Ledger>;
  /** 有効な（論理削除されていない）家計簿を1件取得する。存在しなければ null。 */
  getLedgerById(ledgerId: string): Promise<Ledger | null>;
  /** 家計簿の名称を更新する。更新対象が存在しなければ NotFoundError。 */
  updateLedgerName(ledgerId: string, name: string): Promise<Ledger>;
  /** 家計簿と Phase 1 子データ（メンバー・カテゴリ・明細・招待）を原子的に論理削除する。 */
  deleteLedgerCascade(ledgerId: string): Promise<void>;
  /** ユーザーが所属する家族家計簿と role を返す。所属が無ければ null（FR-LEDGER-05）。 */
  getUserFamilyMembership(userId: string): Promise<FamilyMembership | null>;
};

const familyMembershipRowSchema = z.object({
  ledger_id: z.string(),
  role: z.enum(["owner", "member"]),
});

export const createLedgerRepository = (client: SupabaseClient): LedgerRepository => ({
  async getUserLedgerSummary(userId) {
    const [personal, family] = await Promise.all([
      // 個人家計簿の所有（ledgers の部分ユニーク制約対象）
      client
        .from(LEDGERS_TABLE)
        .select("id")
        .eq("owner_user_id", userId)
        .eq("type", "personal")
        .is("deleted_at", null)
        .limit(1)
        .maybeSingle(),
      // 家族家計簿への所属（所有・参加いずれも ledger_members に行が存在する）
      client
        .from(LEDGER_MEMBERS_TABLE)
        .select("id, ledgers!inner(type)")
        .eq("user_id", userId)
        .eq("ledgers.type", "family")
        .is("deleted_at", null)
        .is("ledgers.deleted_at", null)
        .limit(1)
        .maybeSingle(),
    ]);

    if (personal.error) {
      throw new Error(`Failed to query personal ledger: ${personal.error.message}`);
    }
    if (family.error) {
      throw new Error(`Failed to query family ledger membership: ${family.error.message}`);
    }

    return {
      ownsPersonalLedger: personal.data !== null,
      belongsToFamilyLedger: family.data !== null,
    };
  },

  async createLedgerWithDefaults(input) {
    const { data, error } = await client.rpc(CREATE_LEDGER_RPC, {
      p_owner_user_id: input.ownerUserId,
      p_type: input.type,
      p_name: input.name,
      p_categories: input.categories,
    });

    if (error) {
      // 事前チェックをすり抜けた同時実行の重複は 409 として扱う
      if (isUniqueViolation(error)) {
        throw new ConflictError("この種別の家計簿は既に作成されています");
      }
      if (error.code === FAMILY_MEMBERSHIP_CONFLICT_CODE) {
        throw new ConflictError("既に家族家計簿に所属しています");
      }
      throw new Error(`Failed to create ledger: ${error.message}`);
    }

    return toLedger(ledgerRowSchema.parse(data));
  },

  async getLedgerById(ledgerId) {
    const { data, error } = await client
      .from(LEDGERS_TABLE)
      .select(LEDGER_COLUMNS)
      .eq("id", ledgerId)
      .is("deleted_at", null)
      .maybeSingle();

    if (error) {
      throw new Error(`Failed to get ledger: ${error.message}`);
    }

    return data === null ? null : toLedger(ledgerRowSchema.parse(data));
  },

  async updateLedgerName(ledgerId, name) {
    const { data, error } = await client
      .from(LEDGERS_TABLE)
      .update({ name })
      .eq("id", ledgerId)
      .is("deleted_at", null)
      .select(LEDGER_COLUMNS)
      .maybeSingle();

    if (error) {
      throw new Error(`Failed to update ledger name: ${error.message}`);
    }
    // 取得〜更新の間に削除された場合は対象なし
    if (data === null) {
      throw new NotFoundError("家計簿が見つかりません");
    }

    return toLedger(ledgerRowSchema.parse(data));
  },

  async deleteLedgerCascade(ledgerId) {
    const { error } = await client.rpc(DELETE_LEDGER_RPC, { p_ledger_id: ledgerId });

    if (error) {
      throw new Error(`Failed to delete ledger: ${error.message}`);
    }
  },

  async getUserFamilyMembership(userId) {
    const { data, error } = await client
      .from(LEDGER_MEMBERS_TABLE)
      .select("ledger_id, role, ledgers!inner(type)")
      .eq("user_id", userId)
      .eq("ledgers.type", "family")
      .is("deleted_at", null)
      .is("ledgers.deleted_at", null)
      .limit(1)
      .maybeSingle();

    if (error) {
      throw new Error(`Failed to query family membership: ${error.message}`);
    }
    if (data === null) return null;

    const row = familyMembershipRowSchema.parse(data);
    return { ledgerId: row.ledger_id, role: row.role };
  },
});
