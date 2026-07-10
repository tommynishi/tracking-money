/** 家計簿API（api.md 3.1 / 3.2）。GET: 一覧。POST: 作成（FR-LEDGER-01〜02）。 */
import { z } from "zod";

import { handleApiError, jsonData } from "@/shared/api/response";
import { requireUserId } from "@/shared/api/session";
import { getSupabaseServerClient } from "@/shared/lib/supabaseServer";

import { createLedgerRepository } from "@/features/ledger/repositories/ledgerRepository";
import { createLedger, listLedgers } from "@/features/ledger/services/ledgerService";

const createBodySchema = z.object({
  type: z.enum(["personal", "family"]),
  name: z
    .string()
    .trim()
    .min(1, "家計簿名を入力してください")
    .max(50, "50文字以内で入力してください"),
});

export async function GET(): Promise<Response> {
  try {
    const userId = await requireUserId();
    const ledgers = await listLedgers(createLedgerRepository(getSupabaseServerClient()), userId);
    return jsonData(
      ledgers.map(({ ledger, role }) => ({
        id: ledger.id,
        type: ledger.type,
        name: ledger.name,
        role,
      })),
    );
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request: Request): Promise<Response> {
  try {
    const userId = await requireUserId();
    const body = createBodySchema.parse(await request.json());
    const ledger = await createLedger(createLedgerRepository(getSupabaseServerClient()), {
      ownerUserId: userId,
      type: body.type,
      name: body.name,
    });
    return jsonData({ id: ledger.id, type: ledger.type, name: ledger.name }, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
