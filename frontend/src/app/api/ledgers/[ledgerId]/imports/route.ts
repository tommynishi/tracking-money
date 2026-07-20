/** 取込履歴一覧API（api.md 7.3・SCR-10）。作成日時降順・ページング。 */
import { z } from "zod";

import { handleApiError, jsonData } from "@/shared/api/response";
import { requireUserId } from "@/shared/api/session";
import { getSupabaseServerClient } from "@/shared/lib/supabaseServer";

import { createLedgerMemberRepository } from "@/features/ledger/repositories/ledgerMemberRepository";
import { assertLedgerAccess } from "@/features/ledger/services/authorization";

import {
  createImportFileRepository,
  type ImportFile,
} from "@/features/import/repositories/importFileRepository";

const paramsSchema = z.object({ ledgerId: z.uuid() });

const querySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  perPage: z.coerce.number().int().min(1).max(100).default(20),
});

/** 一覧用のDTO（file_hash は内部用のため返さない）。 */
const toListItem = (item: ImportFile): Record<string, unknown> => ({
  id: item.id,
  fileName: item.fileName,
  fileType: item.fileType,
  format: item.format,
  status: item.status,
  importedCount: item.importedCount,
  skippedCount: item.skippedCount,
  errorCount: item.errorCount,
  driveWebViewLink: item.driveWebViewLink,
  driveStatus: item.driveStatus,
  hasDriveFile: item.driveFileId !== null,
  createdAt: item.createdAt,
});

export async function GET(
  request: Request,
  context: { params: Promise<{ ledgerId: string }> },
): Promise<Response> {
  try {
    const userId = await requireUserId();
    const { ledgerId } = paramsSchema.parse(await context.params);
    const query = querySchema.parse(Object.fromEntries(new URL(request.url).searchParams));
    const client = getSupabaseServerClient();
    await assertLedgerAccess(createLedgerMemberRepository(client), userId, ledgerId);

    const { items, totalCount } = await createImportFileRepository(client).list(
      ledgerId,
      query.page,
      query.perPage,
    );
    return jsonData(items.map(toListItem), {
      meta: {
        page: query.page,
        perPage: query.perPage,
        totalCount,
        totalPages: Math.ceil(totalCount / query.perPage),
      },
    });
  } catch (error) {
    return handleApiError(error);
  }
}
