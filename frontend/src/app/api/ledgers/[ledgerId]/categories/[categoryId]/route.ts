/** カテゴリAPI（api.md 5.3 / 5.4）。PATCH: 名称・固定費フラグ変更。DELETE: 付け替え削除。 */
import { z } from "zod";

import { handleApiError, jsonData, noContent } from "@/shared/api/response";
import { requireUserId } from "@/shared/api/session";
import { getSupabaseServerClient } from "@/shared/lib/supabaseServer";

import { createCategoryRepository } from "@/features/category/repositories/categoryRepository";
import { deleteCategory, updateCategory } from "@/features/category/services/categoryService";
import { createLedgerMemberRepository } from "@/features/ledger/repositories/ledgerMemberRepository";
import { assertLedgerAccess } from "@/features/ledger/services/authorization";

type RouteContext = { params: Promise<{ ledgerId: string; categoryId: string }> };

const paramsSchema = z.object({ ledgerId: z.uuid(), categoryId: z.uuid() });

const patchBodySchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "カテゴリ名を入力してください")
    .max(30, "30文字以内で入力してください")
    .optional(),
  isFixedCost: z.boolean().optional(),
});

export async function PATCH(request: Request, context: RouteContext): Promise<Response> {
  try {
    const userId = await requireUserId();
    const { ledgerId, categoryId } = paramsSchema.parse(await context.params);
    const body = patchBodySchema.parse(await request.json());
    const client = getSupabaseServerClient();
    await assertLedgerAccess(createLedgerMemberRepository(client), userId, ledgerId);

    const category = await updateCategory(createCategoryRepository(client), {
      ledgerId,
      categoryId,
      name: body.name,
      isFixedCost: body.isFixedCost,
    });
    return jsonData(category);
  } catch (error) {
    return handleApiError(error);
  }
}

export async function DELETE(request: Request, context: RouteContext): Promise<Response> {
  try {
    const userId = await requireUserId();
    const { ledgerId, categoryId } = paramsSchema.parse(await context.params);
    const reassignTo = new URL(request.url).searchParams.get("reassignToCategoryId");
    const client = getSupabaseServerClient();
    await assertLedgerAccess(createLedgerMemberRepository(client), userId, ledgerId);

    await deleteCategory(createCategoryRepository(client), {
      ledgerId,
      categoryId,
      reassignToCategoryId: reassignTo === null ? undefined : z.uuid().parse(reassignTo),
    });
    return noContent();
  } catch (error) {
    return handleApiError(error);
  }
}
