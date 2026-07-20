/** 明細API（api.md 6.1 / 6.2）。GET: 一覧（絞り込み・ソート・ページング）。POST: 手入力登録。 */
import { z } from "zod";

import { handleApiError, jsonData } from "@/shared/api/response";
import { requireUserId } from "@/shared/api/session";
import { getSupabaseServerClient } from "@/shared/lib/supabaseServer";

import { createCategoryRepository } from "@/features/category/repositories/categoryRepository";
import { createEntryRepository } from "@/features/entry/repositories/entryRepository";
import { createEntry, listEntries } from "@/features/entry/services/entryService";
import { createLedgerMemberRepository } from "@/features/ledger/repositories/ledgerMemberRepository";
import { assertLedgerAccess } from "@/features/ledger/services/authorization";

const paramsSchema = z.object({ ledgerId: z.uuid() });

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/** YYYY-MM-DD が実在する日付か（2026-02-30 等を拒否）。 */
const isCalendarDate = (value: string): boolean => {
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(year, month - 1, day);
  return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day;
};

const MONTH_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/;

const usedOnSchema = z
  .string()
  .regex(DATE_PATTERN, "YYYY-MM-DD 形式で入力してください")
  .refine(isCalendarDate, "存在する日付を指定してください");

const billingMonthSchema = z.string().regex(MONTH_PATTERN, "YYYY-MM 形式で入力してください");

const listQuerySchema = z.object({
  // 支払月（billing_month の完全一致。既定の絞り込み軸）
  billingMonth: billingMonthSchema.optional(),
  // 利用日の範囲絞り込み（支払月と併用可）
  from: usedOnSchema.optional(),
  to: usedOnSchema.optional(),
  categoryId: z.uuid().optional(),
  minAmount: z.coerce.number().int().optional(),
  maxAmount: z.coerce.number().int().optional(),
  q: z.string().optional(),
  source: z.enum(["manual", "csv", "pdf"]).optional(),
  sort: z.enum(["usedOn", "amount"]).default("usedOn"),
  order: z.enum(["asc", "desc"]).default("desc"),
  page: z.coerce.number().int().min(1).default(1),
  perPage: z.coerce.number().int().min(1).max(100).default(20),
});

const createBodySchema = z.object({
  usedOn: usedOnSchema,
  // 支払月。未指定なら利用日と同じ月（entryService の既定値）
  billingMonth: billingMonthSchema.optional(),
  // 円・整数。返金はマイナス値（api.md 1.1）
  amount: z.number().int("金額は整数で入力してください"),
  description: z.string().trim().min(1, "摘要を入力してください").max(200),
  categoryId: z.uuid(),
  paymentMethod: z.string().trim().max(50).nullable().default(null),
  memo: z.string().max(500).nullable().default(null),
});

export async function GET(
  request: Request,
  context: { params: Promise<{ ledgerId: string }> },
): Promise<Response> {
  try {
    const userId = await requireUserId();
    const { ledgerId } = paramsSchema.parse(await context.params);
    const query = listQuerySchema.parse(Object.fromEntries(new URL(request.url).searchParams));
    const client = getSupabaseServerClient();
    await assertLedgerAccess(createLedgerMemberRepository(client), userId, ledgerId);

    const result = await listEntries(createEntryRepository(client), ledgerId, {
      filters: {
        billingMonth: query.billingMonth,
        from: query.from,
        to: query.to,
        categoryId: query.categoryId,
        minAmount: query.minAmount,
        maxAmount: query.maxAmount,
        q: query.q,
        source: query.source,
      },
      sort: query.sort,
      order: query.order,
      page: query.page,
      perPage: query.perPage,
    });
    return jsonData(result.data, { meta: result.meta });
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

    const entry = await createEntry(
      {
        entryRepository: createEntryRepository(client),
        categoryRepository: createCategoryRepository(client),
      },
      {
        ledgerId,
        createdByUserId: userId,
        categoryId: body.categoryId,
        usedOn: body.usedOn,
        billingMonth: body.billingMonth,
        amount: body.amount,
        description: body.description,
        paymentMethod: body.paymentMethod,
        memo: body.memo,
      },
    );
    return jsonData(entry, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
