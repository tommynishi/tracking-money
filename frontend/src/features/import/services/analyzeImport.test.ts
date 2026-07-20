import { describe, expect, it, vi } from "vitest";

import { AiUnavailableError, ConflictError, ValidationError } from "@/shared/errors/appError";

import type { Category } from "@/features/category/types";

import { analyzeImport, type AnalyzeImportDeps } from "./analyzeImport";

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

const RAKUTEN_CSV = [
  '"利用日","利用店名・商品名","利用者","支払方法","利用金額"',
  '"2026/06/25","スーパーA","本人","1回払い","853"',
].join("\n");

const encode = (text: string): Uint8Array => new TextEncoder().encode(text);

const createDeps = (): AnalyzeImportDeps => ({
  entryRepository: { listDuplicateKeys: vi.fn().mockResolvedValue([]) },
  categoryRepository: {
    listByLedger: vi
      .fn()
      .mockResolvedValue([category("cat-food", "食費"), category("cat-other", "その他", true)]),
  },
  ruleRepository: { listByNormalizedDescriptions: vi.fn().mockResolvedValue([]) },
  classifier: { classify: vi.fn().mockResolvedValue(["食費"]) },
  importFileRepository: {
    create: vi.fn().mockImplementation((input: { status: string }) =>
      Promise.resolve({ id: "import-1", ...input }),
    ),
    existsActiveByFileHash: vi.fn().mockResolvedValue(false),
  },
  mappingRepository: { getById: vi.fn().mockResolvedValue(null) },
  drive: {
    createFolder: vi.fn().mockResolvedValue("folder-1"),
    uploadFile: vi.fn().mockResolvedValue({ fileId: "drive-1", webViewLink: "https://d/1" }),
    downloadFile: vi.fn(),
    deleteFile: vi.fn(),
  },
  folderRepository: {
    getDriveFolderId: vi.fn().mockResolvedValue("folder-1"),
    setDriveFolderId: vi.fn(),
  },
  pdfOcr: {
    parse: vi.fn().mockResolvedValue({
      rows: [{ rowNumber: 1, usedOn: "2026-06-10", amount: 2200, description: "PDF店A" }],
      errors: [],
    }),
  },
});

const baseInput = {
  ledgerId: "ledger-1",
  userId: "user-1",
  fileName: "enavi.csv",
  bytes: encode(RAKUTEN_CSV),
  force: false,
  billingMonth: "2026-07",
};

describe("analyzeImport", () => {
  it("自動判定→分類→Drive保存→analyzed 作成まで行いプレビューを返す", async () => {
    const deps = createDeps();
    const result = await analyzeImport(deps, baseInput);

    expect(result.format).toBe("rakuten");
    expect(result.importFileId).toBe("import-1");
    expect(result.rows).toEqual([
      {
        rowNo: 2,
        usedOn: "2026-06-25",
        billingMonth: "2026-07",
        amount: 853,
        description: "スーパーA",
        suggestedCategoryId: "cat-food",
        categorySource: "ai",
        duplicate: null,
      },
    ]);
    expect(result.errorRows).toEqual([]);
    expect(deps.importFileRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "analyzed",
        format: "rakuten",
        fileType: "csv",
        driveStatus: "uploaded",
        driveFileId: "drive-1",
      }),
    );
  });

  it("取込済みファイルは DUPLICATE_FILE の 409（force で回避可能・FR-DUP-03）", async () => {
    const deps = createDeps();
    vi.mocked(deps.importFileRepository.existsActiveByFileHash).mockResolvedValue(true);

    await expect(analyzeImport(deps, baseInput)).rejects.toThrow(ConflictError);
    await expect(analyzeImport(deps, { ...baseInput, force: true })).resolves.toMatchObject({
      format: "rakuten",
    });
  });

  it("判定不能なCSVは FORMAT_UNKNOWN の 400", async () => {
    const deps = createDeps();
    const promise = analyzeImport(deps, { ...baseInput, bytes: encode("a,b,c\n1,2,3") });
    await expect(promise).rejects.toThrow(ValidationError);
    await promise.catch((error: ValidationError) => {
      expect(error.details?.[0].code).toBe("FORMAT_UNKNOWN");
    });
  });

  it("generic はインラインマッピングでパースできる", async () => {
    const deps = createDeps();
    const result = await analyzeImport(deps, {
      ...baseInput,
      bytes: encode("日付,店,金額\n2026-06-01,店A,500"),
      format: "generic",
      inlineMapping: {
        headerRows: 1,
        usedOnColumn: 0,
        usedOnFormat: "YYYY-MM-DD",
        descriptionColumn: 1,
        amountColumn: 2,
      },
    });
    expect(result.format).toBe("generic");
    expect(result.rows[0]).toMatchObject({ usedOn: "2026-06-01", amount: 500 });
  });

  it("generic で mapping 未指定は 400", async () => {
    const deps = createDeps();
    await expect(
      analyzeImport(deps, { ...baseInput, format: "generic" }),
    ).rejects.toThrow("mapping または mappingId");
  });

  it("PDF は OCR で解析し format=pdf の analyzed を作成する（FR-PDF-01）", async () => {
    const deps = createDeps();
    const result = await analyzeImport(deps, { ...baseInput, fileName: "meisai.pdf" });

    expect(result.format).toBe("pdf");
    expect(result.rows[0]).toMatchObject({ usedOn: "2026-06-10", amount: 2200 });
    expect(deps.importFileRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({ fileType: "pdf", format: "pdf", status: "analyzed" }),
    );
  });

  it("OCR失敗は failed で記録して例外を投げる（api.md 7.1・FR-PDF-03）", async () => {
    const deps = createDeps();
    vi.mocked(deps.pdfOcr.parse).mockRejectedValue(new AiUnavailableError("AI down"));

    await expect(
      analyzeImport(deps, { ...baseInput, fileName: "meisai.pdf" }),
    ).rejects.toThrow(AiUnavailableError);
    expect(deps.importFileRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({ fileType: "pdf", status: "failed" }),
    );
  });

  it("Drive保存に失敗しても解析は成功し drive_status=failed で記録する（FR-DRIVE-06）", async () => {
    const deps = createDeps();
    vi.mocked(deps.drive.uploadFile).mockRejectedValue(new Error("drive down"));

    const result = await analyzeImport(deps, baseInput);
    expect(result.rows).toHaveLength(1);
    expect(deps.importFileRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({ driveStatus: "failed", driveFileId: null }),
    );
  });
});
