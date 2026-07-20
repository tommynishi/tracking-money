import { describe, expect, it } from "vitest";

import { byCategory, buildRanking, buildTrend, detectSubscriptions, monthlyTotals } from "./aggregation";
import type { AnalysisEntry } from "../types";

const entry = (overrides: Partial<AnalysisEntry>): AnalysisEntry => ({
  id: "entry-1",
  usedOn: "2026-07-01",
  amount: 1000,
  categoryId: "cat-food",
  categoryName: "食費",
  description: "スーパーA",
  normalizedDescription: "スーパーA",
  ...overrides,
});

describe("byCategory", () => {
  it("categories の並び順で0円カテゴリも含めて返す", () => {
    const categories = [
      { id: "cat-other", name: "その他", sortOrder: 1 },
      { id: "cat-food", name: "食費", sortOrder: 0 },
    ];
    const entries = [entry({ categoryId: "cat-food", amount: 500 }), entry({ categoryId: "cat-food", amount: 300 })];

    expect(byCategory(entries, categories)).toEqual([
      { categoryId: "cat-food", categoryName: "食費", amount: 800 },
      { categoryId: "cat-other", categoryName: "その他", amount: 0 },
    ]);
  });
});

describe("monthlyTotals", () => {
  it("今月・前月・前年同月の合計を返す", () => {
    const result = monthlyTotals(
      [entry({ amount: 100 }), entry({ amount: 200 })],
      [entry({ amount: 50 })],
      [entry({ amount: 900 })],
    );
    expect(result).toEqual({ totalAmount: 300, prevMonthAmount: 50, prevYearSameMonthAmount: 900 });
  });
});

describe("buildTrend", () => {
  it("月ごとの合計を古い順で返す", () => {
    const byMonth = new Map([
      ["2026-05", [entry({ amount: 100 })]],
      ["2026-06", [entry({ amount: 200 })]],
      ["2026-07", []],
    ]);
    expect(buildTrend(byMonth, ["2026-05", "2026-06", "2026-07"])).toEqual([
      { month: "2026-05", amount: 100 },
      { month: "2026-06", amount: 200 },
      { month: "2026-07", amount: 0 },
    ]);
  });

  it("categoryId 指定でそのカテゴリのみ集計する", () => {
    const byMonth = new Map([
      ["2026-07", [entry({ categoryId: "cat-food", amount: 100 }), entry({ categoryId: "cat-other", amount: 900 })]],
    ]);
    expect(buildTrend(byMonth, ["2026-07"], "cat-food")).toEqual([{ month: "2026-07", amount: 100 }]);
  });
});

describe("buildRanking", () => {
  it("金額の大きい順に limit 件返す", () => {
    const entries = [entry({ id: "1", amount: 100 }), entry({ id: "2", amount: 900 }), entry({ id: "3", amount: 500 })];
    expect(buildRanking(entries, 2).map((r) => r.entryId)).toEqual(["2", "3"]);
  });
});

describe("detectSubscriptions", () => {
  it("3ヶ月以上同一摘要・同額のものを候補とする", () => {
    const byMonth = new Map([
      ["2026-05", [entry({ normalizedDescription: "NETFLIX", amount: 1490 })]],
      ["2026-06", [entry({ normalizedDescription: "NETFLIX", amount: 1490 })]],
      ["2026-07", [entry({ normalizedDescription: "NETFLIX", amount: 1490 }), entry({ normalizedDescription: "スーパーA", amount: 800 })]],
    ]);
    const result = detectSubscriptions(byMonth);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ normalizedDescription: "NETFLIX", monthlyAmount: 1490, annualAmount: 17880, occurrences: 3 });
  });

  it("2ヶ月以下は候補にしない", () => {
    const byMonth = new Map([
      ["2026-06", [entry({ normalizedDescription: "NETFLIX", amount: 1490 })]],
      ["2026-07", [entry({ normalizedDescription: "NETFLIX", amount: 1490 })]],
    ]);
    expect(detectSubscriptions(byMonth)).toEqual([]);
  });
});
