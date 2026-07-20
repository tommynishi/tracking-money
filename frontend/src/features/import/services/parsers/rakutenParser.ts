/**
 * 楽天カード（楽天e-NAVI）CSVパーサー（FR-CSV-01）。
 * 形式（実サンプルで確認）：UTF-8（BOM付き）・1行目がヘッダー。
 * 列は名称で解決する（列順変更に耐える）。金額は「利用金額」（購入額）を採用する。
 */
import type { ParsedRow, RowError } from "../../types";

import {
  buildResult,
  isAnnotationRow,
  isBlankRecord,
  toAmount,
  toIsoDate,
  type StatementParser,
} from "./statementParser";

const HEADER_USED_ON = "利用日";
const HEADER_DESCRIPTION = "利用店名・商品名";
const HEADER_AMOUNT = "利用金額";

const findHeaderIndexes = (
  header: readonly string[],
): { usedOn: number; description: number; amount: number } | null => {
  const usedOn = header.indexOf(HEADER_USED_ON);
  const description = header.indexOf(HEADER_DESCRIPTION);
  const amount = header.indexOf(HEADER_AMOUNT);
  if (usedOn === -1 || description === -1 || amount === -1) {
    return null;
  }
  return { usedOn, description, amount };
};

export const rakutenParser: StatementParser = {
  format: "rakuten",

  detect(records): boolean {
    const header = records[0];
    return header !== undefined && findHeaderIndexes(header) !== null;
  },

  parse(records): ReturnType<StatementParser["parse"]> {
    const rows: ParsedRow[] = [];
    const errors: RowError[] = [];
    const header = records[0];
    const indexes = header === undefined ? null : findHeaderIndexes(header);
    if (indexes === null) {
      return buildResult(rows, [
        { rowNumber: 1, message: "楽天カードCSVのヘッダー行が見つかりません" },
      ]);
    }

    records.slice(1).forEach((cells, offset) => {
      const rowNumber = offset + 2;
      if (isBlankRecord(cells)) {
        return;
      }
      const usedOnRaw = cells[indexes.usedOn] ?? "";
      const amountRaw = cells[indexes.amount] ?? "";
      if (isAnnotationRow(usedOnRaw, amountRaw)) {
        return;
      }
      const usedOn = toIsoDate(usedOnRaw);
      const amount = toAmount(amountRaw);
      const description = (cells[indexes.description] ?? "").trim();
      if (usedOn === null) {
        errors.push({ rowNumber, message: "利用日が不正です" });
        return;
      }
      if (amount === null) {
        errors.push({ rowNumber, message: "利用金額が不正です" });
        return;
      }
      if (description === "") {
        errors.push({ rowNumber, message: "利用店名・商品名が空です" });
        return;
      }
      rows.push({ rowNumber, usedOn, amount, description });
    });
    return buildResult(rows, errors);
  },
};
