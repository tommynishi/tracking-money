import { describe, expect, it, vi } from "vitest";

import { ConflictError, NotFoundError, ValidationError } from "@/shared/errors/appError";

import type { Category } from "@/features/category/types";

import { confirmImport, type ConfirmImportDeps } from "./confirmImport";

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

import type { ImportFile } from "../repositories/importFileRepository";

const analyzedFile: ImportFile = {
  id: "import-1",
  ledgerId: "ledger-1",
  uploadedByUserId: "user-1",
  fileName: "enavi.csv",
  fileType: "csv",
  fileHash: "hash",
  format: "rakuten",
  status: "analyzed",
  importedCount: 0,
  skippedCount: 0,
  errorCount: 0,
  errorDetail: null,
  driveFileId: null,
  driveWebViewLink: null,
  driveStatus: "failed",
  createdAt: "2026-07-20T00:00:00.000Z",
};

const createDeps = (): ConfirmImportDeps => ({
  importFileRepository: {
    getById: vi.fn().mockResolvedValue(analyzedFile),
    updateResult: vi.fn().mockResolvedValue(undefined),
  },
  entryRepository: {
    createMany: vi.fn().mockResolvedValue(undefined),
    listDuplicateKeys: vi.fn().mockResolvedValue([]),
  },
  categoryRepository: {
    listByLedger: vi
      .fn()
      .mockResolvedValue([category("cat-food", "食費"), category("cat-other", "その他", true)]),
  },
  ruleRepository: { upsert: vi.fn().mockResolvedValue(undefined) },
});

const row = (description: string, skip = false, categoryId = "cat-food") => ({
  usedOn: "2026-06-25",
  billingMonth: "2026-07",
  amount: 853,
  description,
  categoryId,
  memo: null,
  skip,
});

const baseInput = {
  ledgerId: "ledger-1",
  userId: "user-1",
  importFileId: "import-1",
};

describe("confirmImport", () => {
  it("skip 行は登録せず、登録行は一括作成し学習ルールを保存する（FR-DUP-02 / FR-AICAT-03）", async () => {
    const deps = createDeps();
    const result = await confirmImport(deps, {
      ...baseInput,
      rows: [row("スーパーA"), row("重複店", true)],
    });

    expect(result).toEqual({ importedCount: 1, skippedCount: 1, errorCount: 0 });
    expect(deps.entryRepository.createMany).toHaveBeenCalledWith([
      expect.objectContaining({
        description: "スーパーA",
        billingMonth: "2026-07",
        memo: null,
        source: "csv",
        importFileId: "import-1",
        createdByUserId: "user-1",
      }),
    ]);
    expect(deps.ruleRepository.upsert).toHaveBeenCalledWith("ledger-1", "スーパーa", "cat-food");
    expect(deps.importFileRepository.updateResult).toHaveBeenCalledWith("ledger-1", "import-1", {
      status: "completed",
      importedCount: 1,
      skippedCount: 1,
      errorCount: 0,
    });
  });

  it("行ごとの支払月・備考をそのまま登録する", async () => {
    const deps = createDeps();
    await confirmImport(deps, {
      ...baseInput,
      rows: [{ ...row("スーパーA"), billingMonth: "2026-08", memo: "特売" }],
    });

    expect(deps.entryRepository.createMany).toHaveBeenCalledWith([
      expect.objectContaining({ billingMonth: "2026-08", memo: "特売" }),
    ]);
  });

  it("サーバー側の再チェックで重複した行は自動スキップする（api.md 7.2）", async () => {
    const deps = createDeps();
    vi.mocked(deps.entryRepository.listDuplicateKeys).mockResolvedValue([
      { entryId: "e1", usedOn: "2026-06-25", amount: 853, normalizedDescription: "スーパーa" },
    ]);

    const result = await confirmImport(deps, { ...baseInput, rows: [row("スーパーA")] });
    expect(result).toEqual({ importedCount: 0, skippedCount: 1, errorCount: 0 });
    expect(deps.entryRepository.createMany).toHaveBeenCalledWith([]);
  });

  it("一括登録の失敗は errorCount へ計上し partial で記録する", async () => {
    const deps = createDeps();
    vi.mocked(deps.entryRepository.createMany).mockRejectedValue(new Error("db down"));

    const result = await confirmImport(deps, { ...baseInput, rows: [row("スーパーA")] });
    expect(result).toEqual({ importedCount: 0, skippedCount: 0, errorCount: 1 });
    expect(deps.ruleRepository.upsert).not.toHaveBeenCalled();
    expect(deps.importFileRepository.updateResult).toHaveBeenCalledWith(
      "ledger-1",
      "import-1",
      expect.objectContaining({ status: "partial" }),
    );
  });

  it("取込履歴なし=404・確定済み=409・不明カテゴリ=400", async () => {
    const deps = createDeps();
    vi.mocked(deps.importFileRepository.getById).mockResolvedValueOnce(null);
    await expect(confirmImport(deps, { ...baseInput, rows: [] })).rejects.toThrow(NotFoundError);

    vi.mocked(deps.importFileRepository.getById).mockResolvedValueOnce({
      ...analyzedFile,
      status: "completed",
    });
    await expect(confirmImport(deps, { ...baseInput, rows: [] })).rejects.toThrow(ConflictError);

    await expect(
      confirmImport(deps, { ...baseInput, rows: [row("店A", false, "unknown-cat")] }),
    ).rejects.toThrow(ValidationError);
  });
});
