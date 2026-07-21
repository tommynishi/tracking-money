/**
 * エポスカード CSV パーサー（FR-CSV-01）。
 * 形式（実サンプルで確認）：Shift_JIS。1行目がヘッダー。
 * 利用日は「YYYY年MM月DD日」形式（他社の YYYY/MM/DD とは異なる）。
 * 末尾に「お支払合計額」の合計行があるが、ご利用金額欄が空のため
 * isAnnotationRow によりスキップされる。
 */
import type { ParsedRow, RowError } from "../../types";

import {
  buildResult,
  isAnnotationRow,
  isBlankRecord,
  toAmount,
  type StatementParser,
} from "./statementParser";

const HEADER_USED_ON = "ご利用年月日";
const HEADER_DESCRIPTION = "ご利用場所";
const HEADER_AMOUNT = "ご利用金額";

const JP_DATE_PATTERN = /^(\d{4})年(\d{1,2})月(\d{1,2})日$/;

/** 「YYYY年MM月DD日」形式を YYYY-MM-DD へ変換する。実在しない日付・形式不正は null。 */
const toIsoDateJp = (value: string): string | null => {
  const match = JP_DATE_PATTERN.exec(value.trim());
  if (match === null) {
    return null;
  }
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(year, month - 1, day);
  const isValid =
    date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day;
  if (!isValid) {
    return null;
  }
  const pad = (n: number): string => String(n).padStart(2, "0");
  return `${year}-${pad(month)}-${pad(day)}`;
};

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

export const eposParser: StatementParser = {
  format: "epos",

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
        { rowNumber: 1, message: "エポスカードCSVのヘッダー行が見つかりません" },
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
      const usedOn = toIsoDateJp(usedOnRaw);
      const amount = toAmount(amountRaw);
      const description = (cells[indexes.description] ?? "").trim();
      if (usedOn === null) {
        errors.push({ rowNumber, message: "ご利用年月日が不正です" });
        return;
      }
      if (amount === null) {
        errors.push({ rowNumber, message: "ご利用金額が不正です" });
        return;
      }
      if (description === "") {
        errors.push({ rowNumber, message: "ご利用場所が空です" });
        return;
      }
      rows.push({ rowNumber, usedOn, amount, description });
    });
    return buildResult(rows, errors);
  },
};
