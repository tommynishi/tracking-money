import { describe, expect, it } from "vitest";

import { parseCsv } from "../parseCsv";

import { rakutenParser } from "./rakutenParser";

// 実CSVの列構成を模した合成データ（実データは含めない）
const SAMPLE = [
  '"利用日","利用店名・商品名","利用者","支払方法","利用金額","手数料/利息","支払総額","7月支払金額","当月請求額","8月繰越残高","新規サイン"',
  '"2026/06/25","ｽｰﾊﾟｰﾏｰｹｯﾄA","本人","1回払い","853","0","853","853","853","0","*"',
  '"2026/06/24","コンビニB","本人","1回払い","315","0","315","315","315","0","*"',
  '"2026/06/20","返金ストアC","本人","1回払い","-1200","0","-1200","-1200","-1200","0","*"',
].join("\n");

describe("rakutenParser", () => {
  it("楽天CSVのヘッダーを検出できる", () => {
    expect(rakutenParser.detect(parseCsv(SAMPLE))).toBe(true);
    expect(rakutenParser.detect(parseCsv('"ご利用日","ご利用先など"'))).toBe(false);
  });

  it("明細行を変換できる（日付ISO化・マイナス金額対応）", () => {
    const result = rakutenParser.parse(parseCsv(SAMPLE));
    expect(result.errors).toEqual([]);
    expect(result.rows).toEqual([
      { rowNumber: 2, usedOn: "2026-06-25", amount: 853, description: "ｽｰﾊﾟｰﾏｰｹｯﾄA" },
      { rowNumber: 3, usedOn: "2026-06-24", amount: 315, description: "コンビニB" },
      { rowNumber: 4, usedOn: "2026-06-20", amount: -1200, description: "返金ストアC" },
    ]);
  });

  it("不正行はエラーへ集め、他の行の取込は継続する（FR-CSV-07）", () => {
    const broken = [
      '"利用日","利用店名・商品名","利用者","支払方法","利用金額"',
      '"2026/13/99","店X","本人","1回払い","100"',
      '"2026/06/01","店Y","本人","1回払い","abc"',
      '"2026/06/02","","本人","1回払い","100"',
      '"2026/06/03","店Z","本人","1回払い","1,234"',
    ].join("\n");
    const result = rakutenParser.parse(parseCsv(broken));
    expect(result.errors).toEqual([
      { rowNumber: 2, message: "利用日が不正です" },
      { rowNumber: 3, message: "利用金額が不正です" },
      { rowNumber: 4, message: "利用店名・商品名が空です" },
    ]);
    expect(result.rows).toEqual([
      { rowNumber: 5, usedOn: "2026-06-03", amount: 1234, description: "店Z" },
    ]);
  });

  it("補足行・区切り行（日付なし・金額なし）はエラーにせずスキップする", () => {
    const withAnnotations = [
      '"利用日","利用店名・商品名","利用者","支払方法","利用金額"',
      '"2026/06/06","海外ストアA","本人","1回払い","7192"',
      '"","現地利用額　７１９２．０００変換レート　１．０００円","","",""',
      '"■ご利用キャンセルなど","","","",""',
      '"2026/07/06","店B","本人","1回","-100"',
    ].join("\n");
    const result = rakutenParser.parse(parseCsv(withAnnotations));
    expect(result.errors).toEqual([]);
    expect(result.rows).toEqual([
      { rowNumber: 2, usedOn: "2026-06-06", amount: 7192, description: "海外ストアA" },
      { rowNumber: 5, usedOn: "2026-07-06", amount: -100, description: "店B" },
    ]);
  });

  it("ヘッダーが見つからない場合は全体エラーを返す", () => {
    const result = rakutenParser.parse(parseCsv('"a","b"'));
    expect(result.rows).toEqual([]);
    expect(result.errors[0].message).toContain("ヘッダー");
  });
});
