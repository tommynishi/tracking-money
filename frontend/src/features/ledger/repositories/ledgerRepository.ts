/**
 * ledgers への DB アクセス（Repository 層）。DB行⇔ドメイン型の変換を担い、業務判断は持たない。
 * 作成は原子性のため RPC `create_ledger_with_defaults` を呼ぶ（database.md §5 / マイグレーション 20260706000200）。
 */
import type { PostgrestError, SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

import { ConflictError } from "@/shared/errors/appError";

import type { UserLedgerSummary } from "../services/ledgerCreationPolicy";
import type { DefaultCategorySeed, Ledger, LedgerType } from "../types";

const LEDGERS_TABLE = "ledgers";
const LEDGER_MEMBERS_TABLE = "ledger_members";
const CREATE_LEDGER_RPC = "create_ledger_with_defaults";

/** 一意制約違反（Postgres）。同時実行で個人/家族の重複作成が起きた場合に返る。 */
const UNIQUE_VIOLATION_CODE = "23505";

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

export type CreateLedgerWithDefaultsInput = {
  readonly ownerUserId: string;
  readonly type: LedgerType;
  readonly name: string;
  readonly categories: readonly DefaultCategorySeed[];
};

export type LedgerRepository = {
  /** 作成可否判定に使う、対象ユーザーの帳簿所属サマリー（ledgerCreationPolicy 用）。 */
  getUserLedgerSummary(userId: string): Promise<UserLedgerSummary>;
  /** 家計簿・オーナーmember・デフォルトカテゴリを原子的に作成する。 */
  createLedgerWithDefaults(input: CreateLedgerWithDefaultsInput): Promise<Ledger>;
};

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
      throw new Error(`Failed to create ledger: ${error.message}`);
    }

    return toLedger(ledgerRowSchema.parse(data));
  },
});
