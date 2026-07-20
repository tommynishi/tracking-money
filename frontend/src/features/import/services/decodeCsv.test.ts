import { describe, expect, it } from "vitest";

import { decodeCsvBytes } from "./decodeCsv";

const utf8 = (text: string): Uint8Array => new TextEncoder().encode(text);

describe("decodeCsvBytes", () => {
  it("BOM付きUTF-8をBOM除去してデコードする", () => {
    const bytes = new Uint8Array([0xef, 0xbb, 0xbf, ...utf8('"利用日","利用金額"')]);
    const result = decodeCsvBytes(bytes);
    expect(result.encoding).toBe("utf-8");
    expect(result.text).toBe('"利用日","利用金額"');
  });

  it("BOMなしUTF-8をデコードする", () => {
    const result = decodeCsvBytes(utf8("摘要,100"));
    expect(result.encoding).toBe("utf-8");
    expect(result.text).toBe("摘要,100");
  });

  it("UTF-8として不正なバイト列は Shift_JIS としてデコードする", () => {
    // 「ご利用日」の Shift_JIS 表現
    const sjis = new Uint8Array([0x82, 0xb2, 0x97, 0x98, 0x97, 0x70, 0x93, 0xfa]);
    const result = decodeCsvBytes(sjis);
    expect(result.encoding).toBe("shift_jis");
    expect(result.text).toBe("ご利用日");
  });
});
