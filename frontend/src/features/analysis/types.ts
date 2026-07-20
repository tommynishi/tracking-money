/** 分析・ダッシュボードのドメイン型（api.md 9・FR-AI/FR-DASH）。 */

/** 集計対象の明細（AI分析には使わない最小限の列）。 */
export type AnalysisEntry = {
  readonly id: string;
  readonly usedOn: string;
  readonly billingMonth: string;
  readonly amount: number;
  readonly categoryId: string;
  readonly categoryName: string;
  readonly description: string;
  readonly normalizedDescription: string;
};

export type CategoryAmount = {
  readonly categoryId: string;
  readonly categoryName: string;
  readonly amount: number;
};

export type MonthlySummary = {
  readonly month: string;
  readonly totalAmount: number;
  readonly prevMonthAmount: number;
  readonly prevYearSameMonthAmount: number;
  readonly byCategory: CategoryAmount[];
};

export type TrendPoint = {
  readonly month: string;
  readonly amount: number;
};

export type RankingItem = {
  readonly entryId: string;
  readonly usedOn: string;
  readonly description: string;
  readonly categoryName: string;
  readonly amount: number;
};

export type SubscriptionCandidate = {
  readonly normalizedDescription: string;
  readonly description: string;
  readonly categoryName: string;
  readonly monthlyAmount: number;
  readonly annualAmount: number;
  readonly occurrences: number;
};

export type InsightType = "monthly_review" | "fixed_cost" | "saving_advice" | "forecast";

export type Insight = {
  readonly type: InsightType;
  readonly month: string;
  readonly generatedAt: string;
  readonly insight: {
    readonly summary: string;
    readonly points: string[];
  };
};
