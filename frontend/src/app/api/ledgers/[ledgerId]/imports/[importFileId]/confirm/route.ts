/** 取込確定API（api.md 7.2・FR-CSV-04）。プレビューで確認した明細を登録する。 */
import { z } from "zod";

import { handleApiError, jsonData } from "@/shared/api/response";
import { requireUserId } from "@/shared/api/session";
import { getSupabaseServerClient } from "@/shared/lib/supabaseServer";

import { createCategoryRepository } from "@/features/category/repositories/categoryRepository";
import { createEntryRepository } from "@/features/entry/repositories/entryRepository";
import { createLedgerMemberRepository } from "@/features/ledger/repositories/ledgerMemberRepository";
import { assertLedgerAccess } from "@/features/ledger/services/authorization";

import { createCategoryRuleRepository } from "@/features/import/repositories/categoryRuleRepository";
import { createImportFileRepository } from "@/features/import/repositories/importFileRepository";
import { confirmImport } from "@/features/import/services/confirmImport";

const paramsSchema = z.object({ ledgerId: z.uuid(), importFileId: z.uuid() });

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const MONTH_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/;

const bodySchema = z.object({
  rows: z
    .array(
      z.object({
        usedOn: z.string().regex(DATE_PATTERN, "YYYY-MM-DD 形式で指定してください"),
        billingMonth: z.string().regex(MONTH_PATTERN, "YYYY-MM 形式で指定してください"),
        amount: z.number().int(),
        description: z.string().trim().min(1).max(200),
        categoryId: z.uuid(),
        memo: z.string().max(500).nullable().default(null),
        skip: z.boolean().default(false),
      }),
    )
    .max(5000),
});

export async function POST(
  request: Request,
  context: { params: Promise<{ ledgerId: string; importFileId: string }> },
): Promise<Response> {
  try {
    const userId = await requireUserId();
    const { ledgerId, importFileId } = paramsSchema.parse(await context.params);
    const body = bodySchema.parse(await request.json());
    const client = getSupabaseServerClient();
    await assertLedgerAccess(createLedgerMemberRepository(client), userId, ledgerId);

    const result = await confirmImport(
      {
        importFileRepository: createImportFileRepository(client),
        entryRepository: createEntryRepository(client),
        categoryRepository: createCategoryRepository(client),
        ruleRepository: createCategoryRuleRepository(client),
      },
      { ledgerId, userId, importFileId, rows: body.rows },
    );
    return jsonData(result);
  } catch (error) {
    return handleApiError(error);
  }
}
