import { describe, expect, it } from "vitest";

import { normalizePreference, resolveTheme } from "./theme";

describe("resolveTheme", () => {
  it("light / dark は OS 設定に関わらずそのまま解決する", () => {
    expect(resolveTheme("light", true)).toBe("light");
    expect(resolveTheme("dark", false)).toBe("dark");
  });

  it("system は OS の prefers-color-scheme に従う", () => {
    expect(resolveTheme("system", true)).toBe("dark");
    expect(resolveTheme("system", false)).toBe("light");
  });
});

describe("normalizePreference", () => {
  it("有効な選択値はそのまま返す", () => {
    expect(normalizePreference("light")).toBe("light");
    expect(normalizePreference("dark")).toBe("dark");
    expect(normalizePreference("system")).toBe("system");
  });

  it("不正値・null は system にフォールバックする", () => {
    expect(normalizePreference("invalid")).toBe("system");
    expect(normalizePreference(null)).toBe("system");
    expect(normalizePreference(undefined)).toBe("system");
  });
});
