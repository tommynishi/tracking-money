/** 精算API（api.md 12.2・FR-SPLIT-05・家族家計簿限定）。 */
import { z } from "zod";

import { NotFoundError } from "@/shared/errors/appError";
import { handleApiError, jsonData } from "@/shared/api/response";
import { requireUserId } from "@/shared/api/session";
import { getSupabaseServerClient } from "@/shared/lib/supabaseServer";

import { createLedgerMemberRepository } from "@/features/ledger/repositories/ledgerMemberRepository";
import { createLedgerRepository } from "@/features/ledger/repositories/ledgerRepository";
import { assertLedgerAccess } from "@/features/ledger/services/authorization";

import { createSettlementEntryRepository } from "@/features/split/repositories/settlementEntryRepository";
import { getSettlement } from "@/features/split/services/settlementService";

const paramsSchema = z.object({ ledgerId: z.uuid() });
const MONTH_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/;
const querySchema = z.object({
  billingMonth: z.string().regex(MONTH_PATTERN, "YYYY-MM 形式で指定してください"),
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

    const ledger = await createLedgerRepository(client).getLedgerById(ledgerId);
    if (ledger === null) {
      throw new NotFoundError("家計簿が見つかりません");
    }

    const result = await getSettlement(
      {
        memberRepository: createLedgerMemberRepository(client),
        settlementEntryRepository: createSettlementEntryRepository(client),
      },
      ledger,
      ledgerId,
      query.billingMonth,
    );
    return jsonData(result);
  } catch (error) {
    return handleApiError(error);
  }
}
