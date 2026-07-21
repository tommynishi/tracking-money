/**
 * 帳簿メンバー管理の業務ロジック（Service 層・FR-INVITE-05/06・FR-SPLIT-01/02・api.md 3.6/3.7/12.1）。
 * アクセス認可（メンバーであること）は Route Handler の責務。ここでは除外/退出・比重更新の可否を判定する。
 */
import { ForbiddenError, NotFoundError, ValidationError } from "@/shared/errors/appError";

import type { LedgerMemberRepository } from "../repositories/ledgerMemberRepository";
import type { Ledger, LedgerMember } from "../types";
import { assertLedgerOwner } from "./authorization";

/** メンバー一覧（api.md 3.6）。 */
export const listMembers = (
  repository: LedgerMemberRepository,
  ledgerId: string,
): Promise<LedgerMember[]> => repository.listMembers(ledgerId);

export type RemoveMemberInput = {
  readonly ledgerId: string;
  readonly actorUserId: string;
  readonly targetUserId: string;
};

/**
 * メンバーを除外（オーナーが他メンバーを指定）または退出（本人が自分を指定）する（api.md 3.7）。
 * オーナー自身の退出は不可（帳簿削除で対応）。除外できるのはオーナーのみ。
 */
export const removeMember = async (
  repository: LedgerMemberRepository,
  input: RemoveMemberInput,
): Promise<void> => {
  const targetRole = await repository.getMembershipRole(input.targetUserId, input.ledgerId);
  if (targetRole === null) {
    throw new NotFoundError("メンバーが見つかりません");
  }

  const isSelf = input.actorUserId === input.targetUserId;
  if (isSelf) {
    // 退出：オーナーは退出できない（帳簿削除で対応）
    if (targetRole === "owner") {
      throw new ForbiddenError("オーナーは退出できません。家計簿を削除してください");
    }
  } else {
    // 除外：オーナーのみ、かつオーナー自身は除外対象にできない
    const actorRole = await repository.getMembershipRole(input.actorUserId, input.ledgerId);
    if (actorRole !== "owner") {
      throw new ForbiddenError("メンバーを除外できるのはオーナーのみです");
    }
    if (targetRole === "owner") {
      throw new ForbiddenError("オーナーを除外することはできません");
    }
  }

  await repository.softDeleteMembership(input.targetUserId, input.ledgerId);
};

export type UpdateMemberWeightsInput = {
  readonly ledgerId: string;
  readonly ledger: Pick<Ledger, "ownerUserId" | "type">;
  readonly actorUserId: string;
  readonly weights: readonly { userId: string; weight: number }[];
};

/**
 * 既定按分比重を一括更新する（FR-SPLIT-01/02・api.md 12.1）。
 * 家族家計簿のオーナーのみ実行でき、現在の全メンバー分をちょうど指定する必要がある（過不足は400）。
 */
export const updateMemberWeights = async (
  repository: LedgerMemberRepository,
  input: UpdateMemberWeightsInput,
): Promise<LedgerMember[]> => {
  if (input.ledger.type !== "family") {
    throw new ValidationError("按分比重は家族家計簿でのみ設定できます");
  }
  assertLedgerOwner(input.ledger, input.actorUserId);

  const currentMembers = await repository.listMembers(input.ledgerId);
  const currentIds = new Set(currentMembers.map((member) => member.userId));
  const inputIds = new Set(input.weights.map((entry) => entry.userId));
  const sameMembers =
    currentIds.size === inputIds.size && [...currentIds].every((id) => inputIds.has(id));
  if (!sameMembers) {
    throw new ValidationError("現在の家計簿メンバー全員分の比重を指定してください");
  }

  return repository.updateWeights(input.ledgerId, input.weights);
};
