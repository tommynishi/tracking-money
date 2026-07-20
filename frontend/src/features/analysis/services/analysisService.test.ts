import { describe, expect, it, vi } from "vitest";

import { getDashboard, getMonthlySummary, getRanking, getSubscriptions, getTrend } from "./analysisService";
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

const categories = [
  { id: "cat-food", ledgerId: "ledger-1", name: "食費", isFixedCost: false, isSystem: false, sortOrder: 0, createdAt: "", updatedAt: "" },
  { id: "cat-other", ledgerId: "ledger-1", name: "その他", isFixedCost: false, isSystem: true, sortOrder: 1, createdAt: "", updatedAt: "" },
];

describe("getMonthlySummary", () => {
  it("今月・前月・前年同月とカテゴリ別内訳を返す", async () => {
    const listByDateRange = vi
      .fn()
      .mockResolvedValueOnce([entry({ amount: 300 })]) // 今月
      .mockResolvedValueOnce([entry({ amount: 100 })]) // 前月
      .mockResolvedValueOnce([entry({ amount: 900 })]); // 前年同月
    const deps = {
      entryAnalysisRepository: { listByDateRange },
      categoryRepository: { listByLedger: vi.fn().mockResolvedValue(categories) },
    };

    const result = await getMonthlySummary(deps, "ledger-1", "2026-07");
    expect(result).toEqual({
      month: "2026-07",
      totalAmount: 300,
      prevMonthAmount: 100,
      prevYearSameMonthAmount: 900,
      byCategory: [
        { categoryId: "cat-food", categoryName: "食費", amount: 300 },
        { categoryId: "cat-other", categoryName: "その他", amount: 0 },
      ],
    });
    expect(listByDateRange).toHaveBeenNthCalledWith(1, "ledger-1", "2026-07-01", "2026-07-31");
    expect(listByDateRange).toHaveBeenNthCalledWith(2, "ledger-1", "2026-06-01", "2026-06-30");
    expect(listByDateRange).toHaveBeenNthCalledWith(3, "ledger-1", "2025-07-01", "2025-07-31");
  });
});

describe("getDashboard", () => {
  it("サマリーと直近明細をあわせて返す", async () => {
    const deps = {
      entryAnalysisRepository: { listByDateRange: vi.fn().mockResolvedValue([entry({ amount: 500 })]) },
      categoryRepository: { listByLedger: vi.fn().mockResolvedValue(categories) },
      entryRepository: { list: vi.fn().mockResolvedValue({ items: [{ id: "e1" }], totalCount: 1 }) },
    };

    const result = await getDashboard(deps, "ledger-1", "2026-07");
    expect(result.totalAmount).toBe(500);
    expect(result.recentEntries).toEqual([{ id: "e1" }]);
    expect(deps.entryRepository.list).toHaveBeenCalledWith(
      "ledger-1",
      expect.objectContaining({ filters: { month: "2026-07" }, perPage: 5 }),
    );
  });
});

describe("getTrend", () => {
  it("指定カテゴリの月次推移を古い順で返す", async () => {
    const deps = {
      entryAnalysisRepository: {
        listByDateRange: vi.fn().mockResolvedValue([
          entry({ usedOn: "2026-06-10", categoryId: "cat-food", amount: 200 }),
          entry({ usedOn: "2026-07-10", categoryId: "cat-food", amount: 300 }),
          entry({ usedOn: "2026-07-10", categoryId: "cat-other", amount: 900 }),
        ]),
      },
      categoryRepository: { listByLedger: vi.fn() },
    };

    const result = await getTrend(deps, "ledger-1", "2026-07", 2, "cat-food");
    expect(result).toEqual([
      { month: "2026-06", amount: 200 },
      { month: "2026-07", amount: 300 },
    ]);
  });
});

describe("getRanking", () => {
  it("month 指定でランキングを返す", async () => {
    const deps = {
      entryAnalysisRepository: {
        listByDateRange: vi.fn().mockResolvedValue([entry({ id: "1", amount: 100 }), entry({ id: "2", amount: 900 })]),
      },
      categoryRepository: { listByLedger: vi.fn() },
    };

    const result = await getRanking(deps, "ledger-1", { month: "2026-07" }, 1);
    expect(result).toEqual([
      { entryId: "2", usedOn: "2026-07-01", description: "スーパーA", categoryName: "食費", amount: 900 },
    ]);
  });
});

describe("getSubscriptions", () => {
  it("直近6ヶ月の明細から候補を検知する", async () => {
    const deps = {
      entryAnalysisRepository: {
        listByDateRange: vi.fn().mockResolvedValue([
          entry({ usedOn: "2026-05-05", normalizedDescription: "NETFLIX", amount: 1490 }),
          entry({ usedOn: "2026-06-05", normalizedDescription: "NETFLIX", amount: 1490 }),
          entry({ usedOn: "2026-07-05", normalizedDescription: "NETFLIX", amount: 1490 }),
        ]),
      },
      categoryRepository: { listByLedger: vi.fn() },
    };

    const result = await getSubscriptions(deps, "ledger-1", "2026-07");
    expect(result).toHaveLength(1);
    expect(result[0].normalizedDescription).toBe("NETFLIX");
  });
});
