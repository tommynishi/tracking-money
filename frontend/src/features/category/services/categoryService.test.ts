import { describe, expect, it, vi } from "vitest";

import { ForbiddenError, NotFoundError, ValidationError } from "@/shared/errors/appError";

import type { CategoryRepository } from "../repositories/categoryRepository";
import type { Category } from "../types";
import {
  createCategory,
  deleteCategory,
  listCategories,
  reorderCategories,
  updateCategory,
} from "./categoryService";

const LEDGER_ID = "11111111-1111-1111-1111-111111111111";
const CATEGORY_ID = "22222222-2222-2222-2222-222222222222";
const SYSTEM_CATEGORY_ID = "33333333-3333-3333-3333-333333333333";
const OTHER_CATEGORY_ID = "44444444-4444-4444-4444-444444444444";

const baseCategory: Category = {
  id: CATEGORY_ID,
  ledgerId: LEDGER_ID,
  name: "食費",
  isFixedCost: false,
  isSystem: false,
  sortOrder: 0,
  createdAt: "2026-07-06T00:00:00.000Z",
  updatedAt: "2026-07-06T00:00:00.000Z",
};

const createRepositoryStub = (
  getByIdResult: Category | null,
  overrides: Partial<CategoryRepository> = {},
): CategoryRepository => ({
  listByLedger: vi.fn(async () => [baseCategory]),
  getById: vi.fn(async () => getByIdResult),
  create: vi.fn(async ({ name, isFixedCost }) => ({ ...baseCategory, name, isFixedCost })),
  updateFields: vi.fn(async (_ledgerId, _categoryId, fields) => ({ ...baseCategory, ...fields })),
  findSystemCategoryId: vi.fn(async () => SYSTEM_CATEGORY_ID),
  listActiveIds: vi.fn(async () => [CATEGORY_ID, OTHER_CATEGORY_ID]),
  deleteWithReassign: vi.fn(async () => undefined),
  reorder: vi.fn(async () => undefined),
  ...overrides,
});

describe("listCategories", () => {
  it("Repository の一覧をそのまま返す", async () => {
    const repository = createRepositoryStub(baseCategory);
    await expect(listCategories(repository, LEDGER_ID)).resolves.toEqual([baseCategory]);
    expect(repository.listByLedger).toHaveBeenCalledWith(LEDGER_ID);
  });
});

describe("createCategory", () => {
  it("入力の名称・固定費で追加する", async () => {
    const repository = createRepositoryStub(baseCategory);
    const result = await createCategory(repository, {
      ledgerId: LEDGER_ID,
      name: "ペット",
      isFixedCost: false,
    });
    expect(result.name).toBe("ペット");
    expect(repository.create).toHaveBeenCalledWith({
      ledgerId: LEDGER_ID,
      name: "ペット",
      isFixedCost: false,
    });
  });
});

describe("updateCategory", () => {
  it("通常カテゴリの名称を変更する", async () => {
    const repository = createRepositoryStub(baseCategory);
    const result = await updateCategory(repository, {
      ledgerId: LEDGER_ID,
      categoryId: CATEGORY_ID,
      name: "外食",
    });
    expect(result.name).toBe("外食");
    expect(repository.updateFields).toHaveBeenCalledWith(LEDGER_ID, CATEGORY_ID, { name: "外食" });
  });

  it("存在しなければ NotFoundError を投げる", async () => {
    const repository = createRepositoryStub(null);
    await expect(
      updateCategory(repository, { ledgerId: LEDGER_ID, categoryId: CATEGORY_ID, name: "x" }),
    ).rejects.toBeInstanceOf(NotFoundError);
    expect(repository.updateFields).not.toHaveBeenCalled();
  });

  it("is_system カテゴリの名称変更は ForbiddenError（永続化しない）", async () => {
    const repository = createRepositoryStub({ ...baseCategory, name: "その他", isSystem: true });
    await expect(
      updateCategory(repository, { ledgerId: LEDGER_ID, categoryId: CATEGORY_ID, name: "雑費" }),
    ).rejects.toBeInstanceOf(ForbiddenError);
    expect(repository.updateFields).not.toHaveBeenCalled();
  });

  it("is_system カテゴリでも固定費フラグは変更できる", async () => {
    const repository = createRepositoryStub({ ...baseCategory, name: "その他", isSystem: true });
    await updateCategory(repository, {
      ledgerId: LEDGER_ID,
      categoryId: CATEGORY_ID,
      isFixedCost: true,
    });
    expect(repository.updateFields).toHaveBeenCalledWith(LEDGER_ID, CATEGORY_ID, {
      isFixedCost: true,
    });
  });

  it("変更内容が無ければ永続化せず現状を返す", async () => {
    const repository = createRepositoryStub(baseCategory);
    const result = await updateCategory(repository, {
      ledgerId: LEDGER_ID,
      categoryId: CATEGORY_ID,
      name: baseCategory.name,
    });
    expect(result).toEqual(baseCategory);
    expect(repository.updateFields).not.toHaveBeenCalled();
  });
});

describe("deleteCategory", () => {
  it("付け替え先省略時は「その他」(is_system) へ付け替えて削除する", async () => {
    const repository = createRepositoryStub(baseCategory);
    await deleteCategory(repository, { ledgerId: LEDGER_ID, categoryId: CATEGORY_ID });
    expect(repository.findSystemCategoryId).toHaveBeenCalledWith(LEDGER_ID);
    expect(repository.deleteWithReassign).toHaveBeenCalledWith(
      LEDGER_ID,
      CATEGORY_ID,
      SYSTEM_CATEGORY_ID,
    );
  });

  it("付け替え先指定時は存在確認のうえその id へ付け替える", async () => {
    const target: Category = { ...baseCategory, id: OTHER_CATEGORY_ID, name: "日用品" };
    const repository = createRepositoryStub(baseCategory, {
      getById: vi.fn(async (_ledgerId, categoryId) =>
        categoryId === OTHER_CATEGORY_ID ? target : baseCategory,
      ),
    });
    await deleteCategory(repository, {
      ledgerId: LEDGER_ID,
      categoryId: CATEGORY_ID,
      reassignToCategoryId: OTHER_CATEGORY_ID,
    });
    expect(repository.deleteWithReassign).toHaveBeenCalledWith(
      LEDGER_ID,
      CATEGORY_ID,
      OTHER_CATEGORY_ID,
    );
  });

  it("is_system カテゴリは削除できない（ForbiddenError）", async () => {
    const repository = createRepositoryStub({ ...baseCategory, isSystem: true });
    await expect(
      deleteCategory(repository, { ledgerId: LEDGER_ID, categoryId: CATEGORY_ID }),
    ).rejects.toBeInstanceOf(ForbiddenError);
    expect(repository.deleteWithReassign).not.toHaveBeenCalled();
  });

  it("存在しなければ NotFoundError", async () => {
    const repository = createRepositoryStub(null);
    await expect(
      deleteCategory(repository, { ledgerId: LEDGER_ID, categoryId: CATEGORY_ID }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it("付け替え先に削除対象自身を指定すると ValidationError", async () => {
    const repository = createRepositoryStub(baseCategory);
    await expect(
      deleteCategory(repository, {
        ledgerId: LEDGER_ID,
        categoryId: CATEGORY_ID,
        reassignToCategoryId: CATEGORY_ID,
      }),
    ).rejects.toBeInstanceOf(ValidationError);
    expect(repository.deleteWithReassign).not.toHaveBeenCalled();
  });
});

describe("reorderCategories", () => {
  it("全件を過不足なく指定すると並び替える", async () => {
    const repository = createRepositoryStub(baseCategory);
    await reorderCategories(repository, {
      ledgerId: LEDGER_ID,
      categoryIds: [OTHER_CATEGORY_ID, CATEGORY_ID],
    });
    expect(repository.reorder).toHaveBeenCalledWith(LEDGER_ID, [OTHER_CATEGORY_ID, CATEGORY_ID]);
  });

  it("全件と一致しない（欠落）と ValidationError", async () => {
    const repository = createRepositoryStub(baseCategory);
    await expect(
      reorderCategories(repository, { ledgerId: LEDGER_ID, categoryIds: [CATEGORY_ID] }),
    ).rejects.toBeInstanceOf(ValidationError);
    expect(repository.reorder).not.toHaveBeenCalled();
  });

  it("重複した id を含むと ValidationError", async () => {
    const repository = createRepositoryStub(baseCategory);
    await expect(
      reorderCategories(repository, {
        ledgerId: LEDGER_ID,
        categoryIds: [CATEGORY_ID, CATEGORY_ID],
      }),
    ).rejects.toBeInstanceOf(ValidationError);
    expect(repository.reorder).not.toHaveBeenCalled();
  });
});
