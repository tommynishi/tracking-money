/**
 * 精算用の明細取得（Repository 層・FR-SPLIT-05）。
 * 表示に必要な最小列のみ取得する（NFR-05：個人情報は必要最小限。摘要等は取得しない）。
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

import type { SettlementEntry } from "../types";

const COLUMNS = "amount, paid_by_user_id, split_type, split_shares, assigned_user_id";

const splitShareSchema = z.object({ userId: z.string(), weight: z.number() });

const rowSchema = z.object({
  amount: z.number(),
  paid_by_user_id: z.string(),
  split_type: z.enum(["default", "custom", "assigned"]),
  split_shares: z.array(splitShareSchema).nullable(),
  assigned_user_id: z.string().nullable(),
});

const toSettlementEntry = (row: z.infer<typeof rowSchema>): SettlementEntry => ({
  amount: row.amount,
  paidByUserId: row.paid_by_user_id,
  splitType: row.split_type,
  splitShares: row.split_shares,
  assignedUserId: row.assigned_user_id,
});

export type SettlementEntryRepository = {
  /** 指定した支払月の明細（按分・支払者のみ）を返す。 */
  listByBillingMonth(ledgerId: string, billingMonth: string): Promise<SettlementEntry[]>;
};

export const createSettlementEntryRepository = (
  client: SupabaseClient,
): SettlementEntryRepository => ({
  async listByBillingMonth(ledgerId, billingMonth) {
    const { data, error } = await client
      .from("entries")
      .select(COLUMNS)
      .eq("ledger_id", ledgerId)
      .eq("billing_month", billingMonth)
      .is("deleted_at", null);

    if (error) {
      throw new Error(`Failed to list entries for settlement: ${error.message}`);
    }
    return z.array(rowSchema).parse(data).map(toSettlementEntry);
  },
});
