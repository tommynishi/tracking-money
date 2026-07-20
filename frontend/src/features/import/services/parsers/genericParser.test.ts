import { describe, expect, it } from "vitest";

import type { ColumnMapping } from "../columnMapping";
import { parseCsv } from "../parseCsv";

import { parseGenericCsv } from "./genericParser";

const mapping: ColumnMapping = {
  headerRows: 2,
  usedOnColumn: 1,
  usedOnFormat: "YYYY-MM-DD",
  descriptionColumn: 2,
  amountColumn: 3,
};

describe("parseGenericCsv", () => {
  it("マッピングに従って明細行へ変換する（ヘッダー行スキップ・列指定）", () => {
    const csv = [
      "タイトル行,,,",
      "No,日付,店名,金額",
      "1,2026-06-01,スーパーA,1200",
      '2,2026-06-02,"カフェ,B","1,500"',
    ].join("\n");
    const result = parseGenericCsv(parseCsv(csv), mapping);
    expect(result.errors).toEqual([]);
    expect(result.rows).toEqual([
      { rowNumber: 3, usedOn: "2026-06-01", amount: 1200, description: "スーパーA" },
      { rowNumber: 4, usedOn: "2026-06-02", amount: 1500, description: "カフェ,B" },
    ]);
  });

  it("不正行はエラーへ集め、日付も金額も無い行はスキップする（FR-CSV-07）", () => {
    const csv = [
      "h1,,,",
      "h2,,,",
      "1,不正日付,店X,100",
      "2,2026-06-03,店Y,金額不明",
      "3,合計,,",
      "4,2026-06-04,店Z,300",
    ].join("\n");
    const result = parseGenericCsv(parseCsv(csv), mapping);
    expect(result.errors).toEqual([
      { rowNumber: 3, message: "利用日が不正です" },
      { rowNumber: 4, message: "金額が不正です" },
    ]);
    expect(result.rows).toEqual([
      { rowNumber: 6, usedOn: "2026-06-04", amount: 300, description: "店Z" },
    ]);
  });
});
