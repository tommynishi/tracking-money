/**
 * 家計簿作成の可否判定（純粋な業務ルール）。
 * FR-LEDGER-01/02（個人1・家族1）、FR-LEDGER-05 / FR-INVITE-04（家族は所有・参加あわせて最大1つ）。
 * DBアクセス済みの状態を受け取り、違反時は ConflictError(409) を投げる。
 */
import { ConflictError } from "@/shared/errors/appError";

import type { LedgerType } from "../types";

/** 作成可否の判定に必要な、対象ユーザーの現在の帳簿所属サマリー。 */
export type UserLedgerSummary = {
  /** 個人家計簿を既に所有しているか。 */
  readonly ownsPersonalLedger: boolean;
  /** 家族家計簿に既に所属しているか（自分が所有・他者帳簿へ参加のいずれも含む）。 */
  readonly belongsToFamilyLedger: boolean;
};

/**
 * 指定 type の家計簿を新規作成してよいかを検証する。
 * - personal: 個人家計簿を未所有であること
 * - family: いかなる家族家計簿にも未所属であること（最大1つ・FR-LEDGER-05）
 */
export const assertCanCreateLedger = (summary: UserLedgerSummary, type: LedgerType): void => {
  if (type === "personal" && summary.ownsPersonalLedger) {
    throw new ConflictError("個人家計簿は既に作成されています");
  }
  if (type === "family" && summary.belongsToFamilyLedger) {
    throw new ConflictError("参加できる家族家計簿は1つまでです");
  }
};
