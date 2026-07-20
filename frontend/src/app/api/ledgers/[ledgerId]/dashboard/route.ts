/** ダッシュボードAPI（api.md 9.1・FR-DASH-01）。今月の集計と直近明細を一括取得する。 */
import { z } from "zod";

import { handleApiError, jsonData } from "@/shared/api/response";
import { requireUserId } from "@/shared/api/session";
import { getSupabaseServerClient } from "@/shared/lib/supabaseServer";

import { createCategoryRepository } from "@/features/category/repositories/categoryRepository";
import { createEntryRepository } from "@/features/entry/repositories/entryRepository";
import { createLedgerMemberRepository } from "@/features/ledger/repositories/ledgerMemberRepository";
import { assertLedgerAccess } from "@/features/ledger/services/authorization";

import { createEntryAnalysisRepository } from "@/features/analysis/repositories/entryAnalysisRepository";
import { getDashboard } from "@/features/analysis/services/analysisService";
import { todayInJst } from "@/shared/utils/month";

const paramsSchema = z.object({ ledgerId: z.uuid() });
const querySchema = z.object({ month: z.string().optional() });

export async function GET(
  request: Request,
  context: { params: Promise<{ ledgerId: string }> },
): Promise<Response> {
  try {
    const userId = await requireUserId();
    const { ledgerId } = paramsSchema.parse(await context.params);
    const { month } = querySchema.parse(Object.fromEntries(new URL(request.url).searchParams));
    const client = getSupabaseServerClient();
    await assertLedgerAccess(createLedgerMemberRepository(client), userId, ledgerId);

    const result = await getDashboard(
      {
        entryAnalysisRepository: createEntryAnalysisRepository(client),
        categoryRepository: createCategoryRepository(client),
        entryRepository: createEntryRepository(client),
      },
      ledgerId,
      month ?? todayInJst().slice(0, 7),
    );
    return jsonData(result);
  } catch (error) {
    return handleApiError(error);
  }
}
