import { describe, expect, it } from "vitest";

import { buttonClassName } from "./buttonStyles";

describe("buttonClassName", () => {
  it("既定は primary variant のクラスを含む", () => {
    const result = buttonClassName();
    expect(result).toContain("bg-primary");
    expect(result).toContain("min-h-11");
  });

  it("variant に応じた配色クラスを返す", () => {
    expect(buttonClassName({ variant: "danger" })).toContain("bg-danger");
    expect(buttonClassName({ variant: "secondary" })).toContain("border-border");
    expect(buttonClassName({ variant: "ghost" })).toContain("hover:bg-background");
  });

  it("fullWidth 指定で w-full を付け、既定では付けない", () => {
    expect(buttonClassName({ fullWidth: true })).toContain("w-full");
    expect(buttonClassName()).not.toContain("w-full");
  });

  it("追加クラスを末尾へ連結する", () => {
    expect(buttonClassName({ className: "mt-4" })).toContain("mt-4");
  });
});
