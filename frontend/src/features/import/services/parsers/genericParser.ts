/**
 * 汎用CSVパーサー（FR-CSV-02）。ユーザー定義の列マッピングに従って明細行へ変換する。
 * フォーマット自動判定の対象外（ユーザーが generic を選択したときのみ使う）ため、
 * StatementParser のレジストリには登録せず parse 関数のみ提供する。
 */
import type { ParseResult, ParsedRow, RowError } from "../../types";
import { parseUsedOnByFormat, type ColumnMapping } from "../columnMapping";

import { buildResult, isBlankRecord, toAmount } from "./statementParser";

export const parseGenericCsv = (
  records: readonly (readonly string[])[],
  mapping: ColumnMapping,
): ParseResult => {
  const rows: ParsedRow[] = [];
  const errors: RowError[] = [];

  records.slice(mapping.headerRows).forEach((cells, offset) => {
    const rowNumber = mapping.headerRows + offset + 1;
    if (isBlankRecord(cells)) {
      return;
    }
    const usedOnRaw = cells[mapping.usedOnColumn] ?? "";
    const amountRaw = cells[mapping.amountColumn] ?? "";
    // 日付も金額も無い行は明細以外（区切り・補足）とみなしてスキップする
    if (parseUsedOnByFormat(usedOnRaw, mapping.usedOnFormat) === null && amountRaw.trim() === "") {
      return;
    }
    const usedOn = parseUsedOnByFormat(usedOnRaw, mapping.usedOnFormat);
    const amount = toAmount(amountRaw);
    const description = (cells[mapping.descriptionColumn] ?? "").trim();
    if (usedOn === null) {
      errors.push({ rowNumber, message: "利用日が不正です" });
      return;
    }
    if (amount === null) {
      errors.push({ rowNumber, message: "金額が不正です" });
      return;
    }
    if (description === "") {
      errors.push({ rowNumber, message: "摘要が空です" });
      return;
    }
    rows.push({ rowNumber, usedOn, amount, description });
  });
  return buildResult(rows, errors);
};
