/**
 * 汎用CSVの列マッピング定義（FR-CSV-02・database.md 3.8・api.md 8）。
 * mapping は jsonb で保存されるため、入出力時に必ず zod で検証する。
 */
import { z } from "zod";

/** 対応する日付形式（国内カードCSVで一般的なもの）。 */
export const USED_ON_FORMATS = ["YYYY/MM/DD", "YYYY-MM-DD", "YYYYMMDD"] as const;

const columnIndex = z.number().int().min(0).max(99);

export const columnMappingSchema = z.object({
  /** 先頭から読み飛ばすヘッダー行数 */
  headerRows: z.number().int().min(0).max(20),
  usedOnColumn: columnIndex,
  usedOnFormat: z.enum(USED_ON_FORMATS),
  descriptionColumn: columnIndex,
  amountColumn: columnIndex,
});

export type ColumnMapping = z.infer<typeof columnMappingSchema>;

const FORMAT_PATTERNS: Record<ColumnMapping["usedOnFormat"], RegExp> = {
  "YYYY/MM/DD": /^(\d{4})\/(\d{1,2})\/(\d{1,2})$/,
  "YYYY-MM-DD": /^(\d{4})-(\d{1,2})-(\d{1,2})$/,
  YYYYMMDD: /^(\d{4})(\d{2})(\d{2})$/,
};

/** マッピング指定の形式で日付を YYYY-MM-DD へ変換する。不正・実在しない日付は null。 */
export const parseUsedOnByFormat = (
  value: string,
  format: ColumnMapping["usedOnFormat"],
): string | null => {
  const match = FORMAT_PATTERNS[format].exec(value.trim());
  if (match === null) {
    return null;
  }
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const date = new Date(year, month - 1, day);
  const isValid =
    date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day;
  if (!isValid) {
    return null;
  }
  const pad = (n: number): string => String(n).padStart(2, "0");
  return `${year}-${pad(month)}-${pad(day)}`;
};
