/**
 * プレビュー確定（api.md 7.2・FR-CSV-04 / FR-DUP-02 / FR-AICAT-03）。
 * skip 行は登録せず、サーバー側で重複を再チェックしてから一括登録する。
 * 登録行の「正規化摘要→カテゴリ」を学習ルールへ保存し、次回取込の分類に使う。
 */
import { ConflictError, NotFoundError, ValidationError } from "@/shared/errors/appError";

import type { CategoryRepository } from "@/features/category/repositories/categoryRepository";
import type { EntryRepository } from "@/features/entry/repositories/entryRepository";
import { normalizeDescription } from "@/features/entry/services/normalizeDescription";

import type { CategoryRuleRepository } from "../repositories/categoryRuleRepository";
import type { ImportFileRepository } from "../repositories/importFileRepository";

import { markDuplicateRows } from "./duplicateCheck";

export type ConfirmImportDeps = {
  readonly importFileRepository: Pick<ImportFileRepository, "getById" | "updateResult">;
  readonly entryRepository: Pick<EntryRepository, "createMany" | "listDuplicateKeys">;
  readonly categoryRepository: Pick<CategoryRepository, "listByLedger">;
  readonly ruleRepository: Pick<CategoryRuleRepository, "upsert">;
};

export type ConfirmRowInput = {
  readonly usedOn: string;
  readonly billingMonth: string;
  readonly amount: number;
  readonly description: string;
  readonly categoryId: string;
  readonly memo: string | null;
  readonly skip: boolean;
};

export type ConfirmImportInput = {
  readonly ledgerId: string;
  readonly userId: string;
  readonly importFileId: string;
  readonly rows: readonly ConfirmRowInput[];
};

export type ConfirmImportResult = {
  readonly importedCount: number;
  readonly skippedCount: number;
  readonly errorCount: number;
};

export const confirmImport = async (
  deps: ConfirmImportDeps,
  input: ConfirmImportInput,
): Promise<ConfirmImportResult> => {
  const importFile = await deps.importFileRepository.getById(input.ledgerId, input.importFileId);
  if (importFile === null) {
    throw new NotFoundError("取込履歴が見つかりません");
  }
  if (importFile.status !== "analyzed") {
    throw new ConflictError("この取込は既に確定済みです");
  }

  const categories = await deps.categoryRepository.listByLedger(input.ledgerId);
  const categoryIds = new Set(categories.map((category) => category.id));
  const unknownCategory = input.rows.find(
    (row) => !row.skip && !categoryIds.has(row.categoryId),
  );
  if (unknownCategory !== undefined) {
    throw new ValidationError("この家計簿に存在しないカテゴリが指定されています");
  }

  const userSkipped = input.rows.filter((row) => row.skip);
  const candidates = input.rows.filter((row) => !row.skip);

  // 解析後に他の登録が入った場合に備えた再チェック（一致した行は自動スキップ）
  const rechecked = await markDuplicateRows(
    deps.entryRepository,
    input.ledgerId,
    candidates.map((row, index) => ({
      rowNumber: index + 1,
      usedOn: row.usedOn,
      amount: row.amount,
      description: row.description,
    })),
  );
  const toImport = candidates.filter((_, index) => rechecked[index].duplicate === null);
  const recheckSkipped = candidates.length - toImport.length;

  let importedCount = 0;
  let errorCount = 0;
  const source = importFile.fileType === "pdf" ? "pdf" : "csv";
  try {
    await deps.entryRepository.createMany(
      toImport.map((row) => ({
        ledgerId: input.ledgerId,
        categoryId: row.categoryId,
        usedOn: row.usedOn,
        billingMonth: row.billingMonth,
        amount: row.amount,
        description: row.description,
        normalizedDescription: normalizeDescription(row.description),
        paymentMethod: null,
        memo: row.memo,
        source,
        importFileId: input.importFileId,
        createdByUserId: input.userId,
      })),
    );
    importedCount = toImport.length;
  } catch {
    // 一括登録の失敗は行数分をエラー計上する（明細は登録されない）
    errorCount = toImport.length;
  }

  if (importedCount > 0) {
    // 登録時のカテゴリ選択を学習する（同一摘要は最後の選択を採用・FR-AICAT-03）
    const ruleByDescription = new Map(
      toImport.map((row) => [normalizeDescription(row.description), row.categoryId]),
    );
    for (const [normalized, categoryId] of ruleByDescription) {
      await deps.ruleRepository.upsert(input.ledgerId, normalized, categoryId);
    }
  }

  const result: ConfirmImportResult = {
    importedCount,
    skippedCount: userSkipped.length + recheckSkipped,
    errorCount,
  };
  await deps.importFileRepository.updateResult(input.ledgerId, input.importFileId, {
    status: errorCount === 0 ? "completed" : "partial",
    ...result,
  });
  return result;
};
