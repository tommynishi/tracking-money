import { describe, expect, it, vi } from "vitest";

import { getDashboard, getMonthlySummary, getRanking, getSubscriptions, getTrend } from "./analysisService";
import type { AnalysisEntry } from "../types";

const entry = (overrides: Partial<AnalysisEntry>): AnalysisEntry => ({
  id: "entry-1",
  usedOn: "2026-07-01",
  billingMonth: "2026-07",
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
  it("今月・前月・前年同月とカテゴリ別内訳を返す（支払月基準）", async () => {
    const listByBillingMonths = vi.fn().mockResolvedValue([
      entry({ amount: 300, billingMonth: "2026-07" }),
      entry({ amount: 100, billingMonth: "2026-06" }),
      entry({ amount: 900, billingMonth: "2025-07" }),
    ]);
    const deps = {
      entryAnalysisRepository: { listByBillingMonths },
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
    expect(listByBillingMonths).toHaveBeenCalledWith("ledger-1", ["2026-07", "2026-06", "2025-07"]);
  });
});

describe("getDashboard", () => {
  it("サマリーと直近明細をあわせて返す", async () => {
    const deps = {
      entryAnalysisRepository: { listByBillingMonths: vi.fn().mockResolvedValue([entry({ amount: 500 })]) },
      categoryRepository: { listByLedger: vi.fn().mockResolvedValue(categories) },
      entryRepository: { list: vi.fn().mockResolvedValue({ items: [{ id: "e1" }], totalCount: 1 }) },
    };

    const result = await getDashboard(deps, "ledger-1", "2026-07");
    expect(result.totalAmount).toBe(500);
    expect(result.recentEntries).toEqual([{ id: "e1" }]);
    expect(deps.entryRepository.list).toHaveBeenCalledWith(
      "ledger-1",
      expect.objectContaining({ filters: { billingMonth: "2026-07" }, perPage: 5 }),
    );
  });
});

describe("getTrend", () => {
  it("指定カテゴリの月次推移を古い順で返す", async () => {
    const deps = {
      entryAnalysisRepository: {
        listByBillingMonths: vi.fn().mockResolvedValue([
          entry({ billingMonth: "2026-06", categoryId: "cat-food", amount: 200 }),
          entry({ billingMonth: "2026-07", categoryId: "cat-food", amount: 300 }),
          entry({ billingMonth: "2026-07", categoryId: "cat-other", amount: 900 }),
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
  it("指定した支払月のランキングを返す", async () => {
    const deps = {
      entryAnalysisRepository: {
        listByBillingMonths: vi
          .fn()
          .mockResolvedValue([entry({ id: "1", amount: 100 }), entry({ id: "2", amount: 900 })]),
      },
      categoryRepository: { listByLedger: vi.fn() },
    };

    const result = await getRanking(deps, "ledger-1", "2026-07", 1);
    expect(result).toEqual([
      { entryId: "2", usedOn: "2026-07-01", description: "スーパーA", categoryName: "食費", amount: 900 },
    ]);
    expect(deps.entryAnalysisRepository.listByBillingMonths).toHaveBeenCalledWith("ledger-1", ["2026-07"]);
  });
});

describe("getSubscriptions", () => {
  it("直近6ヶ月の明細から候補を検知する", async () => {
    const deps = {
      entryAnalysisRepository: {
        listByBillingMonths: vi.fn().mockResolvedValue([
          entry({ billingMonth: "2026-05", normalizedDescription: "NETFLIX", amount: 1490 }),
          entry({ billingMonth: "2026-06", normalizedDescription: "NETFLIX", amount: 1490 }),
          entry({ billingMonth: "2026-07", normalizedDescription: "NETFLIX", amount: 1490 }),
        ]),
      },
      categoryRepository: { listByLedger: vi.fn() },
    };

    const result = await getSubscriptions(deps, "ledger-1", "2026-07");
    expect(result).toHaveLength(1);
    expect(result[0].normalizedDescription).toBe("NETFLIX");
  });
});
