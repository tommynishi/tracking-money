/** 取込履歴詳細API（api.md 7.4）。件数・エラー行・Drive保存状態を返す。 */
import { z } from "zod";

import { NotFoundError } from "@/shared/errors/appError";
import { handleApiError, jsonData } from "@/shared/api/response";
import { requireUserId } from "@/shared/api/session";
import { getSupabaseServerClient } from "@/shared/lib/supabaseServer";

import { createLedgerMemberRepository } from "@/features/ledger/repositories/ledgerMemberRepository";
import { assertLedgerAccess } from "@/features/ledger/services/authorization";

import { createImportFileRepository } from "@/features/import/repositories/importFileRepository";

const paramsSchema = z.object({ ledgerId: z.uuid(), importFileId: z.uuid() });

export async function GET(
  _request: Request,
  context: { params: Promise<{ ledgerId: string; importFileId: string }> },
): Promise<Response> {
  try {
    const userId = await requireUserId();
    const { ledgerId, importFileId } = paramsSchema.parse(await context.params);
    const client = getSupabaseServerClient();
    await assertLedgerAccess(createLedgerMemberRepository(client), userId, ledgerId);

    const importFile = await createImportFileRepository(client).getById(ledgerId, importFileId);
    if (importFile === null) {
      throw new NotFoundError("取込履歴が見つかりません");
    }
    return jsonData({
      id: importFile.id,
      fileName: importFile.fileName,
      fileType: importFile.fileType,
      format: importFile.format,
      billingMonth: importFile.billingMonth,
      status: importFile.status,
      importedCount: importFile.importedCount,
      skippedCount: importFile.skippedCount,
      errorCount: importFile.errorCount,
      errorRows: importFile.errorDetail ?? [],
      driveWebViewLink: importFile.driveWebViewLink,
      driveStatus: importFile.driveStatus,
      hasDriveFile: importFile.driveFileId !== null,
      createdAt: importFile.createdAt,
    });
  } catch (error) {
    return handleApiError(error);
  }
}
