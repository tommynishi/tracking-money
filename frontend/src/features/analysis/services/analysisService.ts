/**
 * 集計系分析サービス（api.md 9.1〜9.5・FR-AI-01〜07・FR-DASH-01）。
 * AIを使わずSQL/JS集計のみで完結する（AI所見は insightService に分離・FR-AI-11）。
 */
import type { CategoryRepository } from "@/features/category/repositories/categoryRepository";
import type { EntryListItem } from "@/features/entry/types";
import type { EntryRepository } from "@/features/entry/repositories/entryRepository";

import type { EntryAnalysisRepository } from "../repositories/entryAnalysisRepository";
import { byCategory, buildRanking, buildTrend, detectSubscriptions, monthlyTotals } from "./aggregation";
import { monthRange, monthsBack, shiftMonth } from "@/shared/utils/month";
import type { CategoryAmount, MonthlySummary, RankingItem, SubscriptionCandidate, TrendPoint } from "../types";

export type AnalysisDeps = {
  readonly entryAnalysisRepository: Pick<EntryAnalysisRepository, "listByDateRange">;
  readonly categoryRepository: Pick<CategoryRepository, "listByLedger">;
};

const RECENT_ENTRIES_LIMIT = 5;
const RANKING_DEFAULT_LIMIT = 20;
const TREND_DEFAULT_MONTHS = 12;
const SUBSCRIPTION_WINDOW_MONTHS = 6;

/** 月次サマリー（今月・前月・前年同月・カテゴリ別内訳）を算出する（FR-AI-01〜03）。 */
export const getMonthlySummary = async (
  deps: AnalysisDeps,
  ledgerId: string,
  month: string,
): Promise<MonthlySummary> => {
  const current = monthRange(month);
  const prevMonthStr = shiftMonth(month, -1);
  const prevMonth = monthRange(prevMonthStr);
  const prevYearStr = shiftMonth(month, -12);
  const prevYear = monthRange(prevYearStr);

  const [currentEntries, prevMonthEntries, prevYearEntries, categories] = await Promise.all([
    deps.entryAnalysisRepository.listByDateRange(ledgerId, current.from, current.to),
    deps.entryAnalysisRepository.listByDateRange(ledgerId, prevMonth.from, prevMonth.to),
    deps.entryAnalysisRepository.listByDateRange(ledgerId, prevYear.from, prevYear.to),
    deps.categoryRepository.listByLedger(ledgerId),
  ]);

  const totals = monthlyTotals(currentEntries, prevMonthEntries, prevYearEntries);
  return {
    month,
    ...totals,
    byCategory: byCategory(currentEntries, categories),
  };
};

export type DashboardData = MonthlySummary & { readonly recentEntries: EntryListItem[] };

/** ダッシュボード表示用の一括取得（FR-DASH-01）。 */
export const getDashboard = async (
  deps: AnalysisDeps & { readonly entryRepository: Pick<EntryRepository, "list"> },
  ledgerId: string,
  month: string,
): Promise<DashboardData> => {
  const [summary, recent] = await Promise.all([
    getMonthlySummary(deps, ledgerId, month),
    deps.entryRepository.list(ledgerId, {
      filters: { month },
      sort: "usedOn",
      order: "desc",
      page: 1,
      perPage: RECENT_ENTRIES_LIMIT,
    }),
  ]);
  return { ...summary, recentEntries: recent.items };
};

/** カテゴリ別の月次推移（FR-AI-04）。 */
export const getTrend = async (
  deps: AnalysisDeps,
  ledgerId: string,
  endMonth: string,
  months: number = TREND_DEFAULT_MONTHS,
  categoryId?: string,
): Promise<TrendPoint[]> => {
  const targetMonths = monthsBack(endMonth, months);
  const range = monthRange(targetMonths[0]);
  const rangeEnd = monthRange(targetMonths[targetMonths.length - 1]);
  const entries = await deps.entryAnalysisRepository.listByDateRange(ledgerId, range.from, rangeEnd.to);

  const byMonth = new Map<string, ReturnType<typeof entries.filter>>();
  for (const targetMonth of targetMonths) {
    const { from, to } = monthRange(targetMonth);
    byMonth.set(
      targetMonth,
      entries.filter((entry) => entry.usedOn >= from && entry.usedOn <= to),
    );
  }
  return buildTrend(byMonth, targetMonths, categoryId);
};

/** 支出ランキング（FR-AI-05）。month または from/to のいずれかを指定する。 */
export const getRanking = async (
  deps: AnalysisDeps,
  ledgerId: string,
  period: { month: string } | { from: string; to: string },
  limit: number = RANKING_DEFAULT_LIMIT,
): Promise<RankingItem[]> => {
  const range = "month" in period ? monthRange(period.month) : period;
  const entries = await deps.entryAnalysisRepository.listByDateRange(ledgerId, range.from, range.to);
  return buildRanking(entries, limit);
};

/** サブスク検知（FR-AI-07）。直近6ヶ月の明細から候補を抽出する。 */
export const getSubscriptions = async (
  deps: AnalysisDeps,
  ledgerId: string,
  asOfMonth: string,
): Promise<SubscriptionCandidate[]> => {
  const targetMonths = monthsBack(asOfMonth, SUBSCRIPTION_WINDOW_MONTHS);
  const range = monthRange(targetMonths[0]);
  const rangeEnd = monthRange(targetMonths[targetMonths.length - 1]);
  const entries = await deps.entryAnalysisRepository.listByDateRange(ledgerId, range.from, rangeEnd.to);

  const byMonth = new Map<string, typeof entries>();
  for (const targetMonth of targetMonths) {
    const { from, to } = monthRange(targetMonth);
    byMonth.set(
      targetMonth,
      entries.filter((entry) => entry.usedOn >= from && entry.usedOn <= to),
    );
  }
  return detectSubscriptions(byMonth);
};

export type { CategoryAmount };
