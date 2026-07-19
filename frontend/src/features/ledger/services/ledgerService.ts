/**
 * 家計簿の業務ロジック（Service 層）。作成可否の判定・デフォルトカテゴリ生成を行い、
 * 永続化は Repository（RPC）へ委譲する（architecture.md 4 / api.md 3.2）。
 * 入力の書式検証（name の必須・長さ等）は Route Handler の責務とする。
 */
import { NotFoundError } from "@/shared/errors/appError";

import type { LedgerMemberRepository } from "../repositories/ledgerMemberRepository";
import type { LedgerRepository, UserLedger } from "../repositories/ledgerRepository";
import type { Ledger, LedgerType, MemberRole } from "../types";
import { assertLedgerOwner } from "./authorization";
import { buildDefaultCategories } from "./defaultCategories";
import { assertCanCreateLedger } from "./ledgerCreationPolicy";

/** 自分がアクセスできる家計簿の一覧（api.md 3.1）。 */
export const listLedgers = (
  repository: Pick<LedgerRepository, "listUserLedgers">,
  userId: string,
): Promise<UserLedger[]> => repository.listUserLedgers(userId);

export type LedgerDetail = {
  readonly id: string;
  readonly type: LedgerType;
  readonly name: string;
  readonly role: MemberRole;
  readonly memberCount: number;
};

export type GetLedgerDetailDeps = {
  readonly ledgerRepository: Pick<LedgerRepository, "getLedgerById">;
  readonly memberRepository: Pick<LedgerMemberRepository, "getMembershipRole" | "listMembers">;
};

/**
 * 家計簿の詳細（名称・type・自分の role・メンバー数・api.md 3.3）。
 * アクセス認可（メンバーであること）は Route Handler で事前に検証済みの前提。
 */
export const getLedgerDetail = async (
  deps: GetLedgerDetailDeps,
  input: { ledgerId: string; userId: string },
): Promise<LedgerDetail> => {
  const [ledger, role, members] = await Promise.all([
    deps.ledgerRepository.getLedgerById(input.ledgerId),
    deps.memberRepository.getMembershipRole(input.userId, input.ledgerId),
    deps.memberRepository.listMembers(input.ledgerId),
  ]);
  if (ledger === null || role === null) {
    throw new NotFoundError("家計簿が見つかりません");
  }

  return {
    id: ledger.id,
    type: ledger.type,
    name: ledger.name,
    role,
    memberCount: members.length,
  };
};

export type CreateLedgerInput = {
  readonly ownerUserId: string;
  readonly type: LedgerType;
  readonly name: string;
};

/**
 * 家計簿を新規作成する（FR-LEDGER-01/02）。
 * 作成可否を検証し、デフォルトカテゴリ一式とともに原子的に登録する。
 */
export const createLedger = async (
  repository: LedgerRepository,
  input: CreateLedgerInput,
): Promise<Ledger> => {
  const summary = await repository.getUserLedgerSummary(input.ownerUserId);
  assertCanCreateLedger(summary, input.type);

  return repository.createLedgerWithDefaults({
    ownerUserId: input.ownerUserId,
    type: input.type,
    name: input.name,
    categories: buildDefaultCategories(),
  });
};

export type RenameLedgerInput = {
  readonly ledgerId: string;
  readonly userId: string;
  readonly name: string;
};

/**
 * 家計簿の名称を変更する（FR-LEDGER-07・api.md 3.4）。オーナーのみ実行できる。
 * 入力の書式検証（name の必須・長さ等）は Route Handler の責務とする。
 */
export const renameLedger = async (
  repository: LedgerRepository,
  input: RenameLedgerInput,
): Promise<Ledger> => {
  const ledger = await repository.getLedgerById(input.ledgerId);
  if (ledger === null) {
    throw new NotFoundError("家計簿が見つかりません");
  }
  assertLedgerOwner(ledger, input.userId);

  return repository.updateLedgerName(input.ledgerId, input.name);
};

export type DeleteLedgerInput = {
  readonly ledgerId: string;
  readonly userId: string;
};

/**
 * 家計簿を論理削除する（FR-LEDGER-08・api.md 3.5）。オーナーのみ実行できる。
 * 家計簿本体と子データ（メンバー・カテゴリ・明細・招待）を原子的に論理削除する。
 * 削除前のユーザー確認は UI（SCR-06）の責務とする。
 */
export const deleteLedger = async (
  repository: LedgerRepository,
  input: DeleteLedgerInput,
): Promise<void> => {
  const ledger = await repository.getLedgerById(input.ledgerId);
  if (ledger === null) {
    throw new NotFoundError("家計簿が見つかりません");
  }
  assertLedgerOwner(ledger, input.userId);

  await repository.deleteLedgerCascade(input.ledgerId);
};
