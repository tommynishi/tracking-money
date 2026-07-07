/**
 * 家計簿の業務ロジック（Service 層）。作成可否の判定・デフォルトカテゴリ生成を行い、
 * 永続化は Repository（RPC）へ委譲する（architecture.md 4 / api.md 3.2）。
 * 入力の書式検証（name の必須・長さ等）は Route Handler の責務とする。
 */
import type { LedgerRepository } from "../repositories/ledgerRepository";
import type { Ledger, LedgerType } from "../types";
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
