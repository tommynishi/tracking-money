import { describe, expect, it } from "vitest";

import { addToast, autoDismissMs, removeToast, type Toast } from "./toast";

const toast = (id: string): Toast => ({ id, type: "success", message: `msg-${id}` });

describe("autoDismissMs", () => {
  it("成功は4秒で自動消去する", () => {
    expect(autoDismissMs("success")).toBe(4000);
  });

  it("エラーは自動消去しない（手動クローズ）", () => {
    expect(autoDismissMs("error")).toBeNull();
  });
});

describe("addToast / removeToast", () => {
  it("末尾へ追加し、元配列は変更しない", () => {
    const original: Toast[] = [toast("a")];
    const next = addToast(original, toast("b"));

    expect(next.map((t) => t.id)).toEqual(["a", "b"]);
    expect(original).toHaveLength(1);
  });

  it("指定 id を除去する", () => {
    const list: Toast[] = [toast("a"), toast("b"), toast("c")];
    expect(removeToast(list, "b").map((t) => t.id)).toEqual(["a", "c"]);
  });
});
