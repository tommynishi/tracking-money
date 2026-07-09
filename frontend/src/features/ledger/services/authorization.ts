/**
 * 帳簿アクセスの認可（共通関数・architecture.md 6.2 / api.md 1.1）。
 * 呼び出し責務は Route Handler 層：帳簿配下リソース（カテゴリ・明細等）の API は
 * Service 呼び出し前に assertLedgerAccess を必ず通す（Service 側では認可しない）。
 * 例外は招待 Service（帳簿横断のため Service 内で明示的に認可する）。
 * 個人家計簿は本人のみ、家族家計簿はメンバーのみ許可（FR-LEDGER-03 / 04）。
 */
import { ForbiddenError } from "@/shared/errors/appError";

import type { LedgerMemberRepository } from "../repositories/ledgerMemberRepository";
import type { Ledger } from "../types";

/**
 * ログインユーザーが対象帳簿へアクセスできることを保証する。
 * メンバーでない場合は ForbiddenError（403）を throw する。
 * 帳簿の存在有無を漏らさないため、非メンバー・不存在いずれも 403 に統一する。
 */
export const assertLedgerAccess = async (
  repository: Pick<LedgerMemberRepository, "hasActiveMembership">,
  userId: string,
  ledgerId: string,
): Promise<void> => {
  const hasAccess = await repository.hasActiveMembership(userId, ledgerId);
  if (!hasAccess) {
    throw new ForbiddenError("この家計簿へのアクセス権がありません");
  }
};

/**
 * ログインユーザーが対象帳簿のオーナーであることを保証する。
 * 名称変更・削除などオーナー専用操作の前に呼ぶ（api.md 3.4 / 3.5・FR-LEDGER-07 / 08）。
 * オーナーでない場合は ForbiddenError（403）を throw する。
 */
export const assertLedgerOwner = (ledger: Pick<Ledger, "ownerUserId">, userId: string): void => {
  if (ledger.ownerUserId !== userId) {
    throw new ForbiddenError("この操作は家計簿のオーナーのみ実行できます");
  }
};
