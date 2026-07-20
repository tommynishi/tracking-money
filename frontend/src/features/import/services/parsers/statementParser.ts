/**
 * カード会社別パーサーの共通インターフェース（architecture.md 7.1）。
 * パーサーはフォーマットごとに独立したモジュールとして実装し、
 * 入力はデコード・CSV分解済みのレコード（string[][]）に統一する。
 */
import type { ParseResult, ParsedRow, RowError, StatementFormat } from "../../types";

export type StatementParser = {
  readonly format: StatementFormat;
  /** レコード内容からこのフォーマットとみなせるか判定する（FR-CSV-03 の自動判定に使用）。 */
  detect(records: readonly (readonly string[])[]): boolean;
  /** レコードを明細行へ変換する。不正行は errors へ集め、処理は継続する（FR-CSV-07）。 */
  parse(records: readonly (readonly string[])[]): ParseResult;
};

const DATE_PATTERN = /^\d{4}\/\d{1,2}\/\d{1,2}$/;

/**
 * YYYY/MM/DD 形式を YYYY-MM-DD へ変換する。実在しない日付・形式不正は null。
 */
export const toIsoDate = (value: string): string | null => {
  const trimmed = value.trim();
  if (!DATE_PATTERN.test(trimmed)) {
    return null;
  }
  const [year, month, day] = trimmed.split("/").map(Number);
  const date = new Date(year, month - 1, day);
  const isValid =
    date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day;
  if (!isValid) {
    return null;
  }
  const pad = (n: number): string => String(n).padStart(2, "0");
  return `${year}-${pad(month)}-${pad(day)}`;
};

/**
 * 金額文字列を円整数へ変換する。桁区切りカンマ・前後空白を許容し、
 * マイナス（返金）に対応する。数値でない場合は null。
 */
export const toAmount = (value: string): number | null => {
  const normalized = value.trim().replace(/,/g, "");
  if (!/^-?\d+$/.test(normalized)) {
    return null;
  }
  return Number(normalized);
};

/** 行の全セルが空文字か（空行・区切り行の判定に使う）。 */
export const isBlankRecord = (cells: readonly string[]): boolean =>
  cells.every((cell) => cell.trim() === "");

/**
 * 明細ではない補足行か（利用日に日付が無く、金額欄も空の行）。
 * 楽天CSVの海外利用補足行・「■ご利用キャンセルなど」等の区切り行が該当する。
 * 取込対象のデータが無いためエラーにせずスキップする（FR-CSV-07 のエラー報告対象は
 * 「データがあるのに解釈できない行」に限る）。
 */
export const isAnnotationRow = (usedOnCell: string, amountCell: string): boolean =>
  toIsoDate(usedOnCell) === null && amountCell.trim() === "";

/** パース結果の組み立てを簡潔にするためのアキュムレータ。 */
export const buildResult = (rows: ParsedRow[], errors: RowError[]): ParseResult => ({
  rows,
  errors,
});
