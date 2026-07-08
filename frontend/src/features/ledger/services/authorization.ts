/**
 * 帳簿アクセスの認可（Service 層の共通関数）。
 * 全 Service は帳簿配下リソースの操作前に本関数を経由する（architecture.md 6.2 / api.md 1.1）。
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
