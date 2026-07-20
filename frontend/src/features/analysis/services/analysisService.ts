/**
 * 集計系分析サービス（api.md 9.1〜9.5・FR-AI-01〜07・FR-DASH-01）。
 * AIを使わずSQL/JS集計のみで完結する（AI所見は insightService に分離・FR-AI-11）。
 * 集計は支払月（billing_month）基準（利用日ではなく請求額として「今月いくら使うか」を把握する）。
 */
import type { CategoryRepository } from "@/features/category/repositories/categoryRepository";
import type { EntryRepository } from "@/features/entry/repositories/entryRepository";
import type { EntryListItem } from "@/features/entry/types";

import type { EntryAnalysisRepository } from "../repositories/entryAnalysisRepository";
import type {
  CategoryAmount,
  MonthlySummary,
  RankingItem,
  SubscriptionCandidate,
  TrendPoint,
} from "../types";
import { byCategory, buildRanking, buildTrend, detectSubscriptions, monthlyTotals } from "./aggregation";
import { monthsBack, shiftMonth } from "@/shared/utils/month";

export type AnalysisDeps = {
  readonly entryAnalysisRepository: Pick<EntryAnalysisRepository, "listByBillingMonths">;
  readonly categoryRepository: Pick<CategoryRepository, "listByLedger">;
};

const RECENT_ENTRIES_LIMIT = 5;
const RANKING_DEFAULT_LIMIT = 20;
const TREND_DEFAULT_MONTHS = 12;
const SUBSCRIPTION_WINDOW_MONTHS = 6;

/** 支払月ごとにグルーピングする。 */
const groupByBillingMonth = <T extends { readonly billingMonth: string }>(
  entries: readonly T[],
): Map<string, T[]> => {
  const map = new Map<string, T[]>();
  for (const entry of entries) {
    const list = map.get(entry.billingMonth) ?? [];
    list.push(entry);
    map.set(entry.billingMonth, list);
  }
  return map;
};

/** 月次サマリー（今月・前月・前年同月・カテゴリ別内訳）を算出する（FR-AI-01〜03）。 */
export const getMonthlySummary = async (
  deps: AnalysisDeps,
  ledgerId: string,
  month: string,
): Promise<MonthlySummary> => {
  const prevMonth = shiftMonth(month, -1);
  const prevYear = shiftMonth(month, -12);

  const [entries, categories] = await Promise.all([
    deps.entryAnalysisRepository.listByBillingMonths(ledgerId, [month, prevMonth, prevYear]),
    deps.categoryRepository.listByLedger(ledgerId),
  ]);
  const byMonth = groupByBillingMonth(entries);

  const totals = monthlyTotals(
    byMonth.get(month) ?? [],
    byMonth.get(prevMonth) ?? [],
    byMonth.get(prevYear) ?? [],
  );
  return {
    month,
    ...totals,
    byCategory: byCategory(byMonth.get(month) ?? [], categories),
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
      filters: { billingMonth: month },
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
  const entries = await deps.entryAnalysisRepository.listByBillingMonths(ledgerId, targetMonths);
  const byMonth = groupByBillingMonth(entries);
  return buildTrend(byMonth, targetMonths, categoryId);
};

/** 支出ランキング（FR-AI-05）。指定した支払月内で金額の大きい順に返す。 */
export const getRanking = async (
  deps: AnalysisDeps,
  ledgerId: string,
  billingMonth: string,
  limit: number = RANKING_DEFAULT_LIMIT,
): Promise<RankingItem[]> => {
  const entries = await deps.entryAnalysisRepository.listByBillingMonths(ledgerId, [billingMonth]);
  return buildRanking(entries, limit);
};

/** サブスク検知（FR-AI-07）。直近6ヶ月の明細から候補を抽出する。 */
export const getSubscriptions = async (
  deps: AnalysisDeps,
  ledgerId: string,
  asOfMonth: string,
): Promise<SubscriptionCandidate[]> => {
  const targetMonths = monthsBack(asOfMonth, SUBSCRIPTION_WINDOW_MONTHS);
  const entries = await deps.entryAnalysisRepository.listByBillingMonths(ledgerId, targetMonths);
  const byMonth = groupByBillingMonth(entries);
  return detectSubscriptions(byMonth);
};

export type { CategoryAmount };
