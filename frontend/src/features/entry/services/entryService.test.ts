import { describe, expect, it, vi } from "vitest";

import { NotFoundError, ValidationError } from "@/shared/errors/appError";
import type { CategoryRepository } from "@/features/category/repositories/categoryRepository";
import type { Category } from "@/features/category/types";

import type { EntryRepository } from "../repositories/entryRepository";
import type { Entry } from "../types";
import {
  createEntry,
  deleteEntry,
  listEntries,
  updateEntry,
  type EntryServiceDeps,
} from "./entryService";

const LEDGER_ID = "11111111-1111-1111-1111-111111111111";
const USER_ID = "22222222-2222-2222-2222-222222222222";
const CATEGORY_ID = "33333333-3333-3333-3333-333333333333";
const ENTRY_ID = "44444444-4444-4444-4444-444444444444";

const category: Category = {
  id: CATEGORY_ID,
  ledgerId: LEDGER_ID,
  name: "食費",
  isFixedCost: false,
  isSystem: false,
  sortOrder: 0,
  createdAt: "2026-07-01T00:00:00.000Z",
  updatedAt: "2026-07-01T00:00:00.000Z",
};

const entry: Entry = {
  id: ENTRY_ID,
  ledgerId: LEDGER_ID,
  categoryId: CATEGORY_ID,
  usedOn: "2026-07-01",
  amount: 1280,
  description: "スーパーマルエツ",
  normalizedDescription: "スーパーマルエツ",
  paymentMethod: "現金",
  memo: null,
  type: "expense",
  source: "manual",
  createdByUserId: USER_ID,
  createdAt: "2026-07-01T00:00:00.000Z",
  updatedAt: "2026-07-01T00:00:00.000Z",
};

const createEntryRepoStub = (getByIdResult: Entry | null = entry): EntryRepository => ({
  create: vi.fn(async () => entry),
  getById: vi.fn(async () => getByIdResult),
  updateFields: vi.fn(async (_ledgerId, _entryId, fields) => ({ ...entry, ...fields })),
  softDelete: vi.fn(async () => undefined),
  list: vi.fn(async () => ({ items: [], totalCount: 0 })),
});

const createDeps = (
  overrides: {
    category?: Category | null;
    entryRepository?: EntryRepository;
  } = {},
): EntryServiceDeps => ({
  entryRepository: overrides.entryRepository ?? createEntryRepoStub(),
  categoryRepository: {
    getById: vi.fn(async () => (overrides.category === undefined ? category : overrides.category)),
  } as Pick<CategoryRepository, "getById">,
});

const baseCreateInput = {
  ledgerId: LEDGER_ID,
  createdByUserId: USER_ID,
  categoryId: CATEGORY_ID,
  usedOn: "2026-07-01",
  amount: 1280,
  description: "スーパー　マルエツ",
  paymentMethod: "現金" as string | null,
  memo: null,
};

describe("createEntry", () => {
  it("正規化摘要と source=manual を付与して登録する", async () => {
    const repository = createEntryRepoStub();
    const deps = createDeps({ entryRepository: repository });

    await createEntry(deps, baseCreateInput);

    expect(repository.create).toHaveBeenCalledOnce();
    const arg = vi.mocked(repository.create).mock.calls[0][0];
    expect(arg.source).toBe("manual");
    expect(arg.createdByUserId).toBe(USER_ID);
    expect(arg.normalizedDescription).toBe("スーパー マルエツ");
  });

  it("カテゴリが同一帳簿に存在しなければ ValidationError", async () => {
    const repository = createEntryRepoStub();
    const deps = createDeps({ category: null, entryRepository: repository });

    await expect(createEntry(deps, baseCreateInput)).rejects.toBeInstanceOf(ValidationError);
    expect(repository.create).not.toHaveBeenCalled();
  });
});

describe("updateEntry", () => {
  it("摘要変更時は正規化摘要を再計算して更新する", async () => {
    const repository = createEntryRepoStub();
    const deps = createDeps({ entryRepository: repository });

    await updateEntry(deps, {
      ledgerId: LEDGER_ID,
      entryId: ENTRY_ID,
      description: "ＡＭＡＺＯＮ",
    });

    expect(repository.updateFields).toHaveBeenCalledWith(LEDGER_ID, ENTRY_ID, {
      description: "ＡＭＡＺＯＮ",
      normalizedDescription: "amazon",
    });
  });

  it("カテゴリ変更時に不正カテゴリなら ValidationError", async () => {
    const repository = createEntryRepoStub();
    const deps = createDeps({ category: null, entryRepository: repository });

    await expect(
      updateEntry(deps, { ledgerId: LEDGER_ID, entryId: ENTRY_ID, categoryId: "bad" }),
    ).rejects.toBeInstanceOf(ValidationError);
    expect(repository.updateFields).not.toHaveBeenCalled();
  });

  it("存在しなければ NotFoundError", async () => {
    const repository = createEntryRepoStub(null);
    const deps = createDeps({ entryRepository: repository });

    await expect(
      updateEntry(deps, { ledgerId: LEDGER_ID, entryId: ENTRY_ID, amount: 500 }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it("変更が無ければ永続化せず現状を返す", async () => {
    const repository = createEntryRepoStub();
    const deps = createDeps({ entryRepository: repository });

    const result = await updateEntry(deps, { ledgerId: LEDGER_ID, entryId: ENTRY_ID });

    expect(result).toEqual(entry);
    expect(repository.updateFields).not.toHaveBeenCalled();
  });
});

describe("deleteEntry", () => {
  it("存在すれば論理削除する", async () => {
    const repository = createEntryRepoStub();
    await deleteEntry(repository, { ledgerId: LEDGER_ID, entryId: ENTRY_ID });
    expect(repository.softDelete).toHaveBeenCalledWith(LEDGER_ID, ENTRY_ID);
  });

  it("存在しなければ NotFoundError（削除しない）", async () => {
    const repository = createEntryRepoStub(null);
    await expect(
      deleteEntry(repository, { ledgerId: LEDGER_ID, entryId: ENTRY_ID }),
    ).rejects.toBeInstanceOf(NotFoundError);
    expect(repository.softDelete).not.toHaveBeenCalled();
  });
});

describe("listEntries", () => {
  it("総件数からページングメタを算出して返す", async () => {
    const repository = createEntryRepoStub();
    repository.list = vi.fn(async () => ({ items: [], totalCount: 45 }));

    const result = await listEntries(repository, LEDGER_ID, {
      filters: {},
      sort: "usedOn",
      order: "desc",
      page: 1,
      perPage: 20,
    });

    expect(result.meta).toEqual({ page: 1, perPage: 20, totalCount: 45, totalPages: 3 });
  });
});
