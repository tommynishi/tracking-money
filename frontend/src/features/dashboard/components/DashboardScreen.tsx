"use client";

/**
 * SCR-02 ダッシュボード（screen.md・FR-DASH-01/02）。
 * 今月支出合計・前月比・前年同月比・カテゴリ別内訳・直近明細・AI所見サマリーを表示する。
 */
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import { apiFetch } from "@/shared/api/client";
import { Button } from "@/shared/components/Button";
import { formatAmount, formatDateList } from "@/shared/utils/format";
import { currentBillingMonth } from "@/shared/utils/month";

import { LedgerSetup } from "@/features/ledger/components/LedgerSetup";
import { useActiveLedger } from "@/features/ledger/context/ActiveLedgerProvider";

type CategoryAmount = { readonly categoryId: string; readonly categoryName: string; readonly amount: number };
type RecentEntry = {
  readonly id: string;
  readonly usedOn: string;
  readonly description: string;
  readonly amount: number;
  readonly category: { readonly name: string };
};
type DashboardData = {
  readonly totalAmount: number;
  readonly prevMonthAmount: number;
  readonly prevYearSameMonthAmount: number;
  readonly byCategory: CategoryAmount[];
  readonly recentEntries: RecentEntry[];
};
type Insight = { readonly insight: { readonly summary: string } };

type LoadState = "loading" | "ready" | "error";

const currentMonth = (): string => currentBillingMonth();

/** 前月比・前年同月比の増減表示（+12.3% 等）。基準が0円のときは表示しない。 */
const diffRate = (current: number, base: number): string | null => {
  if (base === 0) return null;
  const rate = ((current - base) / base) * 100;
  const sign = rate > 0 ? "+" : "";
  return `${sign}${rate.toFixed(1)}%`;
};

export const DashboardScreen = () => {
  const {
    activeLedgerId: ledgerId,
    ledgers,
    state: ledgerState,
    reload: reloadLedgers,
  } = useActiveLedger();

  const [month] = useState(currentMonth());
  const [data, setData] = useState<DashboardData | null>(null);
  const [dataState, setDataState] = useState<LoadState>("loading");

  const [insight, setInsight] = useState<Insight | null>(null);
  const [insightState, setInsightState] = useState<LoadState>("loading");

  const loadDashboard = useCallback((): Promise<void> => {
    if (ledgerId === null) return Promise.resolve();
    return apiFetch<DashboardData>(`/api/ledgers/${ledgerId}/dashboard?month=${month}`)
      .then(({ data: dashboard }) => {
        setData(dashboard);
        setDataState("ready");
      })
      .catch(() => setDataState("error"));
  }, [ledgerId, month]);

  useEffect(() => {
    void loadDashboard();
  }, [loadDashboard]);

  useEffect(() => {
    if (ledgerId === null) return;
    apiFetch<Insight>(
      `/api/ledgers/${ledgerId}/analysis/insight?type=monthly_review&month=${month}`,
    )
      .then(({ data: result }) => {
        setInsight(result);
        setInsightState("ready");
      })
      .catch(() => setInsightState("error"));
  }, [ledgerId, month]);

  if (ledgerState === "loading") {
    return <div className="h-40 animate-pulse rounded-lg border border-border bg-surface" />;
  }
  if (ledgerState === "error") {
    return (
      <section className="rounded-lg border border-border bg-surface p-6 text-center">
        <p className="text-sm text-danger">家計簿情報の取得に失敗しました。</p>
        <Button className="mt-4" variant="secondary" onClick={() => void reloadLedgers()}>
          再試行
        </Button>
      </section>
    );
  }
  if (ledgers.length === 0) {
    return <LedgerSetup onCreated={() => void reloadLedgers()} />;
  }
  if (ledgerId === null) return null;

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-lg font-semibold text-foreground">ダッシュボード</h1>
        <Link href="/entries">
          <Button>明細を追加</Button>
        </Link>
      </div>

      {dataState === "error" ? (
        <div className="rounded-lg border border-border bg-surface p-6 text-center">
          <p className="text-sm text-danger">集計の取得に失敗しました。</p>
          <Button className="mt-4" variant="secondary" onClick={() => void loadDashboard()}>
            再試行
          </Button>
        </div>
      ) : dataState === "loading" || data === null ? (
        <div className="h-64 animate-pulse rounded-lg border border-border bg-surface" />
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="rounded-lg border border-border bg-surface p-4">
              <p className="text-xs text-muted">今月の支出合計</p>
              <p className="mt-1 text-2xl font-semibold text-foreground">
                {formatAmount(data.totalAmount)}
              </p>
            </div>
            <div className="rounded-lg border border-border bg-surface p-4">
              <p className="text-xs text-muted">前月比</p>
              <p className="mt-1 text-lg font-medium text-foreground">
                {diffRate(data.totalAmount, data.prevMonthAmount) ?? "—"}
              </p>
              <p className="text-xs text-muted">{formatAmount(data.prevMonthAmount)}</p>
            </div>
            <div className="rounded-lg border border-border bg-surface p-4">
              <p className="text-xs text-muted">前年同月比</p>
              <p className="mt-1 text-lg font-medium text-foreground">
                {diffRate(data.totalAmount, data.prevYearSameMonthAmount) ?? "—"}
              </p>
              <p className="text-xs text-muted">{formatAmount(data.prevYearSameMonthAmount)}</p>
            </div>
          </div>

          <div className="rounded-lg border border-border bg-surface p-4">
            <h2 className="text-sm font-semibold text-foreground">カテゴリ別内訳</h2>
            <ul className="mt-3 space-y-2">
              {data.byCategory
                .filter((c) => c.amount > 0)
                .map((category) => {
                  const ratio = data.totalAmount === 0 ? 0 : (category.amount / data.totalAmount) * 100;
                  return (
                    <li key={category.categoryId}>
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-foreground">{category.categoryName}</span>
                        <span className="text-muted">{formatAmount(category.amount)}</span>
                      </div>
                      <div
                        role="progressbar"
                        aria-valuenow={Math.round(ratio)}
                        aria-valuemin={0}
                        aria-valuemax={100}
                        aria-label={`${category.categoryName} ${Math.round(ratio)}%`}
                        className="mt-1 h-2 w-full overflow-hidden rounded-full bg-background"
                      >
                        <div className="h-full rounded-full bg-primary" style={{ width: `${ratio}%` }} />
                      </div>
                    </li>
                  );
                })}
              {data.byCategory.every((c) => c.amount === 0) && (
                <p className="text-sm text-muted">今月の明細はまだありません。</p>
              )}
            </ul>
          </div>

          <div className="rounded-lg border border-border bg-surface p-4">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-foreground">AI所見</h2>
              <Link href="/analysis" className="text-xs text-primary hover:underline">
                分析を見る
              </Link>
            </div>
            {insightState === "loading" ? (
              <div className="mt-2 h-4 w-3/4 animate-pulse rounded bg-background" />
            ) : insightState === "error" || insight === null ? (
              <p className="mt-2 text-sm text-muted">AI所見は現在ご利用いただけません（OpenAI未設定）。</p>
            ) : (
              <p className="mt-2 text-sm text-foreground">{insight.insight.summary}</p>
            )}
          </div>

          <div className="rounded-lg border border-border bg-surface p-4">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-foreground">直近の明細</h2>
              <Link href="/entries" className="text-xs text-primary hover:underline">
                すべて見る
              </Link>
            </div>
            {data.recentEntries.length === 0 ? (
              <p className="mt-2 text-sm text-muted">まだ明細がありません。</p>
            ) : (
              <ul className="mt-2 divide-y divide-border">
                {data.recentEntries.map((entry) => (
                  <li key={entry.id} className="flex items-center justify-between py-2 text-sm">
                    <div>
                      <p className="text-foreground">{entry.description}</p>
                      <p className="text-xs text-muted">
                        {formatDateList(entry.usedOn)} ・ {entry.category.name}
                      </p>
                    </div>
                    <span className="font-medium text-foreground">{formatAmount(entry.amount)}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </>
      )}
    </section>
  );
};
