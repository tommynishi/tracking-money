import { describe, expect, it } from "vitest";

import { parseCsv } from "../parseCsv";

import { jcbParser } from "./jcbParser";

// 実CSVの構成（冒頭サマリー行＋明細セクション）を模した合成データ（実データは含めない）
const SAMPLE = [
  '"","","今回のお支払日","2026/07/10"',
  '"","","今回のお支払金額合計(￥)","97,334"',
  '"【ご利用明細】"',
  '"ご利用者","カテゴリ","ご利用日","ご利用先など","ご利用金額(￥)","支払区分","今回回数","訂正サイン","お支払い金額(￥)","国内／海外","摘要","備考"',
  '"****-****-****-0000　カードA"," ≪ショッピング≫"," 2026/05/21","飲食店A","920","１回","","","920","国内","",""',
  '"****-****-****-0000　カードA"," ≪ショッピング≫"," 2026/06/03","通販B","1,145","１回","","","1,145","国内","","* 4"',
].join("\r\n");

describe("jcbParser", () => {
  it("サマリー行の後の明細ヘッダーを検出できる", () => {
    expect(jcbParser.detect(parseCsv(SAMPLE))).toBe(true);
    expect(jcbParser.detect(parseCsv('"利用日","利用店名・商品名","利用金額"'))).toBe(false);
  });

  it("明細行を変換できる（先頭空白付き日付・カンマ区切り金額）", () => {
    const result = jcbParser.parse(parseCsv(SAMPLE));
    expect(result.errors).toEqual([]);
    expect(result.rows).toEqual([
      { rowNumber: 5, usedOn: "2026-05-21", amount: 920, description: "飲食店A" },
      { rowNumber: 6, usedOn: "2026-06-03", amount: 1145, description: "通販B" },
    ]);
  });

  it("不正行はエラーへ集め、処理を継続する（FR-CSV-07）", () => {
    const broken = [
      '"ご利用者","カテゴリ","ご利用日","ご利用先など","ご利用金額(￥)"',
      '"カードA","≪≫","不明な日付","店X","100"',
      '"カードA","≪≫"," 2026/06/10","店Y","6万9千"',
      '"カードA","≪≫"," 2026/06/11","店Z","69,000"',
    ].join("\n");
    const result = jcbParser.parse(parseCsv(broken));
    expect(result.errors).toEqual([
      { rowNumber: 2, message: "ご利用日が不正です" },
      { rowNumber: 3, message: "ご利用金額が不正です" },
    ]);
    expect(result.rows).toEqual([
      { rowNumber: 4, usedOn: "2026-06-11", amount: 69000, description: "店Z" },
    ]);
  });

  it("明細ヘッダーが見つからない場合は全体エラーを返す", () => {
    const result = jcbParser.parse(parseCsv('"a","b"'));
    expect(result.rows).toEqual([]);
    expect(result.errors[0].message).toContain("ヘッダー");
  });
});
