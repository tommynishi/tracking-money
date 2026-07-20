/** Drive原本の削除API（api.md 7.6・FR-DRIVE-04）。明細と取込履歴は残す。 */
import { z } from "zod";

import { NotFoundError } from "@/shared/errors/appError";
import { handleApiError, noContent } from "@/shared/api/response";
import { requireUserId } from "@/shared/api/session";
import { getSupabaseServerClient } from "@/shared/lib/supabaseServer";

import { createLedgerMemberRepository } from "@/features/ledger/repositories/ledgerMemberRepository";
import { assertLedgerAccess } from "@/features/ledger/services/authorization";

import { createImportFileRepository } from "@/features/import/repositories/importFileRepository";
import { createDriveClient } from "@/features/import/services/drive/driveClient";

const paramsSchema = z.object({ ledgerId: z.uuid(), importFileId: z.uuid() });

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ ledgerId: string; importFileId: string }> },
): Promise<Response> {
  try {
    const userId = await requireUserId();
    const { ledgerId, importFileId } = paramsSchema.parse(await context.params);
    const client = getSupabaseServerClient();
    await assertLedgerAccess(createLedgerMemberRepository(client), userId, ledgerId);

    const repository = createImportFileRepository(client);
    const importFile = await repository.getById(ledgerId, importFileId);
    if (importFile === null || importFile.driveFileId === null) {
      throw new NotFoundError("原本ファイルが見つかりません");
    }
    await createDriveClient().deleteFile(importFile.driveFileId);
    await repository.clearDriveFile(ledgerId, importFileId);
    return noContent();
  } catch (error) {
    return handleApiError(error);
  }
}
