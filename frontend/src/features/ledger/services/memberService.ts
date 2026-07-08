/**
 * 帳簿メンバー管理の業務ロジック（Service 層・FR-INVITE-05/06・api.md 3.6/3.7）。
 * アクセス認可（メンバーであること）は Route Handler の責務。ここでは除外/退出の可否を判定する。
 */
import { ForbiddenError, NotFoundError } from "@/shared/errors/appError";

import type { LedgerMemberRepository } from "../repositories/ledgerMemberRepository";
import type { LedgerMember } from "../types";

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
