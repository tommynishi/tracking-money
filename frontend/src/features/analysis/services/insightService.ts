/**
 * AI所見サービス（api.md 9.6・FR-AI-01/06/08/09）。
 * 明細個別の内容はAIへ渡さず、集計済みの数値のみを渡す（NFR-05）。
 * analysis_caches に入力ハッシュ付きでキャッシュし、入力が変わらない限り再利用する（NFR-13）。
 */
import { createHash } from "node:crypto";

import type { AnalysisCacheRepository } from "../repositories/analysisCacheRepository";
import type { AnalysisDeps } from "./analysisService";
import { getMonthlySummary, getTrend } from "./analysisService";
import { generateInsight } from "./aiInsightClient";
import { monthsBack } from "@/shared/utils/month";
import type { Insight, InsightType } from "../types";
import type { Category } from "@/features/category/types";

export type InsightDeps = AnalysisDeps & {
  readonly cacheRepository: Pick<AnalysisCacheRepository, "get" | "upsert">;
};

const TREND_MONTHS_FOR_INSIGHT = 12;

const stableHash = (value: unknown): string =>
  createHash("sha256").update(JSON.stringify(value)).digest("hex");

/** 所見の種別ごとに、AIへ渡す集計データ（個人情報を含まない）を組み立てる。 */
const buildInputData = async (
  deps: InsightDeps,
  ledgerId: string,
  type: InsightType,
  month: string,
): Promise<unknown> => {
  switch (type) {
    case "monthly_review": {
      const summary = await getMonthlySummary(deps, ledgerId, month);
      return summary;
    }
    case "fixed_cost": {
      const [summary, categories] = await Promise.all([
        getMonthlySummary(deps, ledgerId, month),
        deps.categoryRepository.listByLedger(ledgerId),
      ]);
      const fixedCostCategoryIds = new Set(
        categories.filter((c: Category) => c.isFixedCost).map((c) => c.id),
      );
      const byCategory = summary.byCategory.filter((c) => fixedCostCategoryIds.has(c.categoryId));
      return { month, byCategory, totalAmount: byCategory.reduce((sum, c) => sum + c.amount, 0) };
    }
    case "saving_advice": {
      const [summary, trend] = await Promise.all([
        getMonthlySummary(deps, ledgerId, month),
        getTrend(deps, ledgerId, month, TREND_MONTHS_FOR_INSIGHT),
      ]);
      return { byCategory: summary.byCategory, trend };
    }
    case "forecast": {
      const trend = await getTrend(deps, ledgerId, month, TREND_MONTHS_FOR_INSIGHT);
      return { trend, months: monthsBack(month, TREND_MONTHS_FOR_INSIGHT) };
    }
  }
};

/** AI所見を取得する。キャッシュが有効なら再利用し、refresh 指定時は必ず再生成する。 */
export const getInsight = async (
  deps: InsightDeps,
  ledgerId: string,
  type: InsightType,
  month: string,
  refresh = false,
): Promise<Insight> => {
  const inputData = await buildInputData(deps, ledgerId, type, month);
  const inputHash = stableHash(inputData);

  if (!refresh) {
    const cached = await deps.cacheRepository.get(ledgerId, type, month, inputHash);
    if (cached !== null) {
      return cached;
    }
  }

  const result = await generateInsight({
    type,
    month,
    summaryJson: JSON.stringify(inputData),
  });

  const insight: Insight = {
    type,
    month,
    generatedAt: new Date().toISOString(),
    insight: { summary: result.summary, points: result.points },
  };
  await deps.cacheRepository.upsert(ledgerId, type, month, inputHash, insight);
  return insight;
};
