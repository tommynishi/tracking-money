/** ユーザー検索API（api.md 2.3・FR-INVITE-01）。LINE ID は返さない。 */
import { handleApiError, jsonData } from "@/shared/api/response";
import { requireUserId } from "@/shared/api/session";
import { getSupabaseServerClient } from "@/shared/lib/supabaseServer";

import { createUserRepository } from "@/features/auth/repositories/userRepository";
import { searchUsers } from "@/features/auth/services/userService";

export async function GET(request: Request): Promise<Response> {
  try {
    await requireUserId();
    const keyword = new URL(request.url).searchParams.get("q") ?? "";

    const users = await searchUsers(createUserRepository(getSupabaseServerClient()), keyword);
    return jsonData(users);
  } catch (error) {
    return handleApiError(error);
  }
}
