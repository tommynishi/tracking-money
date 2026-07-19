import { describe, expect, it } from "vitest";

import { normalizeDescription } from "./normalizeDescription";

describe("normalizeDescription", () => {
  it("前後・連続する空白を1つに畳む", () => {
    expect(normalizeDescription("  スーパー　　マルエツ  ")).toBe("スーパー マルエツ");
  });

  it("全角英数字を半角へ正規化する（NFKC）", () => {
    expect(normalizeDescription("ＡＭＡＺＯＮ　１２３")).toBe("amazon 123");
  });

  it("大文字小文字の違いを無視する", () => {
    expect(normalizeDescription("Amazon")).toBe(normalizeDescription("AMAZON"));
  });
});
