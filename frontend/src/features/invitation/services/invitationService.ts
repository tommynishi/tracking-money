/**
 * 家族招待の業務ロジック（Service 層・FR-INVITE-01/05/06・api.md 4）。
 * 認可（ledger_members 検証）は本 Service 内で明示的に行う（招待は帳簿横断のため）。
 * 承諾（accept）は自帳簿削除→参加→招待更新を原子的に行う RPC を呼ぶ。
 */
import {
  ConflictError,
  ForbiddenError,
  NotFoundError,
  ValidationError,
} from "@/shared/errors/appError";

import { assertLedgerOwner } from "@/features/ledger/services/authorization";
import type { LedgerMemberRepository } from "@/features/ledger/repositories/ledgerMemberRepository";
import type { LedgerRepository } from "@/features/ledger/repositories/ledgerRepository";

import type { InvitationRepository } from "../repositories/invitationRepository";
import type { Invitation, InvitationDirection, InvitationStatus } from "../types";

export type InvitationServiceDeps = {
  readonly invitationRepository: InvitationRepository;
  readonly ledgerRepository: Pick<LedgerRepository, "getLedgerById">;
  readonly memberRepository: Pick<LedgerMemberRepository, "hasActiveMembership">;
};

export type CreateInvitationInput = {
  readonly ledgerId: string;
  readonly inviterUserId: string;
  readonly inviteeUserId: string;
};

/**
 * 家族家計簿へユーザーを招待する（FR-INVITE-01・api.md 4.1）。オーナーのみ。
 * 家族家計簿以外・自分自身・既存メンバーへの招待は拒否する。
 */
export const createInvitation = async (
  deps: InvitationServiceDeps,
  input: CreateInvitationInput,
): Promise<Invitation> => {
  const ledger = await deps.ledgerRepository.getLedgerById(input.ledgerId);
  if (ledger === null) {
    throw new NotFoundError("家計簿が見つかりません");
  }
  assertLedgerOwner(ledger, input.inviterUserId);

  if (ledger.type !== "family") {
    throw new ValidationError("家族家計簿にのみ招待できます");
  }
  if (input.inviteeUserId === input.inviterUserId) {
    throw new ValidationError("自分自身は招待できません");
  }

  const alreadyMember = await deps.memberRepository.hasActiveMembership(
    input.inviteeUserId,
    input.ledgerId,
  );
  if (alreadyMember) {
    throw new ConflictError("このユーザーは既にメンバーです");
  }

  return deps.invitationRepository.createPending({
    ledgerId: input.ledgerId,
    inviterUserId: input.inviterUserId,
    inviteeUserId: input.inviteeUserId,
  });
};

export type ListInvitationsInput = {
  readonly userId: string;
  readonly direction: InvitationDirection;
  readonly status: InvitationStatus;
};

/** 自分宛/自分発の招待一覧（api.md 4.2）。 */
export const listInvitations = (
  repository: InvitationRepository,
  input: ListInvitationsInput,
): Promise<Invitation[]> => repository.listForUser(input);

/** 招待先本人であることを検証して招待を返す（未存在=404 / 別人=403）。 */
const getInviteeInvitationOrThrow = async (
  repository: Pick<InvitationRepository, "getById">,
  invitationId: string,
  userId: string,
): Promise<Invitation> => {
  const invitation = await repository.getById(invitationId);
  if (invitation === null) {
    throw new NotFoundError("招待が見つかりません");
  }
  if (invitation.inviteeUserId !== userId) {
    throw new ForbiddenError("この招待を操作する権限がありません");
  }
  return invitation;
};

export type AcceptInvitationDeps = {
  readonly invitationRepository: Pick<InvitationRepository, "getById" | "acceptFamilyInvitation">;
  readonly ledgerRepository: Pick<LedgerRepository, "getUserFamilyMembership">;
};

export type AcceptInvitationInput = {
  readonly invitationId: string;
  readonly userId: string;
  /** 自分の家族家計簿を削除して参加するか（FR-INVITE-03）。 */
  readonly deleteOwnFamilyLedger: boolean;
};

/**
 * 招待を承諾し家族家計簿へ参加する（招待先本人のみ・api.md 4.3・FR-INVITE-02/03）。
 * 既存の家族家計簿の所属制約（FR-LEDGER-05）を検証してから RPC で原子的に参加する。
 */
export const acceptInvitation = async (
  deps: AcceptInvitationDeps,
  input: AcceptInvitationInput,
): Promise<Invitation> => {
  const invitation = await getInviteeInvitationOrThrow(
    deps.invitationRepository,
    input.invitationId,
    input.userId,
  );
  if (invitation.status !== "pending") {
    throw new ConflictError("この招待は既に処理されています");
  }

  const family = await deps.ledgerRepository.getUserFamilyMembership(input.userId);
  let ownFamilyLedgerId: string | null = null;
  if (family !== null) {
    if (family.role === "member") {
      // 他者の家族家計簿に参加済み：自動退出せず拒否する（先に退出が必要）
      throw new ConflictError("既に別の家族家計簿に参加しています", [
        {
          code: "ALREADY_FAMILY_MEMBER",
          message: "既に別の家族家計簿に参加しています。先に退出してから承諾してください",
        },
      ]);
    }
    // 自分が家族家計簿を所有：削除して参加するか、拒否を選ばせる
    if (!input.deleteOwnFamilyLedger) {
      throw new ConflictError("自分の家族家計簿が存在します", [
        {
          code: "FAMILY_LEDGER_EXISTS",
          message: "自分の家族家計簿を削除して参加するか、招待を拒否してください",
        },
      ]);
    }
    ownFamilyLedgerId = family.ledgerId;
  }

  return deps.invitationRepository.acceptFamilyInvitation(
    input.invitationId,
    input.userId,
    ownFamilyLedgerId,
  );
};

/** 招待を拒否する（招待先本人のみ・api.md 4.4）。 */
export const declineInvitation = async (
  repository: InvitationRepository,
  input: { invitationId: string; userId: string },
): Promise<Invitation> => {
  await getInviteeInvitationOrThrow(repository, input.invitationId, input.userId);
  return repository.markResponded(input.invitationId, "declined");
};

/** 招待を取消する（招待者本人のみ・pending のみ・api.md 4.5）。 */
export const cancelInvitation = async (
  repository: InvitationRepository,
  input: { invitationId: string; userId: string },
): Promise<Invitation> => {
  const invitation = await repository.getById(input.invitationId);
  if (invitation === null) {
    throw new NotFoundError("招待が見つかりません");
  }
  if (invitation.inviterUserId !== input.userId) {
    throw new ForbiddenError("この招待を取消する権限がありません");
  }
  return repository.cancel(input.invitationId);
};
