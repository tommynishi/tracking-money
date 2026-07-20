/** 支出ランキングAPI（api.md 9.4・FR-AI-05）。month または from/to のいずれかを指定する。 */
import { z } from "zod";

import { ValidationError } from "@/shared/errors/appError";
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
  from: z.string().optional(),
  to: z.string().optional(),
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
    if (query.month !== undefined && (query.from !== undefined || query.to !== undefined)) {
      throw new ValidationError("month と from/to は同時に指定できません");
    }
    const client = getSupabaseServerClient();
    await assertLedgerAccess(createLedgerMemberRepository(client), userId, ledgerId);

    const deps = {
      entryAnalysisRepository: createEntryAnalysisRepository(client),
      categoryRepository: createCategoryRepository(client),
    };
    const period =
      query.from !== undefined && query.to !== undefined
        ? { from: query.from, to: query.to }
        : { month: query.month ?? todayInJst().slice(0, 7) };

    const result = await getRanking(deps, ledgerId, period, query.limit);
    return jsonData(result);
  } catch (error) {
    return handleApiError(error);
  }
}
