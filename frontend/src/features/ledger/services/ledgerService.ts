/**
 * 家計簿の業務ロジック（Service 層）。作成可否の判定・デフォルトカテゴリ生成を行い、
 * 永続化は Repository（RPC）へ委譲する（architecture.md 4 / api.md 3.2）。
 * 入力の書式検証（name の必須・長さ等）は Route Handler の責務とする。
 */
import { NotFoundError } from "@/shared/errors/appError";

import type { LedgerRepository } from "../repositories/ledgerRepository";
import type { Ledger, LedgerType } from "../types";
import { assertLedgerOwner } from "./authorization";
import { buildDefaultCategories } from "./defaultCategories";
import { assertCanCreateLedger } from "./ledgerCreationPolicy";

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
