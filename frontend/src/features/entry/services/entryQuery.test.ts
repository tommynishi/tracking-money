import { describe, expect, it } from "vitest";

import { resolveDateRange, toRange, toTotalPages } from "./entryQuery";

describe("resolveDateRange", () => {
  it("month 指定でその月の初日〜末日を返す（うるう年）", () => {
    expect(resolveDateRange({ month: "2024-02" })).toEqual({
      from: "2024-02-01",
      to: "2024-02-29",
    });
  });

  it("month 指定で末日を正しく算出する（30日・31日）", () => {
    expect(resolveDateRange({ month: "2026-04" })).toEqual({
      from: "2026-04-01",
      to: "2026-04-30",
    });
    expect(resolveDateRange({ month: "2026-07" })).toEqual({
      from: "2026-07-01",
      to: "2026-07-31",
    });
  });

  it("month 未指定なら from/to をそのまま返す", () => {
    expect(resolveDateRange({ from: "2026-07-01", to: "2026-07-15" })).toEqual({
      from: "2026-07-01",
      to: "2026-07-15",
    });
  });
});

describe("toRange", () => {
  it("ページ番号と件数から 0 始まりの範囲を返す", () => {
    expect(toRange(1, 20)).toEqual({ from: 0, to: 19 });
    expect(toRange(3, 20)).toEqual({ from: 40, to: 59 });
  });
});

describe("toTotalPages", () => {
  it("総件数と1ページ件数から総ページ数を算出する", () => {
    expect(toTotalPages(214, 20)).toBe(11);
    expect(toTotalPages(40, 20)).toBe(2);
  });

  it("0件でも最低1ページを返す", () => {
    expect(toTotalPages(0, 20)).toBe(1);
  });
});
