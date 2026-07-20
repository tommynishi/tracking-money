/**
 * 分析用の明細取得（Repository 層・api.md 9）。
 * 表示に必要な最小列のみ取得する（NFR-05：個人情報は必要最小限）。
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

import type { AnalysisEntry } from "../types";

const COLUMNS =
  "id, used_on, amount, description, normalized_description, categories!inner(id, name)";

const rowSchema = z.object({
  id: z.string(),
  used_on: z.string(),
  amount: z.number(),
  description: z.string(),
  normalized_description: z.string(),
  categories: z.object({ id: z.string(), name: z.string() }),
});

const toEntry = (row: z.infer<typeof rowSchema>): AnalysisEntry => ({
  id: row.id,
  usedOn: row.used_on,
  amount: row.amount,
  categoryId: row.categories.id,
  categoryName: row.categories.name,
  description: row.description,
  normalizedDescription: row.normalized_description,
});

export type EntryAnalysisRepository = {
  /** 期間内（inclusive）の明細を返す（used_on 昇順）。 */
  listByDateRange(ledgerId: string, from: string, to: string): Promise<AnalysisEntry[]>;
};

export const createEntryAnalysisRepository = (client: SupabaseClient): EntryAnalysisRepository => ({
  async listByDateRange(ledgerId, from, to) {
    const { data, error } = await client
      .from("entries")
      .select(COLUMNS)
      .eq("ledger_id", ledgerId)
      .gte("used_on", from)
      .lte("used_on", to)
      .is("deleted_at", null)
      .order("used_on", { ascending: true });

    if (error) {
      throw new Error(`Failed to list entries for analysis: ${error.message}`);
    }
    return z.array(rowSchema).parse(data).map(toEntry);
  },
});
