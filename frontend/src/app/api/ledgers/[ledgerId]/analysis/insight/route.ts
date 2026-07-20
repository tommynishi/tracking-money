/** AI所見API（api.md 9.6・FR-AI-01/06/08/09・FR-AI-11）。 */
import { z } from "zod";

import { handleApiError, jsonData } from "@/shared/api/response";
import { requireUserId } from "@/shared/api/session";
import { getSupabaseServerClient } from "@/shared/lib/supabaseServer";

import { createCategoryRepository } from "@/features/category/repositories/categoryRepository";
import { createLedgerMemberRepository } from "@/features/ledger/repositories/ledgerMemberRepository";
import { assertLedgerAccess } from "@/features/ledger/services/authorization";

import { createAnalysisCacheRepository } from "@/features/analysis/repositories/analysisCacheRepository";
import { createEntryAnalysisRepository } from "@/features/analysis/repositories/entryAnalysisRepository";
import { getInsight } from "@/features/analysis/services/insightService";

const paramsSchema = z.object({ ledgerId: z.uuid() });
const querySchema = z.object({
  type: z.enum(["monthly_review", "fixed_cost", "saving_advice", "forecast"]),
  month: z.string(),
  refresh: z
    .enum(["true", "false"])
    .default("false")
    .transform((value) => value === "true"),
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

    const result = await getInsight(
      {
        entryAnalysisRepository: createEntryAnalysisRepository(client),
        categoryRepository: createCategoryRepository(client),
        cacheRepository: createAnalysisCacheRepository(client),
      },
      ledgerId,
      query.type,
      query.month,
      query.refresh,
    );
    return jsonData(result);
  } catch (error) {
    return handleApiError(error);
  }
}
