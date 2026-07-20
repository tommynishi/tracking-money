import { describe, expect, it } from "vitest";

import { parseCsv } from "../parseCsv";

import { detectStatementFormat, getStatementParser } from "./index";

describe("detectStatementFormat", () => {
  it("楽天・JCBを自動判定し、不明は null を返す（FR-CSV-03）", () => {
    expect(detectStatementFormat(parseCsv('"利用日","利用店名・商品名","利用金額"'))).toBe(
      "rakuten",
    );
    expect(
      detectStatementFormat(parseCsv('"ご利用者","カテゴリ","ご利用日","ご利用先など","ご利用金額(￥)"')),
    ).toBe("jcb");
    expect(detectStatementFormat(parseCsv('"date","amount"'))).toBeNull();
  });
});

describe("getStatementParser", () => {
  it("フォーマット指定でパーサーを取得でき、未対応は null", () => {
    expect(getStatementParser("rakuten")?.format).toBe("rakuten");
    expect(getStatementParser("jcb")?.format).toBe("jcb");
    expect(getStatementParser("saison")).toBeNull();
  });
});
