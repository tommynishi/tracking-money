/** CSV列マッピングAPI（api.md 8.3 / 8.4）。PATCH: 変更。DELETE: 論理削除。 */
import { z } from "zod";

import { handleApiError, jsonData, noContent } from "@/shared/api/response";
import { requireUserId } from "@/shared/api/session";
import { getSupabaseServerClient } from "@/shared/lib/supabaseServer";

import { createLedgerMemberRepository } from "@/features/ledger/repositories/ledgerMemberRepository";
import { assertLedgerAccess } from "@/features/ledger/services/authorization";

import { createCsvColumnMappingRepository } from "@/features/import/repositories/csvColumnMappingRepository";
import { columnMappingSchema } from "@/features/import/services/columnMapping";

const paramsSchema = z.object({ ledgerId: z.uuid(), mappingId: z.uuid() });

const patchBodySchema = z.object({
  name: z.string().trim().min(1).max(50).optional(),
  mapping: columnMappingSchema.optional(),
});

export async function PATCH(
  request: Request,
  context: { params: Promise<{ ledgerId: string; mappingId: string }> },
): Promise<Response> {
  try {
    const userId = await requireUserId();
    const { ledgerId, mappingId } = paramsSchema.parse(await context.params);
    const body = patchBodySchema.parse(await request.json());
    const client = getSupabaseServerClient();
    await assertLedgerAccess(createLedgerMemberRepository(client), userId, ledgerId);

    const updated = await createCsvColumnMappingRepository(client).update(ledgerId, mappingId, {
      name: body.name,
      mapping: body.mapping,
    });
    return jsonData({ id: updated.id, name: updated.name, mapping: updated.mapping });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ ledgerId: string; mappingId: string }> },
): Promise<Response> {
  try {
    const userId = await requireUserId();
    const { ledgerId, mappingId } = paramsSchema.parse(await context.params);
    const client = getSupabaseServerClient();
    await assertLedgerAccess(createLedgerMemberRepository(client), userId, ledgerId);

    await createCsvColumnMappingRepository(client).softDelete(ledgerId, mappingId);
    return noContent();
  } catch (error) {
    return handleApiError(error);
  }
}
