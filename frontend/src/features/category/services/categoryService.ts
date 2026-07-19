/**
 * カテゴリの業務ロジック（Service 層・FR-CATEGORY-01/04・api.md 5）。
 * ledgerId スコープと業務ルール（is_system 保護・名称重複）を担い、永続化は Repository へ委譲する。
 * アクセス認可（ledger_members 検証）は Route Handler の責務とする。
 * 入力の書式検証（name の必須・長さ等）も Route Handler の責務とする。
 */
import { ForbiddenError, NotFoundError, ValidationError } from "@/shared/errors/appError";

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

export type DeleteCategoryInput = {
  readonly ledgerId: string;
  readonly categoryId: string;
  /** 使用中明細の付け替え先。省略時は「その他」(is_system) へ付け替える（api.md 5.4）。 */
  readonly reassignToCategoryId?: string;
};

/** 削除時の付け替え先を解決・検証する。 */
const resolveReassignTarget = async (
  repository: CategoryRepository,
  input: DeleteCategoryInput,
): Promise<string> => {
  if (input.reassignToCategoryId !== undefined) {
    if (input.reassignToCategoryId === input.categoryId) {
      throw new ValidationError("付け替え先に削除対象のカテゴリは指定できません");
    }
    const target = await repository.getById(input.ledgerId, input.reassignToCategoryId);
    if (target === null) {
      throw new ValidationError("付け替え先のカテゴリが存在しません");
    }
    return target.id;
  }

  const systemCategoryId = await repository.findSystemCategoryId(input.ledgerId);
  if (systemCategoryId === null) {
    // 全帳簿に「その他」が存在する前提（家計簿作成時に投入）。無い場合はデータ不整合。
    throw new Error("System category not found for reassignment");
  }
  return systemCategoryId;
};

/**
 * カテゴリを削除する（api.md 5.4・FR-CATEGORY-03）。
 * is_system は削除不可。使用中明細を付け替えてから論理削除する（明細のカテゴリ欠損防止）。
 */
export const deleteCategory = async (
  repository: CategoryRepository,
  input: DeleteCategoryInput,
): Promise<void> => {
  const category = await repository.getById(input.ledgerId, input.categoryId);
  if (category === null) {
    throw new NotFoundError("カテゴリが見つかりません");
  }
  if (category.isSystem) {
    throw new ForbiddenError("システムカテゴリは削除できません");
  }

  const reassignTo = await resolveReassignTarget(repository, input);
  await repository.deleteWithReassign(input.ledgerId, input.categoryId, reassignTo);
};

export type ReorderCategoriesInput = {
  readonly ledgerId: string;
  readonly categoryIds: readonly string[];
};

/** 送られた並び順が、家計簿の有効カテゴリ全件と過不足なく一致することを検証する。 */
const assertReorderCoversAll = (
  currentIds: readonly string[],
  requestedIds: readonly string[],
): void => {
  const requestedSet = new Set(requestedIds);
  if (requestedSet.size !== requestedIds.length) {
    throw new ValidationError("並び替え対象に重複したカテゴリがあります");
  }
  const currentSet = new Set(currentIds);
  const isSameSet =
    requestedSet.size === currentSet.size && currentIds.every((id) => requestedSet.has(id));
  if (!isSameSet) {
    throw new ValidationError("並び替えはカテゴリ全件を過不足なく指定してください");
  }
};

/** カテゴリを並び替える（api.md 5.5・FR-CATEGORY-01）。全件の順序を受け取る。 */
export const reorderCategories = async (
  repository: CategoryRepository,
  input: ReorderCategoriesInput,
): Promise<void> => {
  const currentIds = await repository.listActiveIds(input.ledgerId);
  assertReorderCoversAll(currentIds, input.categoryIds);
  await repository.reorder(input.ledgerId, input.categoryIds);
};
