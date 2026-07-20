import { describe, expect, it } from "vitest";

import { ValidationError } from "@/shared/errors/appError";

import {
  currentBillingMonth,
  dayOfMonth,
  diffDays,
  lastDayOfMonth,
  monthRange,
  monthsBack,
  parseMonth,
  shiftMonth,
  todayInJst,
} from "./month";

describe("parseMonth", () => {
  it("YYYY-MM を分解する", () => {
    expect(parseMonth("2026-07")).toEqual({ year: 2026, month: 7 });
  });

  it("不正な形式は ValidationError", () => {
    expect(() => parseMonth("2026-13")).toThrow(ValidationError);
    expect(() => parseMonth("2026/07")).toThrow(ValidationError);
  });
});

describe("monthRange", () => {
  it("月初〜月末を返す（うるう年考慮）", () => {
    expect(monthRange("2026-07")).toEqual({ from: "2026-07-01", to: "2026-07-31" });
    expect(monthRange("2024-02")).toEqual({ from: "2024-02-01", to: "2024-02-29" });
  });
});

describe("shiftMonth", () => {
  it("年をまたいでずらせる", () => {
    expect(shiftMonth("2026-01", -1)).toBe("2025-12");
    expect(shiftMonth("2026-12", 1)).toBe("2027-01");
    expect(shiftMonth("2026-07", -12)).toBe("2025-07");
  });
});

describe("monthsBack", () => {
  it("指定月を含め古い順に返す", () => {
    expect(monthsBack("2026-03", 3)).toEqual(["2026-01", "2026-02", "2026-03"]);
  });

  it("36ヶ月に丸める", () => {
    expect(monthsBack("2026-03", 100)).toHaveLength(36);
  });
});

describe("todayInJst", () => {
  it("UTC日付をまたぐ時刻でも Asia/Tokyo の日付を返す", () => {
    // UTC 2026-07-19 15:30 = JST 2026-07-20 00:30
    expect(todayInJst(new Date("2026-07-19T15:30:00Z"))).toBe("2026-07-20");
  });
});

describe("dayOfMonth / lastDayOfMonth / diffDays", () => {
  it("日を取り出す", () => {
    expect(dayOfMonth("2026-07-20")).toBe(20);
    expect(lastDayOfMonth("2026-02-01")).toBe(28);
    expect(lastDayOfMonth("2024-02-01")).toBe(29);
  });

  it("経過日数を計算する", () => {
    expect(diffDays("2026-07-20", "2026-07-10")).toBe(10);
    expect(diffDays("2026-07-10", "2026-07-20")).toBe(-10);
  });
});

describe("currentBillingMonth", () => {
  it("10日を含めそれ以前は当月", () => {
    expect(currentBillingMonth(new Date("2026-07-01T03:00:00Z"))).toBe("2026-07"); // JST 7/1
    expect(currentBillingMonth(new Date("2026-07-10T14:59:00Z"))).toBe("2026-07"); // JST 7/10 23:59
  });

  it("10日を超えたら翌月", () => {
    expect(currentBillingMonth(new Date("2026-07-10T15:01:00Z"))).toBe("2026-08"); // JST 7/11 00:01
    expect(currentBillingMonth(new Date("2026-07-25T03:00:00Z"))).toBe("2026-08"); // JST 7/25
  });

  it("年をまたぐ場合も正しく繰り上がる", () => {
    expect(currentBillingMonth(new Date("2026-12-25T03:00:00Z"))).toBe("2027-01"); // JST 12/25
  });
});
