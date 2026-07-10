/**
 * 家計簿API（api.md 3.3〜3.5）。GET: 詳細。PATCH: 名称変更。DELETE: 論理削除。
 * アクセス認可は assertLedgerAccess、オーナー専用操作の判定は Service（assertLedgerOwner）。
 */
import { z } from "zod";

import { handleApiError, jsonData, noContent } from "@/shared/api/response";
import { requireUserId } from "@/shared/api/session";
import { getSupabaseServerClient } from "@/shared/lib/supabaseServer";

import { createLedgerMemberRepository } from "@/features/ledger/repositories/ledgerMemberRepository";
import { createLedgerRepository } from "@/features/ledger/repositories/ledgerRepository";
import { assertLedgerAccess } from "@/features/ledger/services/authorization";
import {
  deleteLedger,
  getLedgerDetail,
  renameLedger,
} from "@/features/ledger/services/ledgerService";

type RouteContext = { params: Promise<{ ledgerId: string }> };

const paramsSchema = z.object({ ledgerId: z.uuid() });

const patchBodySchema = z.object({
  name: z.string().trim().min(1, "家計簿名を入力してください").max(50, "50文字以内で入力してください"),
});

export async function GET(_request: Request, context: RouteContext): Promise<Response> {
  try {
    const userId = await requireUserId();
    const { ledgerId } = paramsSchema.parse(await context.params);
    const client = getSupabaseServerClient();
    const memberRepository = createLedgerMemberRepository(client);
    await assertLedgerAccess(memberRepository, userId, ledgerId);

    const detail = await getLedgerDetail(
      { ledgerRepository: createLedgerRepository(client), memberRepository },
      { ledgerId, userId },
    );
    return jsonData(detail);
  } catch (error) {
    return handleApiError(error);
  }
}

export async function PATCH(request: Request, context: RouteContext): Promise<Response> {
  try {
    const userId = await requireUserId();
    const { ledgerId } = paramsSchema.parse(await context.params);
    const body = patchBodySchema.parse(await request.json());
    const client = getSupabaseServerClient();
    await assertLedgerAccess(createLedgerMemberRepository(client), userId, ledgerId);

    const ledger = await renameLedger(createLedgerRepository(client), {
      ledgerId,
      userId,
      name: body.name,
    });
    return jsonData({ id: ledger.id, type: ledger.type, name: ledger.name });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function DELETE(_request: Request, context: RouteContext): Promise<Response> {
  try {
    const userId = await requireUserId();
    const { ledgerId } = paramsSchema.parse(await context.params);
    const client = getSupabaseServerClient();
    await assertLedgerAccess(createLedgerMemberRepository(client), userId, ledgerId);

    await deleteLedger(createLedgerRepository(client), { ledgerId, userId });
    return noContent();
  } catch (error) {
    return handleApiError(error);
  }
}
