/** 支出ランキングAPI（api.md 9.4・FR-AI-05）。指定した支払月内のランキングを返す。 */
import { z } from "zod";

import { handleApiError, jsonData } from "@/shared/api/response";
import { requireUserId } from "@/shared/api/session";
import { getSupabaseServerClient } from "@/shared/lib/supabaseServer";

import { createCategoryRepository } from "@/features/category/repositories/categoryRepository";
import { createLedgerMemberRepository } from "@/features/ledger/repositories/ledgerMemberRepository";
import { assertLedgerAccess } from "@/features/ledger/services/authorization";

import { createEntryAnalysisRepository } from "@/features/analysis/repositories/entryAnalysisRepository";
import { getRanking } from "@/features/analysis/services/analysisService";
import { todayInJst } from "@/shared/utils/month";

const paramsSchema = z.object({ ledgerId: z.uuid() });
const querySchema = z.object({
  month: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
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

    const deps = {
      entryAnalysisRepository: createEntryAnalysisRepository(client),
      categoryRepository: createCategoryRepository(client),
    };

    const result = await getRanking(
      deps,
      ledgerId,
      query.month ?? todayInJst().slice(0, 7),
      query.limit,
    );
    return jsonData(result);
  } catch (error) {
    return handleApiError(error);
  }
}
