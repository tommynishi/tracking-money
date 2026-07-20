"use client";

/**
 * SCR-11 分析（screen.md・FR-AI-01〜09）。タブ切替で各分析を表示する。
 * 集計・グラフは即時表示し、AI所見は遅延ロード（AI失敗時も集計は表示・FR-AI-11）。
 */
import { useCallback, useEffect, useState } from "react";

import { apiFetch } from "@/shared/api/client";
import { Button } from "@/shared/components/Button";
import { formatAmount, formatDateList } from "@/shared/utils/format";
import { todayInJst } from "@/shared/utils/month";

import { LedgerSetup } from "@/features/ledger/components/LedgerSetup";

type Me = { readonly personalLedgerId: string | null; readonly familyLedgerId: string | null };
type LoadState = "loading" | "ready" | "error";

type CategoryAmount = { readonly categoryId: string; readonly categoryName: string; readonly amount: number };
type Summary = {
  readonly totalAmount: number;
  readonly prevMonthAmount: number;
  readonly prevYearSameMonthAmount: number;
  readonly byCategory: CategoryAmount[];
};
type TrendPoint = { readonly month: string; readonly amount: number };
type RankingItem = {
  readonly entryId: string;
  readonly usedOn: string;
  readonly description: string;
  readonly categoryName: string;
  readonly amount: number;
};
type SubscriptionCandidate = {
  readonly normalizedDescription: string;
  readonly description: string;
  readonly categoryName: string;
  readonly monthlyAmount: number;
  readonly annualAmount: number;
  readonly occurrences: number;
};
type Insight = { readonly generatedAt: string; readonly insight: { readonly summary: string; readonly points: string[] } };

type Tab = "summary" | "trend" | "ranking" | "fixed_cost" | "subscriptions" | "advice";

const TABS: { readonly key: Tab; readonly label: string }[] = [
  { key: "summary", label: "月次サマリー" },
  { key: "trend", label: "推移" },
  { key: "ranking", label: "ランキング" },
  { key: "fixed_cost", label: "固定費" },
  { key: "subscriptions", label: "サブスク" },
  { key: "advice", label: "提案・予測" },
];

const currentMonth = (): string => todayInJst().slice(0, 7);

/** AI所見（種別ごと）を遅延取得するカード。再生成ボタン付き。 */
const InsightCard = ({ ledgerId, type, month }: { ledgerId: string; type: string; month: string }) => {
  const [state, setState] = useState<LoadState>("loading");
  const [insight, setInsight] = useState<Insight | null>(null);

  const fetchInsight = useCallback(
    (refresh: boolean): Promise<void> =>
      apiFetch<Insight>(
        `/api/ledgers/${ledgerId}/analysis/insight?type=${type}&month=${month}${refresh ? "&refresh=true" : ""}`,
      )
        .then(({ data }) => {
          setInsight(data);
          setState("ready");
        })
        .catch(() => setState("error")),
    [ledgerId, type, month],
  );

  useEffect(() => {
    void fetchInsight(false);
  }, [fetchInsight]);

  const handleRefresh = (): void => {
    setState("loading");
    void fetchInsight(true);
  };

  return (
    <div className="rounded-lg border border-border bg-surface p-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-foreground">AI所見</h3>
        <Button variant="ghost" isLoading={state === "loading"} onClick={handleRefresh}>
          再生成
        </Button>
      </div>
      {state === "loading" ? (
        <div className="mt-2 h-4 w-3/4 animate-pulse rounded bg-background" />
      ) : state === "error" || insight === null ? (
        <p className="mt-2 text-sm text-muted">AI所見を取得できませんでした。</p>
      ) : (
        <>
          <p className="mt-2 text-sm text-foreground">{insight.insight.summary}</p>
          <ul className="mt-2 list-inside list-disc space-y-1 text-sm text-muted">
            {insight.insight.points.map((point, index) => (
              <li key={index}>{point}</li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
};

const CategoryBreakdown = ({ byCategory, totalAmount }: { byCategory: CategoryAmount[]; totalAmount: number }) => (
  <ul className="space-y-2">
    {byCategory
      .filter((c) => c.amount > 0)
      .map((category) => {
        const ratio = totalAmount === 0 ? 0 : (category.amount / totalAmount) * 100;
        return (
          <li key={category.categoryId}>
            <div className="flex items-center justify-between text-sm">
              <span className="text-foreground">{category.categoryName}</span>
              <span className="text-muted">{formatAmount(category.amount)}</span>
            </div>
            <div className="mt-1 h-2 w-full overflow-hidden rounded-full bg-background">
              <div className="h-full rounded-full bg-primary" style={{ width: `${ratio}%` }} />
            </div>
          </li>
        );
      })}
    {byCategory.every((c) => c.amount === 0) && <p className="text-sm text-muted">対象期間の明細はありません。</p>}
  </ul>
);

const TrendChart = ({ points }: { points: TrendPoint[] }) => {
  const max = Math.max(1, ...points.map((p) => p.amount));
  return (
    <div className="flex items-end gap-2 overflow-x-auto pb-2" role="img" aria-label="カテゴリ別の月次推移グラフ">
      {points.map((point) => (
        <div key={point.month} className="flex min-w-12 flex-col items-center gap-1">
          <span className="text-xs text-muted">{formatAmount(point.amount)}</span>
          <div className="flex h-32 w-8 items-end rounded bg-background">
            <div
              className="w-full rounded bg-primary"
              style={{ height: `${(point.amount / max) * 100}%` }}
            />
          </div>
          <span className="text-xs text-muted">{point.month.slice(5)}月</span>
        </div>
      ))}
    </div>
  );
};

export const AnalysisScreen = () => {
  const [ledgerId, setLedgerId] = useState<string | null>(null);
  const [meState, setMeState] = useState<LoadState>("loading");
  const [needsSetup, setNeedsSetup] = useState(false);
  const [month, setMonth] = useState(currentMonth());
  const [tab, setTab] = useState<Tab>("summary");

  useEffect(() => {
    apiFetch<Me>("/api/me")
      .then(({ data }) => {
        const resolved = data.personalLedgerId ?? data.familyLedgerId;
        if (resolved === null) {
          setNeedsSetup(true);
        } else {
          setLedgerId(resolved);
        }
        setMeState("ready");
      })
      .catch(() => setMeState("error"));
  }, []);

  if (meState === "loading") {
    return <div className="h-40 animate-pulse rounded-lg border border-border bg-surface" />;
  }
  if (meState === "error") {
    return (
      <section className="rounded-lg border border-border bg-surface p-6 text-center">
        <p className="text-sm text-danger">ユーザー情報の取得に失敗しました。</p>
      </section>
    );
  }
  if (needsSetup) {
    return <LedgerSetup onCreated={(createdLedgerId) => { setNeedsSetup(false); setLedgerId(createdLedgerId); }} />;
  }
  if (ledgerId === null) return null;

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-lg font-semibold text-foreground">分析</h1>
        <div>
          <label htmlFor="analysis-month" className="sr-only">
            対象月
          </label>
          <input
            id="analysis-month"
            type="month"
            value={month}
            onChange={(event) => setMonth(event.target.value)}
            className="rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground"
          />
        </div>
      </div>

      <div role="tablist" aria-label="分析タブ" className="flex flex-wrap gap-2 border-b border-border pb-2">
        {TABS.map((t) => (
          <button
            key={t.key}
            role="tab"
            aria-selected={tab === t.key}
            onClick={() => setTab(t.key)}
            className={`rounded-md px-3 py-2 text-sm font-medium ${
              tab === t.key ? "bg-primary text-primary-foreground" : "text-muted hover:text-foreground"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "summary" && <SummaryTab ledgerId={ledgerId} month={month} />}
      {tab === "trend" && <TrendTab ledgerId={ledgerId} month={month} />}
      {tab === "ranking" && <RankingTab ledgerId={ledgerId} month={month} />}
      {tab === "fixed_cost" && (
        <>
          <InsightCard ledgerId={ledgerId} type="fixed_cost" month={month} />
        </>
      )}
      {tab === "subscriptions" && <SubscriptionsTab ledgerId={ledgerId} month={month} />}
      {tab === "advice" && (
        <div className="space-y-4">
          <InsightCard ledgerId={ledgerId} type="saving_advice" month={month} />
          <InsightCard ledgerId={ledgerId} type="forecast" month={month} />
        </div>
      )}
    </section>
  );
};

const SummaryTab = ({ ledgerId, month }: { ledgerId: string; month: string }) => {
  const [state, setState] = useState<LoadState>("loading");
  const [summary, setSummary] = useState<Summary | null>(null);

  const fetchSummary = useCallback(
    (): Promise<void> =>
      apiFetch<Summary>(`/api/ledgers/${ledgerId}/analysis/summary?month=${month}`)
        .then(({ data }) => {
          setSummary(data);
          setState("ready");
        })
        .catch(() => setState("error")),
    [ledgerId, month],
  );

  useEffect(() => {
    void fetchSummary();
  }, [fetchSummary]);

  const handleRetry = (): void => {
    setState("loading");
    void fetchSummary();
  };

  if (state === "loading" || summary === null) {
    return <div className="h-40 animate-pulse rounded-lg border border-border bg-surface" />;
  }
  if (state === "error") {
    return (
      <div className="rounded-lg border border-border bg-surface p-6 text-center">
        <p className="text-sm text-danger">集計の取得に失敗しました。</p>
        <Button className="mt-4" variant="secondary" onClick={handleRetry}>
          再試行
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-lg border border-border bg-surface p-4">
          <p className="text-xs text-muted">今月の支出合計</p>
          <p className="mt-1 text-xl font-semibold text-foreground">{formatAmount(summary.totalAmount)}</p>
        </div>
        <div className="rounded-lg border border-border bg-surface p-4">
          <p className="text-xs text-muted">前月</p>
          <p className="mt-1 text-xl font-semibold text-foreground">{formatAmount(summary.prevMonthAmount)}</p>
        </div>
        <div className="rounded-lg border border-border bg-surface p-4">
          <p className="text-xs text-muted">前年同月</p>
          <p className="mt-1 text-xl font-semibold text-foreground">
            {formatAmount(summary.prevYearSameMonthAmount)}
          </p>
        </div>
      </div>
      <div className="rounded-lg border border-border bg-surface p-4">
        <h2 className="text-sm font-semibold text-foreground">カテゴリ別内訳</h2>
        <div className="mt-3">
          <CategoryBreakdown byCategory={summary.byCategory} totalAmount={summary.totalAmount} />
        </div>
      </div>
      <InsightCard ledgerId={ledgerId} type="monthly_review" month={month} />
    </div>
  );
};

const TrendTab = ({ ledgerId, month }: { ledgerId: string; month: string }) => {
  const [state, setState] = useState<LoadState>("loading");
  const [points, setPoints] = useState<TrendPoint[]>([]);

  useEffect(() => {
    apiFetch<TrendPoint[]>(`/api/ledgers/${ledgerId}/analysis/trend?month=${month}&months=12`)
      .then(({ data }) => {
        setPoints(data);
        setState("ready");
      })
      .catch(() => setState("error"));
  }, [ledgerId, month]);

  if (state === "loading") {
    return <div className="h-40 animate-pulse rounded-lg border border-border bg-surface" />;
  }
  if (state === "error") {
    return (
      <div className="rounded-lg border border-border bg-surface p-6 text-center">
        <p className="text-sm text-danger">推移の取得に失敗しました。</p>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-border bg-surface p-4">
      <h2 className="text-sm font-semibold text-foreground">カテゴリ別の月次推移（直近12ヶ月）</h2>
      <div className="mt-3">
        <TrendChart points={points} />
      </div>
    </div>
  );
};

const RankingTab = ({ ledgerId, month }: { ledgerId: string; month: string }) => {
  const [state, setState] = useState<LoadState>("loading");
  const [items, setItems] = useState<RankingItem[]>([]);

  useEffect(() => {
    apiFetch<RankingItem[]>(`/api/ledgers/${ledgerId}/analysis/ranking?month=${month}`)
      .then(({ data }) => {
        setItems(data);
        setState("ready");
      })
      .catch(() => setState("error"));
  }, [ledgerId, month]);

  if (state === "loading") {
    return <div className="h-40 animate-pulse rounded-lg border border-border bg-surface" />;
  }
  if (state === "error") {
    return (
      <div className="rounded-lg border border-border bg-surface p-6 text-center">
        <p className="text-sm text-danger">ランキングの取得に失敗しました。</p>
      </div>
    );
  }
  if (items.length === 0) {
    return (
      <div className="rounded-lg border border-border bg-surface p-6 text-center">
        <p className="text-sm text-muted">対象期間の明細はありません。</p>
      </div>
    );
  }

  return (
    <ol className="divide-y divide-border rounded-lg border border-border bg-surface">
      {items.map((item, index) => (
        <li key={item.entryId} className="flex items-center justify-between gap-3 px-4 py-3 text-sm">
          <div className="flex items-center gap-3">
            <span className="w-6 text-right text-muted">{index + 1}</span>
            <div>
              <p className="text-foreground">{item.description}</p>
              <p className="text-xs text-muted">
                {formatDateList(item.usedOn)} ・ {item.categoryName}
              </p>
            </div>
          </div>
          <span className="font-medium text-foreground">{formatAmount(item.amount)}</span>
        </li>
      ))}
    </ol>
  );
};

const SubscriptionsTab = ({ ledgerId, month }: { ledgerId: string; month: string }) => {
  const [state, setState] = useState<LoadState>("loading");
  const [candidates, setCandidates] = useState<SubscriptionCandidate[]>([]);

  useEffect(() => {
    apiFetch<SubscriptionCandidate[]>(`/api/ledgers/${ledgerId}/analysis/subscriptions?month=${month}`)
      .then(({ data }) => {
        setCandidates(data);
        setState("ready");
      })
      .catch(() => setState("error"));
  }, [ledgerId, month]);

  if (state === "loading") {
    return <div className="h-40 animate-pulse rounded-lg border border-border bg-surface" />;
  }
  if (state === "error") {
    return (
      <div className="rounded-lg border border-border bg-surface p-6 text-center">
        <p className="text-sm text-danger">サブスク検知の取得に失敗しました。</p>
      </div>
    );
  }
  if (candidates.length === 0) {
    return (
      <div className="rounded-lg border border-border bg-surface p-6 text-center">
        <p className="text-sm text-muted">サブスク候補は検知されませんでした。</p>
      </div>
    );
  }

  return (
    <ul className="divide-y divide-border rounded-lg border border-border bg-surface">
      {candidates.map((candidate) => (
        <li key={candidate.normalizedDescription} className="flex items-center justify-between gap-3 px-4 py-3 text-sm">
          <div>
            <p className="text-foreground">{candidate.description}</p>
            <p className="text-xs text-muted">
              {candidate.categoryName} ・ 直近{candidate.occurrences}ヶ月連続
            </p>
          </div>
          <div className="text-right">
            <p className="font-medium text-foreground">{formatAmount(candidate.monthlyAmount)}/月</p>
            <p className="text-xs text-muted">年換算 {formatAmount(candidate.annualAmount)}</p>
          </div>
        </li>
      ))}
    </ul>
  );
};
