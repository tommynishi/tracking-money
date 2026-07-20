/**
 * analysis_caches への DB アクセス（Repository 層・database.md 3.11・NFR-13）。
 * 派生データのため論理削除は行わず、upsert（物理上書き）を用いる。
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

import type { Insight, InsightType } from "../types";

const TABLE = "analysis_caches";

const rowSchema = z.object({
  analysis_type: z.string(),
  period_key: z.string(),
  input_hash: z.string(),
  result: z.unknown(),
  updated_at: z.string(),
});

export type AnalysisCacheRepository = {
  /** input_hash が一致するキャッシュがあれば返す（不一致・未存在は null）。 */
  get(
    ledgerId: string,
    analysisType: InsightType,
    periodKey: string,
    inputHash: string,
  ): Promise<Insight | null>;
  upsert(
    ledgerId: string,
    analysisType: InsightType,
    periodKey: string,
    inputHash: string,
    insight: Insight,
  ): Promise<void>;
};

export const createAnalysisCacheRepository = (client: SupabaseClient): AnalysisCacheRepository => ({
  async get(ledgerId, analysisType, periodKey, inputHash) {
    const { data, error } = await client
      .from(TABLE)
      .select("analysis_type, period_key, input_hash, result, updated_at")
      .eq("ledger_id", ledgerId)
      .eq("analysis_type", analysisType)
      .eq("period_key", periodKey)
      .maybeSingle();

    if (error) {
      throw new Error(`Failed to get analysis cache: ${error.message}`);
    }
    if (data === null) {
      return null;
    }
    const row = rowSchema.parse(data);
    if (row.input_hash !== inputHash) {
      return null;
    }
    return row.result as Insight;
  },

  async upsert(ledgerId, analysisType, periodKey, inputHash, insight) {
    const { error } = await client.from(TABLE).upsert(
      {
        ledger_id: ledgerId,
        analysis_type: analysisType,
        period_key: periodKey,
        input_hash: inputHash,
        result: insight,
      },
      { onConflict: "ledger_id,analysis_type,period_key" },
    );
    if (error) {
      throw new Error(`Failed to upsert analysis cache: ${error.message}`);
    }
  },
});
