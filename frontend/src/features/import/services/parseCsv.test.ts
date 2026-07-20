import { describe, expect, it } from "vitest";

import { parseCsv } from "./parseCsv";

describe("parseCsv", () => {
  it("クォート付きフィールドとカンマを分解できる", () => {
    const records = parseCsv('"2026/06/25","スーパー,品川","853"\n"2026/06/26","カフェ","480"');
    expect(records).toEqual([
      ["2026/06/25", "スーパー,品川", "853"],
      ["2026/06/26", "カフェ", "480"],
    ]);
  });

  it('"" エスケープとフィールド内改行を扱える', () => {
    const records = parseCsv('"店名 ""本店""","メモ\n2行目",100');
    expect(records).toEqual([['店名 "本店"', "メモ\n2行目", "100"]]);
  });

  it("CRLF 改行と末尾空行を処理できる", () => {
    const records = parseCsv('"a","b"\r\n"c","d"\r\n');
    expect(records).toEqual([
      ["a", "b"],
      ["c", "d"],
    ]);
  });

  it("クォートなしフィールドも分解できる", () => {
    expect(parseCsv("a,b,c")).toEqual([["a", "b", "c"]]);
  });
});
