/** CSV列マッピングAPI（api.md 8.1 / 8.2・FR-CSV-02）。GET: 一覧。POST: 保存。 */
import { z } from "zod";

import { handleApiError, jsonData } from "@/shared/api/response";
import { requireUserId } from "@/shared/api/session";
import { getSupabaseServerClient } from "@/shared/lib/supabaseServer";

import { createLedgerMemberRepository } from "@/features/ledger/repositories/ledgerMemberRepository";
import { assertLedgerAccess } from "@/features/ledger/services/authorization";

import { createCsvColumnMappingRepository } from "@/features/import/repositories/csvColumnMappingRepository";
import { columnMappingSchema } from "@/features/import/services/columnMapping";

const paramsSchema = z.object({ ledgerId: z.uuid() });

const createBodySchema = z.object({
  name: z.string().trim().min(1, "マッピング名を入力してください").max(50),
  mapping: columnMappingSchema,
});

export async function GET(
  _request: Request,
  context: { params: Promise<{ ledgerId: string }> },
): Promise<Response> {
  try {
    const userId = await requireUserId();
    const { ledgerId } = paramsSchema.parse(await context.params);
    const client = getSupabaseServerClient();
    await assertLedgerAccess(createLedgerMemberRepository(client), userId, ledgerId);

    const mappings = await createCsvColumnMappingRepository(client).list(ledgerId);
    return jsonData(
      mappings.map(({ id, name, mapping }) => ({ id, name, mapping })),
    );
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(
  request: Request,
  context: { params: Promise<{ ledgerId: string }> },
): Promise<Response> {
  try {
    const userId = await requireUserId();
    const { ledgerId } = paramsSchema.parse(await context.params);
    const body = createBodySchema.parse(await request.json());
    const client = getSupabaseServerClient();
    await assertLedgerAccess(createLedgerMemberRepository(client), userId, ledgerId);

    const created = await createCsvColumnMappingRepository(client).create({
      ledgerId,
      name: body.name,
      mapping: body.mapping,
    });
    return jsonData({ id: created.id, name: created.name, mapping: created.mapping }, {
      status: 201,
    });
  } catch (error) {
    return handleApiError(error);
  }
}
