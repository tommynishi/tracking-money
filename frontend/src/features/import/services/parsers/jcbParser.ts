/**
 * JCBカード（MyJCB）CSVパーサー（FR-CSV-01）。
 * 形式（実サンプルで確認）：Shift_JIS。冒頭に請求サマリー行が数行あり、
 * 「ご利用者」「ご利用日」「ご利用金額(￥)」等のヘッダー行以降が明細。
 * ヘッダー行は位置固定にせず内容で探索する（サマリー行数の変動に耐える）。
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

const HEADER_USED_ON = "ご利用日";
const HEADER_DESCRIPTION = "ご利用先など";
/** 「ご利用金額(￥)」。通貨記号の全角/半角差を吸収するため前方一致で判定する。 */
const HEADER_AMOUNT_PREFIX = "ご利用金額";

const findHeader = (
  records: readonly (readonly string[])[],
): { rowIndex: number; usedOn: number; description: number; amount: number } | null => {
  for (const [rowIndex, cells] of records.entries()) {
    const usedOn = cells.indexOf(HEADER_USED_ON);
    const description = cells.indexOf(HEADER_DESCRIPTION);
    const amount = cells.findIndex((cell) => cell.startsWith(HEADER_AMOUNT_PREFIX));
    if (usedOn !== -1 && description !== -1 && amount !== -1) {
      return { rowIndex, usedOn, description, amount };
    }
  }
  return null;
};

export const jcbParser: StatementParser = {
  format: "jcb",

  detect(records): boolean {
    return findHeader(records) !== null;
  },

  parse(records): ReturnType<StatementParser["parse"]> {
    const rows: ParsedRow[] = [];
    const errors: RowError[] = [];
    const header = findHeader(records);
    if (header === null) {
      return buildResult(rows, [
        { rowNumber: 1, message: "JCBカードCSVの明細ヘッダー行が見つかりません" },
      ]);
    }

    records.slice(header.rowIndex + 1).forEach((cells, offset) => {
      const rowNumber = header.rowIndex + offset + 2;
      if (isBlankRecord(cells)) {
        return;
      }
      const usedOnRaw = cells[header.usedOn] ?? "";
      const amountRaw = cells[header.amount] ?? "";
      if (isAnnotationRow(usedOnRaw, amountRaw)) {
        return;
      }
      const usedOn = toIsoDate(usedOnRaw);
      const amount = toAmount(amountRaw);
      const description = (cells[header.description] ?? "").trim();
      if (usedOn === null) {
        errors.push({ rowNumber, message: "ご利用日が不正です" });
        return;
      }
      if (amount === null) {
        errors.push({ rowNumber, message: "ご利用金額が不正です" });
        return;
      }
      if (description === "") {
        errors.push({ rowNumber, message: "ご利用先が空です" });
        return;
      }
      rows.push({ rowNumber, usedOn, amount, description });
    });
    return buildResult(rows, errors);
  },
};
