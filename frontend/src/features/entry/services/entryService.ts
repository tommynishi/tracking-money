/**
 * 明細の業務ロジック（Service 層・FR-ENTRY-01〜04・api.md 6）。
 * ledgerId スコープ・カテゴリ整合性・摘要正規化を担い、永続化は Repository へ委譲する。
 * アクセス認可（ledger_members 検証）・入力の書式検証は Route Handler の責務とする。
 */
import { NotFoundError, ValidationError } from "@/shared/errors/appError";

import type { CategoryRepository } from "@/features/category/repositories/categoryRepository";
import type { LedgerMemberRepository } from "@/features/ledger/repositories/ledgerMemberRepository";
import type { LedgerRepository } from "@/features/ledger/repositories/ledgerRepository";

import type { EntryRepository } from "../repositories/entryRepository";
import type { Entry, EntryListItem, SplitShare, SplitType } from "../types";
import { type EntryListQuery, toTotalPages } from "./entryQuery";
import { normalizeDescription } from "./normalizeDescription";
import {
  assertValidPaidBy,
  resolveSplitForCreate,
  resolveSplitForUpdate,
  type SplitInput,
} from "./splitInput";

export type EntryServiceDeps = {
  readonly entryRepository: EntryRepository;
  readonly categoryRepository: Pick<CategoryRepository, "getById">;
  readonly ledgerRepository: Pick<LedgerRepository, "getLedgerById">;
  readonly memberRepository: Pick<LedgerMemberRepository, "listMembers">;
};

const INVALID_CATEGORY_MESSAGE = "カテゴリが不正です";
const ENTRY_NOT_FOUND_MESSAGE = "明細が見つかりません";
const LEDGER_NOT_FOUND_MESSAGE = "家計簿が見つかりません";

/** 家計簿の type とメンバーIDの集合を取得する（按分入力の検証に使う）。 */
const loadLedgerContext = async (
  deps: Pick<EntryServiceDeps, "ledgerRepository" | "memberRepository">,
  ledgerId: string,
): Promise<{ type: "personal" | "family"; memberIds: ReadonlySet<string> }> => {
  const [ledger, members] = await Promise.all([
    deps.ledgerRepository.getLedgerById(ledgerId),
    deps.memberRepository.listMembers(ledgerId),
  ]);
  if (ledger === null) {
    throw new NotFoundError(LEDGER_NOT_FOUND_MESSAGE);
  }
  return { type: ledger.type, memberIds: new Set(members.map((member) => member.userId)) };
};

export type CreateEntryInput = SplitInput & {
  readonly ledgerId: string;
  readonly createdByUserId: string;
  readonly categoryId: string;
  readonly usedOn: string;
  /** 支払月（YYYY-MM）。未指定なら利用日と同じ月とする。 */
  readonly billingMonth?: string;
  readonly amount: number;
  readonly description: string;
  readonly paymentMethod: string | null;
  readonly memo: string | null;
};

/** 支払月の既定値（利用日と同じ月）。 */
const defaultBillingMonth = (usedOn: string): string => usedOn.slice(0, 7);

/** 明細を手入力で登録する（FR-ENTRY-01・api.md 6.2）。source は manual。 */
export const createEntry = async (
  deps: EntryServiceDeps,
  input: CreateEntryInput,
): Promise<Entry> => {
  const category = await deps.categoryRepository.getById(input.ledgerId, input.categoryId);
  if (category === null) {
    throw new ValidationError(INVALID_CATEGORY_MESSAGE);
  }

  const ledgerContext = await loadLedgerContext(deps, input.ledgerId);
  const split = resolveSplitForCreate(
    ledgerContext.type,
    ledgerContext.memberIds,
    input.createdByUserId,
    input,
  );

  return deps.entryRepository.create({
    ledgerId: input.ledgerId,
    categoryId: input.categoryId,
    usedOn: input.usedOn,
    billingMonth: input.billingMonth ?? defaultBillingMonth(input.usedOn),
    amount: input.amount,
    description: input.description,
    normalizedDescription: normalizeDescription(input.description),
    paymentMethod: input.paymentMethod,
    memo: input.memo,
    source: "manual",
    createdByUserId: input.createdByUserId,
    paidByUserId: split.paidByUserId,
    splitType: split.splitType,
    splitShares: split.splitShares,
    assignedUserId: split.assignedUserId,
  });
};

/** 明細の詳細を取得する（api.md 6.3）。存在しなければ NotFoundError。 */
export const getEntry = async (
  repository: EntryRepository,
  input: { ledgerId: string; entryId: string },
): Promise<Entry> => {
  const entry = await repository.getById(input.ledgerId, input.entryId);
  if (entry === null) {
    throw new NotFoundError(ENTRY_NOT_FOUND_MESSAGE);
  }
  return entry;
};

export type UpdateEntryInput = SplitInput & {
  readonly ledgerId: string;
  readonly entryId: string;
  readonly categoryId?: string;
  readonly usedOn?: string;
  readonly billingMonth?: string;
  readonly amount?: number;
  readonly description?: string;
  readonly paymentMethod?: string | null;
  readonly memo?: string | null;
};

/**
 * 明細を編集する（FR-ENTRY-02・api.md 6.4）。
 * カテゴリ変更時は同一帳簿の有効カテゴリか検証し、摘要変更時は正規化摘要を再計算する。
 * カテゴリ学習ルール（category_rules・FR-AICAT-03）は Phase 2 で扱う。
 */
export const updateEntry = async (
  deps: EntryServiceDeps,
  input: UpdateEntryInput,
): Promise<Entry> => {
  const entry = await deps.entryRepository.getById(input.ledgerId, input.entryId);
  if (entry === null) {
    throw new NotFoundError(ENTRY_NOT_FOUND_MESSAGE);
  }

  const fields: {
    categoryId?: string;
    usedOn?: string;
    billingMonth?: string;
    amount?: number;
    description?: string;
    normalizedDescription?: string;
    paymentMethod?: string | null;
    memo?: string | null;
    paidByUserId?: string;
    split?: { splitType: SplitType; splitShares: readonly SplitShare[] | null; assignedUserId: string | null };
  } = {};

  if (input.categoryId !== undefined && input.categoryId !== entry.categoryId) {
    const category = await deps.categoryRepository.getById(input.ledgerId, input.categoryId);
    if (category === null) {
      throw new ValidationError(INVALID_CATEGORY_MESSAGE);
    }
    fields.categoryId = input.categoryId;
  }
  if (input.usedOn !== undefined) fields.usedOn = input.usedOn;
  if (input.billingMonth !== undefined) fields.billingMonth = input.billingMonth;
  if (input.amount !== undefined) fields.amount = input.amount;
  if (input.description !== undefined) {
    fields.description = input.description;
    fields.normalizedDescription = normalizeDescription(input.description);
  }
  if (input.paymentMethod !== undefined) fields.paymentMethod = input.paymentMethod;
  if (input.memo !== undefined) fields.memo = input.memo;

  const touchesSplit =
    input.paidByUserId !== undefined ||
    input.splitType !== undefined ||
    input.splitShares !== undefined ||
    input.assignedUserId !== undefined;

  if (touchesSplit) {
    const ledgerContext = await loadLedgerContext(deps, input.ledgerId);
    if (input.paidByUserId !== undefined) {
      assertValidPaidBy(ledgerContext.memberIds, input.paidByUserId);
      fields.paidByUserId = input.paidByUserId;
    }
    const split = resolveSplitForUpdate(ledgerContext.type, ledgerContext.memberIds, input);
    if (split !== null) {
      fields.split = split;
    }
  }

  if (Object.keys(fields).length === 0) {
    return entry;
  }

  return deps.entryRepository.updateFields(input.ledgerId, input.entryId, fields);
};

/** 明細を削除する（論理削除・FR-ENTRY-03・api.md 6.5）。 */
export const deleteEntry = async (
  repository: EntryRepository,
  input: { ledgerId: string; entryId: string },
): Promise<void> => {
  const entry = await repository.getById(input.ledgerId, input.entryId);
  if (entry === null) {
    throw new NotFoundError(ENTRY_NOT_FOUND_MESSAGE);
  }
  await repository.softDelete(input.ledgerId, input.entryId);
};

export type EntryListResult = {
  readonly data: EntryListItem[];
  readonly meta: {
    readonly page: number;
    readonly perPage: number;
    readonly totalCount: number;
    readonly totalPages: number;
  };
};

/** 明細一覧（絞り込み・ソート・ページング・api.md 6.1）。 */
export const listEntries = async (
  repository: EntryRepository,
  ledgerId: string,
  query: EntryListQuery,
): Promise<EntryListResult> => {
  const { items, totalCount } = await repository.list(ledgerId, query);
  return {
    data: items,
    meta: {
      page: query.page,
      perPage: query.perPage,
      totalCount,
      totalPages: toTotalPages(totalCount, query.perPage),
    },
  };
};
