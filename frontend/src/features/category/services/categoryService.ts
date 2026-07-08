/**
 * カテゴリの業務ロジック（Service 層・FR-CATEGORY-01/04・api.md 5）。
 * ledgerId スコープと業務ルール（is_system 保護・名称重複）を担い、永続化は Repository へ委譲する。
 * アクセス認可（ledger_members 検証）は Route Handler の責務とする。
 * 入力の書式検証（name の必須・長さ等）も Route Handler の責務とする。
 */
import { ForbiddenError, NotFoundError } from "@/shared/errors/appError";

import type { CategoryRepository } from "../repositories/categoryRepository";
import type { Category } from "../types";

/** カテゴリ一覧（sort_order 昇順・api.md 5.1）。 */
export const listCategories = (
  repository: CategoryRepository,
  ledgerId: string,
): Promise<Category[]> => repository.listByLedger(ledgerId);

export type CreateCategoryInput = {
  readonly ledgerId: string;
  readonly name: string;
  readonly isFixedCost: boolean;
};

/** カテゴリを追加する（api.md 5.2）。ユーザー作成カテゴリは常に is_system=false。 */
export const createCategory = (
  repository: CategoryRepository,
  input: CreateCategoryInput,
): Promise<Category> =>
  repository.create({
    ledgerId: input.ledgerId,
    name: input.name,
    isFixedCost: input.isFixedCost,
  });

export type UpdateCategoryInput = {
  readonly ledgerId: string;
  readonly categoryId: string;
  readonly name?: string;
  readonly isFixedCost?: boolean;
};

/**
 * カテゴリの名称・固定費フラグを変更する（api.md 5.3）。
 * is_system カテゴリの名称変更は不可（ForbiddenError）。固定費フラグは変更可。
 */
export const updateCategory = async (
  repository: CategoryRepository,
  input: UpdateCategoryInput,
): Promise<Category> => {
  const category = await repository.getById(input.ledgerId, input.categoryId);
  if (category === null) {
    throw new NotFoundError("カテゴリが見つかりません");
  }

  const isRenaming = input.name !== undefined && input.name !== category.name;
  if (category.isSystem && isRenaming) {
    throw new ForbiddenError("システムカテゴリの名称は変更できません");
  }

  // 実際に値が変わるフィールドのみ更新対象とする（同値は no-op）
  const fields: { name?: string; isFixedCost?: boolean } = {};
  if (isRenaming) fields.name = input.name;
  if (input.isFixedCost !== undefined && input.isFixedCost !== category.isFixedCost) {
    fields.isFixedCost = input.isFixedCost;
  }
  if (fields.name === undefined && fields.isFixedCost === undefined) {
    return category;
  }

  return repository.updateFields(input.ledgerId, input.categoryId, fields);
};
