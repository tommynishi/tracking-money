import { describe, expect, it } from "vitest";

import { columnMappingSchema, parseUsedOnByFormat } from "./columnMapping";

describe("columnMappingSchema", () => {
  it("正しいマッピングを受理する", () => {
    const result = columnMappingSchema.safeParse({
      headerRows: 1,
      usedOnColumn: 0,
      usedOnFormat: "YYYY/MM/DD",
      descriptionColumn: 1,
      amountColumn: 4,
    });
    expect(result.success).toBe(true);
  });

  it("負の列番号・未知の日付形式を拒否する", () => {
    expect(
      columnMappingSchema.safeParse({
        headerRows: 0,
        usedOnColumn: -1,
        usedOnFormat: "YYYY/MM/DD",
        descriptionColumn: 1,
        amountColumn: 2,
      }).success,
    ).toBe(false);
    expect(
      columnMappingSchema.safeParse({
        headerRows: 0,
        usedOnColumn: 0,
        usedOnFormat: "DD/MM/YYYY",
        descriptionColumn: 1,
        amountColumn: 2,
      }).success,
    ).toBe(false);
  });
});

describe("parseUsedOnByFormat", () => {
  it("各形式を YYYY-MM-DD へ変換する", () => {
    expect(parseUsedOnByFormat("2026/7/1", "YYYY/MM/DD")).toBe("2026-07-01");
    expect(parseUsedOnByFormat("2026-07-01", "YYYY-MM-DD")).toBe("2026-07-01");
    expect(parseUsedOnByFormat("20260701", "YYYYMMDD")).toBe("2026-07-01");
  });

  it("形式不一致・実在しない日付は null", () => {
    expect(parseUsedOnByFormat("2026/07/01", "YYYY-MM-DD")).toBeNull();
    expect(parseUsedOnByFormat("2026/02/30", "YYYY/MM/DD")).toBeNull();
    expect(parseUsedOnByFormat("引落日", "YYYYMMDD")).toBeNull();
  });
});
