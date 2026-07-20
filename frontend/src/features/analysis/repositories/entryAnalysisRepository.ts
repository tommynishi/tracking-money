/**
 * 分析用の明細取得（Repository 層・api.md 9）。
 * 表示に必要な最小列のみ取得する（NFR-05：個人情報は必要最小限）。
 * 集計は支払月（billing_month）を基準とする（利用日ではなく請求月で「今月いくら使うか」を把握する）。
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

import type { AnalysisEntry } from "../types";

const COLUMNS =
  "id, used_on, billing_month, amount, description, normalized_description, categories!inner(id, name)";

const rowSchema = z.object({
  id: z.string(),
  used_on: z.string(),
  billing_month: z.string(),
  amount: z.number(),
  description: z.string(),
  normalized_description: z.string(),
  categories: z.object({ id: z.string(), name: z.string() }),
});

const toEntry = (row: z.infer<typeof rowSchema>): AnalysisEntry => ({
  id: row.id,
  usedOn: row.used_on,
  billingMonth: row.billing_month,
  amount: row.amount,
  categoryId: row.categories.id,
  categoryName: row.categories.name,
  description: row.description,
  normalizedDescription: row.normalized_description,
});

export type EntryAnalysisRepository = {
  /** 指定した支払月（複数可）の明細を返す（billing_month 昇順）。 */
  listByBillingMonths(ledgerId: string, billingMonths: readonly string[]): Promise<AnalysisEntry[]>;
};

export const createEntryAnalysisRepository = (client: SupabaseClient): EntryAnalysisRepository => ({
  async listByBillingMonths(ledgerId, billingMonths) {
    if (billingMonths.length === 0) {
      return [];
    }
    const { data, error } = await client
      .from("entries")
      .select(COLUMNS)
      .eq("ledger_id", ledgerId)
      .in("billing_month", billingMonths)
      .is("deleted_at", null)
      .order("billing_month", { ascending: true });

    if (error) {
      throw new Error(`Failed to list entries for analysis: ${error.message}`);
    }
    return z.array(rowSchema).parse(data).map(toEntry);
  },
});
