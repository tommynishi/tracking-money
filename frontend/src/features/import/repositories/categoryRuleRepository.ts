/**
 * category_rules の Repository（database.md 3.9・FR-AICAT-03）。
 * ユーザーが確定時に修正した「正規化摘要→カテゴリ」を保存し、次回取込で AI 判定より優先する。
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

import { isUniqueViolation } from "@/shared/lib/dbErrorCodes";

const TABLE = "category_rules";
const COLUMNS = "id, ledger_id, normalized_description, category_id";

const rowSchema = z.object({
  id: z.uuid(),
  ledger_id: z.uuid(),
  normalized_description: z.string(),
  category_id: z.uuid(),
});

export type CategoryRule = {
  readonly id: string;
  readonly ledgerId: string;
  readonly normalizedDescription: string;
  readonly categoryId: string;
};

const toRule = (row: z.infer<typeof rowSchema>): CategoryRule => ({
  id: row.id,
  ledgerId: row.ledger_id,
  normalizedDescription: row.normalized_description,
  categoryId: row.category_id,
});

export type CategoryRuleRepository = {
  /** 正規化摘要の集合に一致するルールを返す（取込時の一括照会用）。 */
  listByNormalizedDescriptions(
    ledgerId: string,
    normalizedDescriptions: readonly string[],
  ): Promise<CategoryRule[]>;
  /** ルールを保存する。同じ摘要のルールが既にあればカテゴリを上書きする（FR-AICAT-03）。 */
  upsert(ledgerId: string, normalizedDescription: string, categoryId: string): Promise<void>;
};

export const createCategoryRuleRepository = (client: SupabaseClient): CategoryRuleRepository => ({
  async listByNormalizedDescriptions(ledgerId, normalizedDescriptions) {
    if (normalizedDescriptions.length === 0) {
      return [];
    }
    const { data, error } = await client
      .from(TABLE)
      .select(COLUMNS)
      .eq("ledger_id", ledgerId)
      .in("normalized_description", [...normalizedDescriptions])
      .is("deleted_at", null);

    if (error) {
      throw new Error(`Failed to list category rules: ${error.message}`);
    }
    return z.array(rowSchema).parse(data).map(toRule);
  },

  async upsert(ledgerId, normalizedDescription, categoryId) {
    const { error } = await client.from(TABLE).insert({
      ledger_id: ledgerId,
      normalized_description: normalizedDescription,
      category_id: categoryId,
    });
    if (error === null) {
      return;
    }
    if (!isUniqueViolation(error)) {
      throw new Error(`Failed to create category rule: ${error.message}`);
    }
    // 既存ルールあり：カテゴリを更新（部分unique indexのため ON CONFLICT が使えず2段階で行う）
    const { error: updateError } = await client
      .from(TABLE)
      .update({ category_id: categoryId })
      .eq("ledger_id", ledgerId)
      .eq("normalized_description", normalizedDescription)
      .is("deleted_at", null);
    if (updateError) {
      throw new Error(`Failed to update category rule: ${updateError.message}`);
    }
  },
});
