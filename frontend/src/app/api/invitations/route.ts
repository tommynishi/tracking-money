/** 招待一覧API（api.md 4.2）。自分宛（received・既定）／自分発（sent）を状態で絞り込む。 */
import { z } from "zod";

import { handleApiError, jsonData } from "@/shared/api/response";
import { requireUserId } from "@/shared/api/session";
import { getSupabaseServerClient } from "@/shared/lib/supabaseServer";

import { createInvitationRepository } from "@/features/invitation/repositories/invitationRepository";
import { listInvitations } from "@/features/invitation/services/invitationService";

const querySchema = z.object({
  direction: z.enum(["received", "sent"]).default("received"),
  status: z.enum(["pending", "accepted", "declined", "canceled"]).default("pending"),
});

export async function GET(request: Request): Promise<Response> {
  try {
    const userId = await requireUserId();
    const url = new URL(request.url);
    const query = querySchema.parse(Object.fromEntries(url.searchParams));

    const invitations = await listInvitations(
      createInvitationRepository(getSupabaseServerClient()),
      { userId, direction: query.direction, status: query.status },
    );
    return jsonData(invitations);
  } catch (error) {
    return handleApiError(error);
  }
}
