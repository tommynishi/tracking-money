/** 既定按分比重API（api.md 12.1・FR-SPLIT-01/02・家族家計簿限定）。 */
import { z } from "zod";

import { NotFoundError } from "@/shared/errors/appError";
import { handleApiError, jsonData } from "@/shared/api/response";
import { requireUserId } from "@/shared/api/session";
import { getSupabaseServerClient } from "@/shared/lib/supabaseServer";

import { createLedgerRepository } from "@/features/ledger/repositories/ledgerRepository";
import { createLedgerMemberRepository } from "@/features/ledger/repositories/ledgerMemberRepository";
import { assertLedgerAccess } from "@/features/ledger/services/authorization";
import { updateMemberWeights } from "@/features/ledger/services/memberService";

const paramsSchema = z.object({ ledgerId: z.uuid() });

const bodySchema = z.object({
  weights: z
    .array(
      z.object({
        userId: z.uuid(),
        weight: z.number().int().positive("比重は正の整数で入力してください"),
      }),
    )
    .min(1),
});

export async function PUT(
  request: Request,
  context: { params: Promise<{ ledgerId: string }> },
): Promise<Response> {
  try {
    const userId = await requireUserId();
    const { ledgerId } = paramsSchema.parse(await context.params);
    const body = bodySchema.parse(await request.json());
    const client = getSupabaseServerClient();
    const memberRepository = createLedgerMemberRepository(client);
    await assertLedgerAccess(memberRepository, userId, ledgerId);

    const ledger = await createLedgerRepository(client).getLedgerById(ledgerId);
    if (ledger === null) {
      throw new NotFoundError("家計簿が見つかりません");
    }

    const members = await updateMemberWeights(memberRepository, {
      ledgerId,
      ledger,
      actorUserId: userId,
      weights: body.weights,
    });
    return jsonData(members);
  } catch (error) {
    return handleApiError(error);
  }
}
