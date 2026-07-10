/** メンバー一覧API（api.md 3.6・FR-INVITE-05）。 */
import { z } from "zod";

import { handleApiError, jsonData } from "@/shared/api/response";
import { requireUserId } from "@/shared/api/session";
import { getSupabaseServerClient } from "@/shared/lib/supabaseServer";

import { createLedgerMemberRepository } from "@/features/ledger/repositories/ledgerMemberRepository";
import { assertLedgerAccess } from "@/features/ledger/services/authorization";
import { listMembers } from "@/features/ledger/services/memberService";

const paramsSchema = z.object({ ledgerId: z.uuid() });

export async function GET(
  _request: Request,
  context: { params: Promise<{ ledgerId: string }> },
): Promise<Response> {
  try {
    const userId = await requireUserId();
    const { ledgerId } = paramsSchema.parse(await context.params);
    const repository = createLedgerMemberRepository(getSupabaseServerClient());
    await assertLedgerAccess(repository, userId, ledgerId);

    const members = await listMembers(repository, ledgerId);
    return jsonData(members);
  } catch (error) {
    return handleApiError(error);
  }
}
