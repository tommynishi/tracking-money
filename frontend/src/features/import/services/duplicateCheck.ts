/**
 * インポート時の重複チェック（FR-DUP-01〜03）。
 * - 明細単位：同一家計簿内の「利用日・金額・摘要（正規化後）」一致を重複候補として付記する
 * - ファイル単位：内容ハッシュ（SHA-256）一致の取込履歴があれば取込済みとして警告する
 * 既定の取り扱い（重複はスキップ）はプレビューUI側で選択させる（FR-DUP-02）。
 */
import { normalizeDescription } from "@/features/entry/services/normalizeDescription";
import type { EntryDuplicateKey, EntryRepository } from "@/features/entry/repositories/entryRepository";

import type { ParsedRow } from "../types";

/** プレビュー用の行（正規化済み摘要と重複候補フラグを付与）。 */
export type PreviewRow = ParsedRow & {
  readonly normalizedDescription: string;
  readonly isDuplicate: boolean;
};

const toKey = (key: EntryDuplicateKey): string =>
  `${key.usedOn}|${key.amount}|${key.normalizedDescription}`;

/**
 * パース済み行に重複候補フラグを付ける（FR-DUP-01）。
 * 既存明細の照会は行の利用日範囲に絞る（idx_entries_dup_check を利用）。
 */
export const markDuplicateRows = async (
  repository: Pick<EntryRepository, "listDuplicateKeys">,
  ledgerId: string,
  rows: readonly ParsedRow[],
): Promise<PreviewRow[]> => {
  if (rows.length === 0) {
    return [];
  }
  const dates = rows.map((row) => row.usedOn).sort();
  const existing = await repository.listDuplicateKeys(ledgerId, dates[0], dates[dates.length - 1]);
  const existingKeys = new Set(existing.map(toKey));

  return rows.map((row) => {
    const normalized = normalizeDescription(row.description);
    return {
      ...row,
      normalizedDescription: normalized,
      isDuplicate: existingKeys.has(
        toKey({ usedOn: row.usedOn, amount: row.amount, normalizedDescription: normalized }),
      ),
    };
  });
};

/** ファイル単位の取込済み判定に使う照会（import_files への依存を注入する）。 */
export type ImportFileHashLookup = {
  existsByFileHash(ledgerId: string, fileHash: string): Promise<boolean>;
};

/** 同一内容のファイルが取込済みか（FR-DUP-03。強制取込は呼び出し側の選択に委ねる）。 */
export const isFileAlreadyImported = (
  lookup: ImportFileHashLookup,
  ledgerId: string,
  fileHash: string,
): Promise<boolean> => lookup.existsByFileHash(ledgerId, fileHash);
