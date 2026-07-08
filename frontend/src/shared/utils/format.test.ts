import { describe, expect, it } from "vitest";

import { formatAmount, formatDateFull, formatDateList } from "./format";

describe("formatAmount", () => {
  it("3桁区切り＋円で表示する", () => {
    expect(formatAmount(12480)).toBe("12,480円");
    expect(formatAmount(0)).toBe("0円");
    expect(formatAmount(1000000)).toBe("1,000,000円");
  });

  it("負値（返金）は U+2212 マイナス記号を付ける", () => {
    expect(formatAmount(-3980)).toBe("−3,980円");
  });
});

describe("formatDateList", () => {
  it("M/D（曜）形式で表示する", () => {
    // 2026-07-08 は水曜日
    expect(formatDateList("2026-07-08")).toBe("7/8（水）");
  });

  it("YYYY-MM-DD はタイムゾーンによらずローカル日付として解釈する", () => {
    // 月初でも前日へずれない
    expect(formatDateList("2026-01-01")).toBe("1/1（木）");
  });
});

describe("formatDateFull", () => {
  it("YYYY/MM/DD 形式（ゼロ埋め）で表示する", () => {
    expect(formatDateFull("2026-07-08")).toBe("2026/07/08");
    expect(formatDateFull("2026-12-31")).toBe("2026/12/31");
  });
});
