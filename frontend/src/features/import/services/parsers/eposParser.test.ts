import { describe, expect, it } from "vitest";

import { parseCsv } from "../parseCsv";

import { eposParser } from "./eposParser";

// 実CSVの構成（ヘッダー＋明細＋末尾の合計行）を模した合成データ（実データは含めない）
const SAMPLE = [
  '"種別（ショッピング、キャッシング、その他）","ご利用年月日","ご利用場所","ご利用内容","ご利用金額","お支払金額（キャッシングでは利息を含みます）","支払区分"',
  '"ショッピング","2026年07月01日","店舗A","－","2627","2627","1回払い"',
  '"ショッピング","2026年06月30日","店舗B","－","880","880","1回払い"',
  '"お支払合計額","","","","","3507",""',
].join("\r\n");

describe("eposParser", () => {
  it("ヘッダー行を検出できる", () => {
    expect(eposParser.detect(parseCsv(SAMPLE))).toBe(true);
    expect(eposParser.detect(parseCsv('"利用日","利用店名・商品名","利用金額"'))).toBe(false);
  });

  it("明細行を変換でき、末尾の合計行はスキップする（YYYY年MM月DD日形式の日付）", () => {
    const result = eposParser.parse(parseCsv(SAMPLE));
    expect(result.errors).toEqual([]);
    expect(result.rows).toEqual([
      { rowNumber: 2, usedOn: "2026-07-01", amount: 2627, description: "店舗A" },
      { rowNumber: 3, usedOn: "2026-06-30", amount: 880, description: "店舗B" },
    ]);
  });

  it("不正行はエラーへ集め、処理を継続する（FR-CSV-07）", () => {
    const broken = [
      '"種別","ご利用年月日","ご利用場所","ご利用内容","ご利用金額","支払区分"',
      '"ショッピング","不明な日付","店X","－","100","1回払い"',
      '"ショッピング","2026年06月10日","店Y","－","6万9千","1回払い"',
      '"ショッピング","2026年06月11日","店Z","－","69,000","1回払い"',
    ].join("\n");
    const result = eposParser.parse(parseCsv(broken));
    expect(result.errors).toEqual([
      { rowNumber: 2, message: "ご利用年月日が不正です" },
      { rowNumber: 3, message: "ご利用金額が不正です" },
    ]);
    expect(result.rows).toEqual([
      { rowNumber: 4, usedOn: "2026-06-11", amount: 69000, description: "店Z" },
    ]);
  });

  it("ヘッダー行が見つからない場合は全体エラーを返す", () => {
    const result = eposParser.parse(parseCsv('"a","b"'));
    expect(result.rows).toEqual([]);
    expect(result.errors[0].message).toContain("ヘッダー");
  });
});
