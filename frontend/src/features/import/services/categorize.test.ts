import { describe, expect, it, vi } from "vitest";

import type { Category } from "@/features/category/types";

import { categorizeRows } from "./categorize";
import type { PreviewRow } from "./duplicateCheck";

const category = (id: string, name: string, isSystem = false): Category => ({
  id,
  ledgerId: "ledger-1",
  name,
  isFixedCost: false,
  isSystem,
  sortOrder: 0,
  createdAt: "",
  updatedAt: "",
});

const categories = [
  category("cat-food", "食費"),
  category("cat-daily", "日用品"),
  category("cat-other", "その他", true),
];

const row = (rowNumber: number, description: string): PreviewRow => ({
  rowNumber,
  usedOn: "2026-06-01",
  amount: 100,
  description,
  normalizedDescription: description,
  duplicate: null,
});

describe("categorizeRows", () => {
  it("学習ルールを最優先し、未解決分のみAIへ渡す（FR-AICAT-03）", async () => {
    const ruleRepository = {
      listByNormalizedDescriptions: vi.fn().mockResolvedValue([
        {
          id: "r1",
          ledgerId: "ledger-1",
          normalizedDescription: "すき家",
          categoryId: "cat-food",
        },
      ]),
    };
    const classifier = { classify: vi.fn().mockResolvedValue(["日用品"]) };

    const rows = await categorizeRows({ ruleRepository, classifier }, "ledger-1", [
      row(1, "すき家"),
      row(2, "ドラッグストアA"),
    ], categories);

    expect(rows[0]).toMatchObject({ categoryId: "cat-food", categorySource: "rule" });
    expect(rows[1]).toMatchObject({ categoryId: "cat-daily", categorySource: "ai" });
    expect(classifier.classify).toHaveBeenCalledWith(["ドラッグストアA"], [
      "食費",
      "日用品",
      "その他",
    ]);
  });

  it("AIが null・未知カテゴリ名を返した行は「その他」へフォールバックする", async () => {
    const ruleRepository = { listByNormalizedDescriptions: vi.fn().mockResolvedValue([]) };
    const classifier = { classify: vi.fn().mockResolvedValue([null, "存在しないカテゴリ"]) };

    const rows = await categorizeRows({ ruleRepository, classifier }, "ledger-1", [
      row(1, "不明店A"),
      row(2, "不明店B"),
    ], categories);

    expect(rows.map((r) => r.categorySource)).toEqual(["none", "none"]);
    expect(rows.map((r) => r.categoryId)).toEqual(["cat-other", "cat-other"]);
  });

  it("AI障害時も取込を継続し、未解決行は「その他」になる（FR-AICAT-04）", async () => {
    const ruleRepository = { listByNormalizedDescriptions: vi.fn().mockResolvedValue([]) };
    const classifier = { classify: vi.fn().mockRejectedValue(new Error("AI down")) };

    const rows = await categorizeRows({ ruleRepository, classifier }, "ledger-1", [
      row(1, "店A"),
    ], categories);

    expect(rows[0]).toMatchObject({ categoryId: "cat-other", categorySource: "none" });
  });

  it("同じ摘要はAIへ1回だけ問い合わせる", async () => {
    const ruleRepository = { listByNormalizedDescriptions: vi.fn().mockResolvedValue([]) };
    const classifier = { classify: vi.fn().mockResolvedValue(["食費"]) };

    const rows = await categorizeRows({ ruleRepository, classifier }, "ledger-1", [
      row(1, "コンビニA"),
      row(2, "コンビニA"),
    ], categories);

    expect(classifier.classify).toHaveBeenCalledTimes(1);
    expect(classifier.classify).toHaveBeenCalledWith(["コンビニA"], expect.anything());
    expect(rows.map((r) => r.categoryId)).toEqual(["cat-food", "cat-food"]);
  });

  it("システムカテゴリが無い場合は例外（設計違反の検知）", async () => {
    const ruleRepository = { listByNormalizedDescriptions: vi.fn() };
    const classifier = { classify: vi.fn() };
    await expect(
      categorizeRows({ ruleRepository, classifier }, "ledger-1", [row(1, "店A")], [
        category("cat-food", "食費"),
      ]),
    ).rejects.toThrow("システムカテゴリ");
  });
});
