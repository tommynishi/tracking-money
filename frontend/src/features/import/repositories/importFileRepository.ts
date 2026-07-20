/**
 * import_files の Repository（database.md 3.7・api.md 7）。
 * 取込履歴の作成・状態遷移（analyzed → completed / partial、failed）と一覧・照会を担う。
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

import { NotFoundError } from "@/shared/errors/appError";

import type { StatementFormat } from "../types";

const TABLE = "import_files";
const COLUMNS =
  "id, ledger_id, uploaded_by_user_id, file_name, file_type, file_hash, format, status, " +
  "imported_count, skipped_count, error_count, error_detail, " +
  "drive_file_id, drive_web_view_link, drive_status, created_at";

const errorDetailSchema = z
  .array(z.object({ rowNo: z.number().int(), raw: z.string(), message: z.string() }))
  .nullable();

const rowSchema = z.object({
  id: z.uuid(),
  ledger_id: z.uuid(),
  uploaded_by_user_id: z.uuid(),
  file_name: z.string(),
  file_type: z.enum(["csv", "pdf"]),
  file_hash: z.string(),
  format: z.enum(["rakuten", "jcb", "epos", "saison", "generic", "pdf"]),
  status: z.enum(["analyzed", "completed", "partial", "failed"]),
  imported_count: z.number().int(),
  skipped_count: z.number().int(),
  error_count: z.number().int(),
  error_detail: errorDetailSchema,
  drive_file_id: z.string().nullable(),
  drive_web_view_link: z.string().nullable(),
  drive_status: z.enum(["uploaded", "failed"]),
  created_at: z.string(),
});

/** エラー行の記録（api.md 7.1 errorRows。raw に個人情報を含み得るため最小限にする）。 */
export type ImportErrorRow = { readonly rowNo: number; readonly raw: string; readonly message: string };

export type ImportFile = {
  readonly id: string;
  readonly ledgerId: string;
  readonly uploadedByUserId: string;
  readonly fileName: string;
  readonly fileType: "csv" | "pdf";
  readonly fileHash: string;
  readonly format: StatementFormat;
  readonly status: "analyzed" | "completed" | "partial" | "failed";
  readonly importedCount: number;
  readonly skippedCount: number;
  readonly errorCount: number;
  readonly errorDetail: readonly ImportErrorRow[] | null;
  readonly driveFileId: string | null;
  readonly driveWebViewLink: string | null;
  readonly driveStatus: "uploaded" | "failed";
  readonly createdAt: string;
};

const toImportFile = (row: z.infer<typeof rowSchema>): ImportFile => ({
  id: row.id,
  ledgerId: row.ledger_id,
  uploadedByUserId: row.uploaded_by_user_id,
  fileName: row.file_name,
  fileType: row.file_type,
  fileHash: row.file_hash,
  format: row.format,
  status: row.status,
  importedCount: row.imported_count,
  skippedCount: row.skipped_count,
  errorCount: row.error_count,
  errorDetail: row.error_detail,
  driveFileId: row.drive_file_id,
  driveWebViewLink: row.drive_web_view_link,
  driveStatus: row.drive_status,
  createdAt: row.created_at,
});

export type CreateImportFileInput = {
  readonly ledgerId: string;
  readonly uploadedByUserId: string;
  readonly fileName: string;
  readonly fileType: "csv" | "pdf";
  readonly fileHash: string;
  readonly format: StatementFormat;
  readonly status: "analyzed" | "failed";
  readonly errorDetail: readonly ImportErrorRow[] | null;
  readonly driveFileId: string | null;
  readonly driveWebViewLink: string | null;
  readonly driveStatus: "uploaded" | "failed";
};

export type ImportFileRepository = {
  create(input: CreateImportFileInput): Promise<ImportFile>;
  getById(ledgerId: string, importFileId: string): Promise<ImportFile | null>;
  /** 取込済み警告の対象があるか（status が failed 以外・FR-DUP-03 / api.md 7.1）。 */
  existsActiveByFileHash(ledgerId: string, fileHash: string): Promise<boolean>;
  /** 確定結果の反映（api.md 7.2）。 */
  updateResult(
    ledgerId: string,
    importFileId: string,
    result: {
      status: "completed" | "partial";
      importedCount: number;
      skippedCount: number;
      errorCount: number;
    },
  ): Promise<void>;
  /** Drive 原本削除の反映（api.md 7.6）。 */
  clearDriveFile(ledgerId: string, importFileId: string): Promise<void>;
  list(
    ledgerId: string,
    page: number,
    perPage: number,
  ): Promise<{ items: ImportFile[]; totalCount: number }>;
};

export const createImportFileRepository = (client: SupabaseClient): ImportFileRepository => ({
  async create(input) {
    const { data, error } = await client
      .from(TABLE)
      .insert({
        ledger_id: input.ledgerId,
        uploaded_by_user_id: input.uploadedByUserId,
        file_name: input.fileName,
        file_type: input.fileType,
        file_hash: input.fileHash,
        format: input.format,
        status: input.status,
        error_count: input.errorDetail?.length ?? 0,
        error_detail: input.errorDetail,
        drive_file_id: input.driveFileId,
        drive_web_view_link: input.driveWebViewLink,
        drive_status: input.driveStatus,
      })
      .select(COLUMNS)
      .single();

    if (error) {
      throw new Error(`Failed to create import file: ${error.message}`);
    }
    return toImportFile(rowSchema.parse(data));
  },

  async getById(ledgerId, importFileId) {
    const { data, error } = await client
      .from(TABLE)
      .select(COLUMNS)
      .eq("id", importFileId)
      .eq("ledger_id", ledgerId)
      .is("deleted_at", null)
      .maybeSingle();

    if (error) {
      throw new Error(`Failed to get import file: ${error.message}`);
    }
    return data === null ? null : toImportFile(rowSchema.parse(data));
  },

  async existsActiveByFileHash(ledgerId, fileHash) {
    const { data, error } = await client
      .from(TABLE)
      .select("id")
      .eq("ledger_id", ledgerId)
      .eq("file_hash", fileHash)
      .neq("status", "failed")
      .is("deleted_at", null)
      .limit(1);

    if (error) {
      throw new Error(`Failed to check file hash: ${error.message}`);
    }
    return (data ?? []).length > 0;
  },

  async updateResult(ledgerId, importFileId, result) {
    const { data, error } = await client
      .from(TABLE)
      .update({
        status: result.status,
        imported_count: result.importedCount,
        skipped_count: result.skippedCount,
        error_count: result.errorCount,
      })
      .eq("id", importFileId)
      .eq("ledger_id", ledgerId)
      .is("deleted_at", null)
      .select("id")
      .maybeSingle();

    if (error) {
      throw new Error(`Failed to update import file: ${error.message}`);
    }
    if (data === null) {
      throw new NotFoundError("取込履歴が見つかりません");
    }
  },

  async clearDriveFile(ledgerId, importFileId) {
    const { data, error } = await client
      .from(TABLE)
      .update({ drive_file_id: null, drive_web_view_link: null })
      .eq("id", importFileId)
      .eq("ledger_id", ledgerId)
      .is("deleted_at", null)
      .select("id")
      .maybeSingle();

    if (error) {
      throw new Error(`Failed to clear drive file: ${error.message}`);
    }
    if (data === null) {
      throw new NotFoundError("取込履歴が見つかりません");
    }
  },

  async list(ledgerId, page, perPage) {
    const from = (page - 1) * perPage;
    const { data, error, count } = await client
      .from(TABLE)
      .select(COLUMNS, { count: "exact" })
      .eq("ledger_id", ledgerId)
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .range(from, from + perPage - 1);

    if (error) {
      throw new Error(`Failed to list import files: ${error.message}`);
    }
    return {
      items: z.array(rowSchema).parse(data).map(toImportFile),
      totalCount: count ?? 0,
    };
  },
});
