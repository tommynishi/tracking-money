import { describe, expect, it, vi } from "vitest";

import { ForbiddenError, NotFoundError } from "@/shared/errors/appError";

import type { CategoryRepository } from "../repositories/categoryRepository";
import type { Category } from "../types";
import { createCategory, listCategories, updateCategory } from "./categoryService";

const LEDGER_ID = "11111111-1111-1111-1111-111111111111";
const CATEGORY_ID = "22222222-2222-2222-2222-222222222222";

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

const createRepositoryStub = (getByIdResult: Category | null): CategoryRepository => ({
  listByLedger: vi.fn(async () => [baseCategory]),
  getById: vi.fn(async () => getByIdResult),
  create: vi.fn(async ({ name, isFixedCost }) => ({ ...baseCategory, name, isFixedCost })),
  updateFields: vi.fn(async (_ledgerId, _categoryId, fields) => ({ ...baseCategory, ...fields })),
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
