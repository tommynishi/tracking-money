/** カテゴリ別推移API（api.md 9.3・FR-AI-04）。 */
import { z } from "zod";

import { handleApiError, jsonData } from "@/shared/api/response";
import { requireUserId } from "@/shared/api/session";
import { getSupabaseServerClient } from "@/shared/lib/supabaseServer";

import { createCategoryRepository } from "@/features/category/repositories/categoryRepository";
import { createLedgerMemberRepository } from "@/features/ledger/repositories/ledgerMemberRepository";
import { assertLedgerAccess } from "@/features/ledger/services/authorization";

import { createEntryAnalysisRepository } from "@/features/analysis/repositories/entryAnalysisRepository";
import { getTrend } from "@/features/analysis/services/analysisService";
import { currentBillingMonth } from "@/shared/utils/month";

const paramsSchema = z.object({ ledgerId: z.uuid() });
const querySchema = z.object({
  month: z.string().optional(),
  months: z.coerce.number().int().min(1).max(36).default(12),
  categoryId: z.uuid().optional(),
});

export async function GET(
  request: Request,
  context: { params: Promise<{ ledgerId: string }> },
): Promise<Response> {
  try {
    const userId = await requireUserId();
    const { ledgerId } = paramsSchema.parse(await context.params);
    const query = querySchema.parse(Object.fromEntries(new URL(request.url).searchParams));
    const client = getSupabaseServerClient();
    await assertLedgerAccess(createLedgerMemberRepository(client), userId, ledgerId);

    const result = await getTrend(
      {
        entryAnalysisRepository: createEntryAnalysisRepository(client),
        categoryRepository: createCategoryRepository(client),
      },
      ledgerId,
      query.month ?? currentBillingMonth(),
      query.months,
      query.categoryId,
    );
    return jsonData(result);
  } catch (error) {
    return handleApiError(error);
  }
}
