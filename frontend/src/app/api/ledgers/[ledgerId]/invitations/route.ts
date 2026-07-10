/** 家族招待の作成API（api.md 4.1・FR-INVITE-01）。オーナー判定・業務ルールは Service。 */
import { z } from "zod";

import { handleApiError, jsonData } from "@/shared/api/response";
import { requireUserId } from "@/shared/api/session";
import { getSupabaseServerClient } from "@/shared/lib/supabaseServer";

import { createInvitationRepository } from "@/features/invitation/repositories/invitationRepository";
import { createInvitation } from "@/features/invitation/services/invitationService";
import { createLedgerMemberRepository } from "@/features/ledger/repositories/ledgerMemberRepository";
import { createLedgerRepository } from "@/features/ledger/repositories/ledgerRepository";
import { assertLedgerAccess } from "@/features/ledger/services/authorization";

const paramsSchema = z.object({ ledgerId: z.uuid() });
const bodySchema = z.object({ inviteeUserId: z.uuid() });

export async function POST(
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

    const invitation = await createInvitation(
      {
        invitationRepository: createInvitationRepository(client),
        ledgerRepository: createLedgerRepository(client),
        memberRepository,
      },
      { ledgerId, inviterUserId: userId, inviteeUserId: body.inviteeUserId },
    );
    return jsonData(invitation, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
