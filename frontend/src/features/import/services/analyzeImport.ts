/**
 * 取込ファイルの解析（api.md 7.1・architecture.md 7.1）。
 * フォーマット判定 → パース／OCR → カテゴリ判定（ルール優先→AI）→ 重複候補検知 →
 * 原本を Drive へ保存 → import_files を analyzed で作成し、プレビューを返す。
 * PDF は OCR（pdfOcr）で解析し、失敗時は failed で記録して 502 を返す（FR-PDF-03）。
 */
import { ConflictError, ValidationError } from "@/shared/errors/appError";

import type { Category } from "@/features/category/types";
import type { CategoryRepository } from "@/features/category/repositories/categoryRepository";
import type { EntryRepository } from "@/features/entry/repositories/entryRepository";

import type { CategoryRuleRepository } from "../repositories/categoryRuleRepository";
import type { CsvColumnMappingRepository } from "../repositories/csvColumnMappingRepository";
import type {
  ImportErrorRow,
  ImportFileRepository,
} from "../repositories/importFileRepository";
import type { LedgerDriveFolderRepository } from "../repositories/ledgerDriveFolderRepository";
import type { ParseResult, StatementFormat } from "../types";

import { categorizeRows, type AiCategoryClassifier, type CategorySource } from "./categorize";
import { columnMappingSchema, type ColumnMapping } from "./columnMapping";
import { decodeCsvBytes } from "./decodeCsv";
import { markDuplicateRows, type DuplicateMatch } from "./duplicateCheck";
import { computeFileHash } from "./fileHash";
import { parseCsv } from "./parseCsv";
import { detectStatementFormat, getStatementParser } from "./parsers";
import { parseGenericCsv } from "./parsers/genericParser";
import { saveOriginalToDrive } from "./drive/driveService";
import type { DriveClient } from "./drive/driveClient";
import type { PdfStatementOcr } from "./ocr/pdfStatementOcr";

export type AnalyzeImportDeps = {
  readonly entryRepository: Pick<EntryRepository, "listDuplicateKeys">;
  readonly categoryRepository: Pick<CategoryRepository, "listByLedger">;
  readonly ruleRepository: Pick<CategoryRuleRepository, "listByNormalizedDescriptions">;
  readonly classifier: AiCategoryClassifier;
  readonly importFileRepository: Pick<ImportFileRepository, "create" | "existsActiveByFileHash">;
  readonly mappingRepository: Pick<CsvColumnMappingRepository, "getById">;
  readonly drive: DriveClient;
  readonly folderRepository: LedgerDriveFolderRepository;
  readonly pdfOcr: PdfStatementOcr;
};

export type AnalyzeImportInput = {
  readonly ledgerId: string;
  readonly userId: string;
  readonly fileName: string;
  readonly bytes: Uint8Array;
  readonly format?: StatementFormat;
  readonly mappingId?: string;
  readonly inlineMapping?: unknown;
  readonly force: boolean;
  /** 支払月（YYYY-MM）。取込全体（＝1回の請求書）の既定値として全行へ適用する。 */
  readonly billingMonth: string;
};

export type AnalyzePreviewRow = {
  readonly rowNo: number;
  readonly usedOn: string;
  /** 支払月の既定値（billingMonth と同じ）。プレビューで行ごとに上書き可能。 */
  readonly billingMonth: string;
  readonly amount: number;
  readonly description: string;
  readonly suggestedCategoryId: string;
  readonly categorySource: CategorySource;
  readonly duplicate: DuplicateMatch | null;
};

export type AnalyzeImportResult = {
  readonly importFileId: string;
  readonly format: StatementFormat;
  readonly fileName: string;
  readonly rows: readonly AnalyzePreviewRow[];
  readonly errorRows: readonly ImportErrorRow[];
};

const isPdfFile = (fileName: string): boolean => fileName.toLowerCase().endsWith(".pdf");

/** generic 用マッピングの解決（inline 優先・保存済みIDフォールバック）。 */
const resolveMapping = async (
  mappingRepository: AnalyzeImportDeps["mappingRepository"],
  input: AnalyzeImportInput,
): Promise<ColumnMapping> => {
  if (input.inlineMapping !== undefined) {
    const parsed = columnMappingSchema.safeParse(input.inlineMapping);
    if (!parsed.success) {
      throw new ValidationError("列マッピングの内容が不正です");
    }
    return parsed.data;
  }
  if (input.mappingId !== undefined) {
    const saved = await mappingRepository.getById(input.ledgerId, input.mappingId);
    if (saved === null) {
      throw new ValidationError("指定された列マッピングが見つかりません");
    }
    return saved.mapping;
  }
  throw new ValidationError("format=generic には mapping または mappingId が必要です");
};

const parseByFormat = async (
  deps: AnalyzeImportDeps,
  input: AnalyzeImportInput,
  records: readonly (readonly string[])[],
): Promise<{ format: StatementFormat; result: ParseResult }> => {
  if (input.format === "generic") {
    const mapping = await resolveMapping(deps.mappingRepository, input);
    return { format: "generic", result: parseGenericCsv(records, mapping) };
  }
  if (input.format !== undefined) {
    const parser = getStatementParser(input.format);
    if (parser === null) {
      throw new ValidationError(`このフォーマット（${input.format}）は未対応です`);
    }
    return { format: parser.format, result: parser.parse(records) };
  }
  const detected = detectStatementFormat(records);
  if (detected === null) {
    throw new ValidationError("ファイルのフォーマットを判定できません", [
      { code: "FORMAT_UNKNOWN", message: "カード会社を選択するか、列マッピングを指定してください" },
    ]);
  }
  const parser = getStatementParser(detected);
  if (parser === null) {
    throw new ValidationError(`このフォーマット（${detected}）は未対応です`);
  }
  return { format: detected, result: parser.parse(records) };
};

const toErrorRows = (
  result: ParseResult,
  records: readonly (readonly string[])[],
): ImportErrorRow[] =>
  result.errors.map((error) => ({
    rowNo: error.rowNumber,
    raw: (records[error.rowNumber - 1] ?? []).join(","),
    message: error.message,
  }));

export const analyzeImport = async (
  deps: AnalyzeImportDeps,
  input: AnalyzeImportInput,
): Promise<AnalyzeImportResult> => {
  const isPdf = isPdfFile(input.fileName);
  const fileHash = computeFileHash(input.bytes);
  if (!input.force) {
    const alreadyImported = await deps.importFileRepository.existsActiveByFileHash(
      input.ledgerId,
      fileHash,
    );
    if (alreadyImported) {
      throw new ConflictError("このファイルは取込済みです", [
        { code: "DUPLICATE_FILE", message: "同じ内容のファイルが既に取り込まれています" },
      ]);
    }
  }

  let format: StatementFormat;
  let result: ParseResult;
  let records: readonly (readonly string[])[] = [];
  if (isPdf) {
    format = "pdf";
    try {
      result = await deps.pdfOcr.parse(input.bytes, input.fileName);
    } catch (error) {
      // OCR失敗も取込済み警告の対象外として履歴に残す（api.md 7.1・FR-PDF-03）
      await deps.importFileRepository.create({
        ledgerId: input.ledgerId,
        uploadedByUserId: input.userId,
        fileName: input.fileName,
        fileType: "pdf",
        fileHash,
        format: "pdf",
        status: "failed",
        errorDetail: null,
        driveFileId: null,
        driveWebViewLink: null,
        driveStatus: "failed",
      });
      throw error;
    }
  } else {
    const { text } = decodeCsvBytes(input.bytes);
    records = parseCsv(text);
    ({ format, result } = await parseByFormat(deps, input, records));
  }

  const previewRows = await markDuplicateRows(deps.entryRepository, input.ledgerId, result.rows);
  const categories: Category[] = await deps.categoryRepository.listByLedger(input.ledgerId);
  const categorized = await categorizeRows(
    { ruleRepository: deps.ruleRepository, classifier: deps.classifier },
    input.ledgerId,
    previewRows,
    categories,
  );

  const driveResult = await saveOriginalToDrive(
    { drive: deps.drive, folderRepository: deps.folderRepository },
    {
      ledgerId: input.ledgerId,
      fileName: input.fileName,
      mimeType: isPdf ? "application/pdf" : "text/csv",
      bytes: input.bytes,
    },
  );

  const errorRows = toErrorRows(result, records);
  const importFile = await deps.importFileRepository.create({
    ledgerId: input.ledgerId,
    uploadedByUserId: input.userId,
    fileName: input.fileName,
    fileType: isPdf ? "pdf" : "csv",
    fileHash,
    format,
    status: "analyzed",
    errorDetail: errorRows.length === 0 ? null : errorRows,
    driveFileId: driveResult.driveFileId,
    driveWebViewLink: driveResult.driveWebViewLink,
    driveStatus: driveResult.driveStatus,
  });

  return {
    importFileId: importFile.id,
    format,
    fileName: input.fileName,
    rows: categorized.map((row) => ({
      rowNo: row.rowNumber,
      usedOn: row.usedOn,
      billingMonth: input.billingMonth,
      amount: row.amount,
      description: row.description,
      suggestedCategoryId: row.categoryId,
      categorySource: row.categorySource,
      duplicate: row.duplicate,
    })),
    errorRows,
  };
};
