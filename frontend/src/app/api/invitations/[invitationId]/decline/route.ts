/** 招待の拒否API（api.md 4.4）。招待先本人の判定は Service（declineInvitation）。 */
import { z } from "zod";

import { handleApiError, jsonData } from "@/shared/api/response";
import { requireUserId } from "@/shared/api/session";
import { getSupabaseServerClient } from "@/shared/lib/supabaseServer";

import { createInvitationRepository } from "@/features/invitation/repositories/invitationRepository";
import { declineInvitation } from "@/features/invitation/services/invitationService";

const paramsSchema = z.object({ invitationId: z.uuid() });

export async function POST(
  _request: Request,
  context: { params: Promise<{ invitationId: string }> },
): Promise<Response> {
  try {
    const userId = await requireUserId();
    const { invitationId } = paramsSchema.parse(await context.params);

    const invitation = await declineInvitation(
      createInvitationRepository(getSupabaseServerClient()),
      { invitationId, userId },
    );
    return jsonData(invitation);
  } catch (error) {
    return handleApiError(error);
  }
}
