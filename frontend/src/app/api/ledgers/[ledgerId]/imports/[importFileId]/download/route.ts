/** 原本ダウンロードAPI（api.md 7.5・FR-DRIVE-03）。APIがDriveから取得して返す。 */
import { z } from "zod";

import { NotFoundError } from "@/shared/errors/appError";
import { handleApiError } from "@/shared/api/response";
import { requireUserId } from "@/shared/api/session";
import { getSupabaseServerClient } from "@/shared/lib/supabaseServer";

import { createLedgerMemberRepository } from "@/features/ledger/repositories/ledgerMemberRepository";
import { assertLedgerAccess } from "@/features/ledger/services/authorization";

import { createImportFileRepository } from "@/features/import/repositories/importFileRepository";
import { createDriveClient } from "@/features/import/services/drive/driveClient";

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
    if (importFile === null || importFile.driveFileId === null) {
      throw new NotFoundError("原本ファイルが見つかりません");
    }
    const bytes = await createDriveClient().downloadFile(importFile.driveFileId);
    return new Response(new Uint8Array(bytes), {
      headers: {
        "content-type": importFile.fileType === "pdf" ? "application/pdf" : "text/csv",
        "content-disposition": `attachment; filename*=UTF-8''${encodeURIComponent(importFile.fileName)}`,
      },
    });
  } catch (error) {
    return handleApiError(error);
  }
}
