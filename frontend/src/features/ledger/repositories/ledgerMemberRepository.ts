/**
 * ledger_members への DB アクセス（Repository 層）。
 * 業務判断・認可判定は行わず、クエリ実行のみを担う（architecture.md 4 レイヤー責務）。
 */
import type { SupabaseClient } from "@supabase/supabase-js";

const LEDGER_MEMBERS_TABLE = "ledger_members";

export type LedgerMemberRepository = {
  /**
   * 対象ユーザーが対象帳簿の有効な（論理削除されていない）メンバーかを返す。
   * database.md §4 の認可クエリに相当する。
   */
  hasActiveMembership(userId: string, ledgerId: string): Promise<boolean>;
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
});
