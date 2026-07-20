import { describe, expect, it } from "vitest";

import { computeFileHash } from "./fileHash";

describe("computeFileHash", () => {
  it("SHA-256 の16進小文字を返す", () => {
    // "abc" の既知の SHA-256
    expect(computeFileHash(new TextEncoder().encode("abc"))).toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    );
  });

  it("同一内容は同一ハッシュ・異なる内容は異なるハッシュ", () => {
    const a = computeFileHash(new TextEncoder().encode("same"));
    const b = computeFileHash(new TextEncoder().encode("same"));
    const c = computeFileHash(new TextEncoder().encode("diff"));
    expect(a).toBe(b);
    expect(a).not.toBe(c);
  });
});
