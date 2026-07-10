/** カテゴリ並び替えAPI（api.md 5.5・FR-CATEGORY-01）。全件の順序を受け取る。 */
import { z } from "zod";

import { handleApiError, noContent } from "@/shared/api/response";
import { requireUserId } from "@/shared/api/session";
import { getSupabaseServerClient } from "@/shared/lib/supabaseServer";

import { createCategoryRepository } from "@/features/category/repositories/categoryRepository";
import { reorderCategories } from "@/features/category/services/categoryService";
import { createLedgerMemberRepository } from "@/features/ledger/repositories/ledgerMemberRepository";
import { assertLedgerAccess } from "@/features/ledger/services/authorization";

const paramsSchema = z.object({ ledgerId: z.uuid() });
const bodySchema = z.object({ categoryIds: z.array(z.uuid()).min(1) });

export async function PUT(
  request: Request,
  context: { params: Promise<{ ledgerId: string }> },
): Promise<Response> {
  try {
    const userId = await requireUserId();
    const { ledgerId } = paramsSchema.parse(await context.params);
    const body = bodySchema.parse(await request.json());
    const client = getSupabaseServerClient();
    await assertLedgerAccess(createLedgerMemberRepository(client), userId, ledgerId);

    await reorderCategories(createCategoryRepository(client), {
      ledgerId,
      categoryIds: body.categoryIds,
    });
    return noContent();
  } catch (error) {
    return handleApiError(error);
  }
}
