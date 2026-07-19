/** メンバー除外・退出API（api.md 3.7・FR-INVITE-05/06）。可否判定は Service（removeMember）。 */
import { z } from "zod";

import { handleApiError, noContent } from "@/shared/api/response";
import { requireUserId } from "@/shared/api/session";
import { getSupabaseServerClient } from "@/shared/lib/supabaseServer";

import { createLedgerMemberRepository } from "@/features/ledger/repositories/ledgerMemberRepository";
import { assertLedgerAccess } from "@/features/ledger/services/authorization";
import { removeMember } from "@/features/ledger/services/memberService";

const paramsSchema = z.object({ ledgerId: z.uuid(), userId: z.uuid() });

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ ledgerId: string; userId: string }> },
): Promise<Response> {
  try {
    const actorUserId = await requireUserId();
    const { ledgerId, userId: targetUserId } = paramsSchema.parse(await context.params);
    const repository = createLedgerMemberRepository(getSupabaseServerClient());
    await assertLedgerAccess(repository, actorUserId, ledgerId);

    await removeMember(repository, { ledgerId, actorUserId, targetUserId });
    return noContent();
  } catch (error) {
    return handleApiError(error);
  }
}
