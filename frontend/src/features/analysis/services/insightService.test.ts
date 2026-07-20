import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./aiInsightClient", () => ({
  generateInsight: vi.fn().mockResolvedValue({ summary: "要約", points: ["a", "b"] }),
}));

import { getInsight } from "./insightService";
import { generateInsight } from "./aiInsightClient";
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
];

const createDeps = () => ({
  entryAnalysisRepository: { listByDateRange: vi.fn().mockResolvedValue([entry({})]) },
  categoryRepository: { listByLedger: vi.fn().mockResolvedValue(categories) },
  cacheRepository: { get: vi.fn().mockResolvedValue(null), upsert: vi.fn().mockResolvedValue(undefined) },
});

describe("getInsight", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("キャッシュがなければ生成して保存する", async () => {
    const deps = createDeps();
    const result = await getInsight(deps, "ledger-1", "monthly_review", "2026-07");

    expect(generateInsight).toHaveBeenCalled();
    expect(result.insight).toEqual({ summary: "要約", points: ["a", "b"] });
    expect(deps.cacheRepository.upsert).toHaveBeenCalledWith(
      "ledger-1",
      "monthly_review",
      "2026-07",
      expect.any(String),
      expect.objectContaining({ type: "monthly_review", month: "2026-07" }),
    );
  });

  it("入力ハッシュが一致するキャッシュがあれば再利用する", async () => {
    const deps = createDeps();
    const cached = {
      type: "monthly_review" as const,
      month: "2026-07",
      generatedAt: "2026-07-01T00:00:00Z",
      insight: { summary: "キャッシュ済み", points: [] },
    };
    deps.cacheRepository.get.mockResolvedValue(cached);

    const result = await getInsight(deps, "ledger-1", "monthly_review", "2026-07");
    expect(result).toEqual(cached);
    expect(generateInsight).not.toHaveBeenCalled();
  });

  it("refresh 指定時はキャッシュを無視して再生成する", async () => {
    const deps = createDeps();
    deps.cacheRepository.get.mockResolvedValue({
      type: "monthly_review",
      month: "2026-07",
      generatedAt: "x",
      insight: { summary: "古い", points: [] },
    });

    const result = await getInsight(deps, "ledger-1", "monthly_review", "2026-07", true);
    expect(result.insight.summary).toBe("要約");
    expect(generateInsight).toHaveBeenCalled();
  });
});
