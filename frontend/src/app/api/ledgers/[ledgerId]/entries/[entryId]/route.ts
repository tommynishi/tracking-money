/** 明細API（api.md 6.3〜6.5）。GET: 詳細。PATCH: 編集。DELETE: 論理削除。 */
import { z } from "zod";

import { handleApiError, jsonData, noContent } from "@/shared/api/response";
import { requireUserId } from "@/shared/api/session";
import { getSupabaseServerClient } from "@/shared/lib/supabaseServer";

import { createCategoryRepository } from "@/features/category/repositories/categoryRepository";
import { createEntryRepository } from "@/features/entry/repositories/entryRepository";
import { deleteEntry, getEntry, updateEntry } from "@/features/entry/services/entryService";
import { createLedgerMemberRepository } from "@/features/ledger/repositories/ledgerMemberRepository";
import { assertLedgerAccess } from "@/features/ledger/services/authorization";

type RouteContext = { params: Promise<{ ledgerId: string; entryId: string }> };

const paramsSchema = z.object({ ledgerId: z.uuid(), entryId: z.uuid() });

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

const isCalendarDate = (value: string): boolean => {
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(year, month - 1, day);
  return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day;
};

const patchBodySchema = z.object({
  usedOn: z
    .string()
    .regex(DATE_PATTERN, "YYYY-MM-DD 形式で入力してください")
    .refine(isCalendarDate, "存在する日付を指定してください")
    .optional(),
  amount: z.number().int("金額は整数で入力してください").optional(),
  description: z.string().trim().min(1, "摘要を入力してください").max(200).optional(),
  categoryId: z.uuid().optional(),
  paymentMethod: z.string().trim().max(50).nullable().optional(),
  memo: z.string().max(500).nullable().optional(),
});

export async function GET(_request: Request, context: RouteContext): Promise<Response> {
  try {
    const userId = await requireUserId();
    const { ledgerId, entryId } = paramsSchema.parse(await context.params);
    const client = getSupabaseServerClient();
    await assertLedgerAccess(createLedgerMemberRepository(client), userId, ledgerId);

    const entry = await getEntry(createEntryRepository(client), { ledgerId, entryId });
    return jsonData(entry);
  } catch (error) {
    return handleApiError(error);
  }
}

export async function PATCH(request: Request, context: RouteContext): Promise<Response> {
  try {
    const userId = await requireUserId();
    const { ledgerId, entryId } = paramsSchema.parse(await context.params);
    const body = patchBodySchema.parse(await request.json());
    const client = getSupabaseServerClient();
    await assertLedgerAccess(createLedgerMemberRepository(client), userId, ledgerId);

    const entry = await updateEntry(
      {
        entryRepository: createEntryRepository(client),
        categoryRepository: createCategoryRepository(client),
      },
      { ledgerId, entryId, ...body },
    );
    return jsonData(entry);
  } catch (error) {
    return handleApiError(error);
  }
}

export async function DELETE(_request: Request, context: RouteContext): Promise<Response> {
  try {
    const userId = await requireUserId();
    const { ledgerId, entryId } = paramsSchema.parse(await context.params);
    const client = getSupabaseServerClient();
    await assertLedgerAccess(createLedgerMemberRepository(client), userId, ledgerId);

    await deleteEntry(createEntryRepository(client), { ledgerId, entryId });
    return noContent();
  } catch (error) {
    return handleApiError(error);
  }
}
