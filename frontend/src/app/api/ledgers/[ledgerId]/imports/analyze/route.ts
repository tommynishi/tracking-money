/** 取込解析API（api.md 7.1）。multipart/form-data でファイルを受け取りプレビューを返す。 */
import { z } from "zod";

import { ValidationError } from "@/shared/errors/appError";
import { handleApiError, jsonData } from "@/shared/api/response";
import { requireUserId } from "@/shared/api/session";
import { getSupabaseServerClient } from "@/shared/lib/supabaseServer";

import { createCategoryRepository } from "@/features/category/repositories/categoryRepository";
import { createEntryRepository } from "@/features/entry/repositories/entryRepository";
import { createLedgerMemberRepository } from "@/features/ledger/repositories/ledgerMemberRepository";
import { assertLedgerAccess } from "@/features/ledger/services/authorization";

import { createCategoryRuleRepository } from "@/features/import/repositories/categoryRuleRepository";
import { createCsvColumnMappingRepository } from "@/features/import/repositories/csvColumnMappingRepository";
import { createImportFileRepository } from "@/features/import/repositories/importFileRepository";
import { createLedgerDriveFolderRepository } from "@/features/import/repositories/ledgerDriveFolderRepository";
import { analyzeImport } from "@/features/import/services/analyzeImport";
import { createDriveClient } from "@/features/import/services/drive/driveClient";
import { createOpenAiClassifier } from "@/features/import/services/openaiClassifier";
import { createPdfStatementOcr } from "@/features/import/services/ocr/pdfStatementOcr";

const paramsSchema = z.object({ ledgerId: z.uuid() });

const fieldsSchema = z.object({
  format: z.enum(["rakuten", "jcb", "epos", "saison", "generic"]).optional(),
  mappingId: z.uuid().optional(),
  force: z
    .enum(["true", "false"])
    .default("false")
    .transform((value) => value === "true"),
});

/** 最大ファイルサイズ（api.md 7.1） */
const MAX_FILE_BYTES = 10 * 1024 * 1024;

const formString = (form: FormData, key: string): string | undefined => {
  const value = form.get(key);
  return typeof value === "string" && value !== "" ? value : undefined;
};

export async function POST(
  request: Request,
  context: { params: Promise<{ ledgerId: string }> },
): Promise<Response> {
  try {
    const userId = await requireUserId();
    const { ledgerId } = paramsSchema.parse(await context.params);
    const client = getSupabaseServerClient();
    await assertLedgerAccess(createLedgerMemberRepository(client), userId, ledgerId);

    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) {
      throw new ValidationError("ファイルを指定してください");
    }
    if (file.size > MAX_FILE_BYTES) {
      throw new ValidationError("ファイルサイズは10MB以下にしてください");
    }
    const fields = fieldsSchema.parse({
      format: formString(form, "format"),
      mappingId: formString(form, "mappingId"),
      force: formString(form, "force") ?? "false",
    });
    const mappingRaw = formString(form, "mapping");
    let inlineMapping: unknown;
    if (mappingRaw !== undefined) {
      try {
        inlineMapping = JSON.parse(mappingRaw);
      } catch {
        throw new ValidationError("mapping は JSON 文字列で指定してください");
      }
    }

    const result = await analyzeImport(
      {
        entryRepository: createEntryRepository(client),
        categoryRepository: createCategoryRepository(client),
        ruleRepository: createCategoryRuleRepository(client),
        classifier: createOpenAiClassifier(),
        importFileRepository: createImportFileRepository(client),
        mappingRepository: createCsvColumnMappingRepository(client),
        drive: createDriveClient(),
        folderRepository: createLedgerDriveFolderRepository(client),
        pdfOcr: createPdfStatementOcr(),
      },
      {
        ledgerId,
        userId,
        fileName: file.name,
        bytes: new Uint8Array(await file.arrayBuffer()),
        format: fields.format,
        mappingId: fields.mappingId,
        inlineMapping,
        force: fields.force,
      },
    );
    return jsonData(result);
  } catch (error) {
    return handleApiError(error);
  }
}
