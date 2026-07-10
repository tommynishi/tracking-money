/**
 * 招待の承諾API（api.md 4.3・FR-INVITE-02/03）。
 * 本人・pending・家族所属制約（FR-LEDGER-05）の判定は Service（acceptInvitation）。
 */
import { z } from "zod";

import { handleApiError, jsonData } from "@/shared/api/response";
import { requireUserId } from "@/shared/api/session";
import { getSupabaseServerClient } from "@/shared/lib/supabaseServer";

import { createInvitationRepository } from "@/features/invitation/repositories/invitationRepository";
import { acceptInvitation } from "@/features/invitation/services/invitationService";
import { createLedgerRepository } from "@/features/ledger/repositories/ledgerRepository";

const paramsSchema = z.object({ invitationId: z.uuid() });
const bodySchema = z.object({ deleteOwnFamilyLedger: z.boolean().default(false) });

export async function POST(
  request: Request,
  context: { params: Promise<{ invitationId: string }> },
): Promise<Response> {
  try {
    const userId = await requireUserId();
    const { invitationId } = paramsSchema.parse(await context.params);
    const body = bodySchema.parse(await request.json());
    const client = getSupabaseServerClient();

    const invitation = await acceptInvitation(
      {
        invitationRepository: createInvitationRepository(client),
        ledgerRepository: createLedgerRepository(client),
      },
      { invitationId, userId, deleteOwnFamilyLedger: body.deleteOwnFamilyLedger },
    );
    return jsonData(invitation);
  } catch (error) {
    return handleApiError(error);
  }
}
