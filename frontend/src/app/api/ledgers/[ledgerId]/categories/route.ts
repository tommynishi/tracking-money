/** カテゴリAPI（api.md 5.1 / 5.2）。GET: 一覧（sort_order順）。POST: 追加。 */
import { z } from "zod";

import { handleApiError, jsonData } from "@/shared/api/response";
import { requireUserId } from "@/shared/api/session";
import { getSupabaseServerClient } from "@/shared/lib/supabaseServer";

import { createCategoryRepository } from "@/features/category/repositories/categoryRepository";
import { createCategory, listCategories } from "@/features/category/services/categoryService";
import { createLedgerMemberRepository } from "@/features/ledger/repositories/ledgerMemberRepository";
import { assertLedgerAccess } from "@/features/ledger/services/authorization";

const paramsSchema = z.object({ ledgerId: z.uuid() });

const createBodySchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "カテゴリ名を入力してください")
    .max(30, "30文字以内で入力してください"),
  isFixedCost: z.boolean().default(false),
});

export async function GET(
  _request: Request,
  context: { params: Promise<{ ledgerId: string }> },
): Promise<Response> {
  try {
    const userId = await requireUserId();
    const { ledgerId } = paramsSchema.parse(await context.params);
    const client = getSupabaseServerClient();
    await assertLedgerAccess(createLedgerMemberRepository(client), userId, ledgerId);

    const categories = await listCategories(createCategoryRepository(client), ledgerId);
    return jsonData(categories);
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(
  request: Request,
  context: { params: Promise<{ ledgerId: string }> },
): Promise<Response> {
  try {
    const userId = await requireUserId();
    const { ledgerId } = paramsSchema.parse(await context.params);
    const body = createBodySchema.parse(await request.json());
    const client = getSupabaseServerClient();
    await assertLedgerAccess(createLedgerMemberRepository(client), userId, ledgerId);

    const category = await createCategory(createCategoryRepository(client), {
      ledgerId,
      name: body.name,
      isFixedCost: body.isFixedCost,
    });
    return jsonData(category, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
