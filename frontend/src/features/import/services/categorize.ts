/**
 * 取込行のカテゴリ自動分類（FR-AICAT-01〜04・api.md 7.1）。
 * 優先順位：学習ルール（rule）→ AI判定（ai）→ その他へフォールバック（none）。
 * AI の失敗は取込全体を失敗させず、未判定行を「その他」にする（FR-AICAT-04）。
 */
import type { Category } from "@/features/category/types";

import type { CategoryRuleRepository } from "../repositories/categoryRuleRepository";

import type { PreviewRow } from "./duplicateCheck";

export type CategorySource = "rule" | "ai" | "none";

/** 分類済みのプレビュー行（SCR-09 でユーザーが修正できる・FR-AICAT-02）。 */
export type CategorizedRow = PreviewRow & {
  readonly categoryId: string;
  readonly categorySource: CategorySource;
};

/**
 * AI分類の抽象化（OpenAI 依存を注入可能にしテストではモックする）。
 * 摘要ごとに候補カテゴリ名のいずれかを返す。判定不能は null。障害時は throw してよい。
 */
export type AiCategoryClassifier = {
  classify(
    descriptions: readonly string[],
    categoryNames: readonly string[],
  ): Promise<readonly (string | null)[]>;
};

export type CategorizeDeps = {
  readonly ruleRepository: Pick<CategoryRuleRepository, "listByNormalizedDescriptions">;
  readonly classifier: AiCategoryClassifier;
};

/**
 * 行へカテゴリを割り当てる。分類先が見つからない行はシステムカテゴリ「その他」へ落とす。
 * カテゴリ一覧に isSystem が無い場合は設計違反のため例外とする。
 */
export const categorizeRows = async (
  deps: CategorizeDeps,
  ledgerId: string,
  rows: readonly PreviewRow[],
  categories: readonly Category[],
): Promise<CategorizedRow[]> => {
  const fallback = categories.find((category) => category.isSystem);
  if (fallback === undefined) {
    throw new Error("システムカテゴリ（その他）が見つかりません");
  }
  if (rows.length === 0) {
    return [];
  }

  const uniqueDescriptions = [...new Set(rows.map((row) => row.normalizedDescription))];
  const rules = await deps.ruleRepository.listByNormalizedDescriptions(
    ledgerId,
    uniqueDescriptions,
  );
  const ruleMap = new Map(rules.map((rule) => [rule.normalizedDescription, rule.categoryId]));

  // ルール未解決の摘要のみ AI へ渡す（重複摘要は1回だけ問い合わせる）
  const unresolved = uniqueDescriptions.filter((description) => !ruleMap.has(description));
  const aiMap = new Map<string, string>();
  if (unresolved.length > 0) {
    try {
      const names = categories.map((category) => category.name);
      const results = await deps.classifier.classify(unresolved, names);
      const byName = new Map(categories.map((category) => [category.name, category.id]));
      unresolved.forEach((description, index) => {
        const name = results[index];
        const categoryId = name === null ? undefined : byName.get(name);
        if (categoryId !== undefined) {
          aiMap.set(description, categoryId);
        }
      });
    } catch {
      // AI障害時は未解決のまま進める（FR-AICAT-04。行は「その他」になる）
    }
  }

  return rows.map((row) => {
    const ruleCategoryId = ruleMap.get(row.normalizedDescription);
    if (ruleCategoryId !== undefined) {
      return { ...row, categoryId: ruleCategoryId, categorySource: "rule" };
    }
    const aiCategoryId = aiMap.get(row.normalizedDescription);
    if (aiCategoryId !== undefined) {
      return { ...row, categoryId: aiCategoryId, categorySource: "ai" };
    }
    return { ...row, categoryId: fallback.id, categorySource: "none" };
  });
};
