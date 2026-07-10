/**
 * アカウントAPI（api.md 2.1 / 2.2）。
 * GET: ログイン中ユーザーの情報。PATCH: 表示名変更（FR-AUTH-04）。
 */
import { z } from "zod";

import { handleApiError, jsonData } from "@/shared/api/response";
import { requireUserId } from "@/shared/api/session";
import { getSupabaseServerClient } from "@/shared/lib/supabaseServer";

import { createUserRepository } from "@/features/auth/repositories/userRepository";
import { getMe, updateDisplayName } from "@/features/auth/services/userService";
import { createLedgerRepository } from "@/features/ledger/repositories/ledgerRepository";

const patchBodySchema = z.object({
  displayName: z.string(),
});

export async function GET(): Promise<Response> {
  try {
    const userId = await requireUserId();
    const client = getSupabaseServerClient();
    const me = await getMe(
      {
        userRepository: createUserRepository(client),
        ledgerRepository: createLedgerRepository(client),
      },
      userId,
    );
    return jsonData(me);
  } catch (error) {
    return handleApiError(error);
  }
}

export async function PATCH(request: Request): Promise<Response> {
  try {
    const userId = await requireUserId();
    const body = patchBodySchema.parse(await request.json());
    const user = await updateDisplayName(createUserRepository(getSupabaseServerClient()), {
      userId,
      displayName: body.displayName,
    });
    return jsonData({
      id: user.id,
      displayName: user.displayName,
      avatarUrl: user.avatarUrl,
    });
  } catch (error) {
    return handleApiError(error);
  }
}
