/** 招待の取消API（api.md 4.5）。招待者本人・pending の判定は Service / Repository。 */
import { z } from "zod";

import { handleApiError, noContent } from "@/shared/api/response";
import { requireUserId } from "@/shared/api/session";
import { getSupabaseServerClient } from "@/shared/lib/supabaseServer";

import { createInvitationRepository } from "@/features/invitation/repositories/invitationRepository";
import { cancelInvitation } from "@/features/invitation/services/invitationService";

const paramsSchema = z.object({ invitationId: z.uuid() });

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ invitationId: string }> },
): Promise<Response> {
  try {
    const userId = await requireUserId();
    const { invitationId } = paramsSchema.parse(await context.params);

    await cancelInvitation(createInvitationRepository(getSupabaseServerClient()), {
      invitationId,
      userId,
    });
    return noContent();
  } catch (error) {
    return handleApiError(error);
  }
}
