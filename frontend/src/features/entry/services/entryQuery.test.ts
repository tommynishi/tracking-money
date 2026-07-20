import { describe, expect, it } from "vitest";

import { ValidationError } from "@/shared/errors/appError";

import { assertBillingMonthFormat, toRange, toTotalPages } from "./entryQuery";

describe("assertBillingMonthFormat", () => {
  it("YYYY-MM（01〜12月）は許可する", () => {
    expect(() => assertBillingMonthFormat("2026-07")).not.toThrow();
    expect(() => assertBillingMonthFormat("2026-01")).not.toThrow();
    expect(() => assertBillingMonthFormat("2026-12")).not.toThrow();
  });

  it("値域が不正なら ValidationError（00月・13月）", () => {
    expect(() => assertBillingMonthFormat("2026-00")).toThrow(ValidationError);
    expect(() => assertBillingMonthFormat("2026-13")).toThrow(ValidationError);
  });

  it("書式が不正なら ValidationError", () => {
    expect(() => assertBillingMonthFormat("2026-7")).toThrow(ValidationError);
    expect(() => assertBillingMonthFormat("202607")).toThrow(ValidationError);
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
