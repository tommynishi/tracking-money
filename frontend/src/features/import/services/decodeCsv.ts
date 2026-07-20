/**
 * CSVバイト列の文字コード自動判定・デコード（FR-CSV-06）。
 * UTF-8（BOM有無とも）を優先し、UTF-8 として不正なバイト列は Shift_JIS とみなす。
 * 楽天e-NAVI は UTF-8（BOM付き）、MyJCB は Shift_JIS（実サンプルで確認）。
 */

const UTF8_BOM = [0xef, 0xbb, 0xbf] as const;

const hasUtf8Bom = (bytes: Uint8Array): boolean =>
  bytes.length >= UTF8_BOM.length && UTF8_BOM.every((value, index) => bytes[index] === value);

/** バイト列を判定してテキストへデコードする。BOM は除去して返す。 */
export const decodeCsvBytes = (bytes: Uint8Array): { text: string; encoding: "utf-8" | "shift_jis" } => {
  const body = hasUtf8Bom(bytes) ? bytes.subarray(UTF8_BOM.length) : bytes;
  try {
    return { text: new TextDecoder("utf-8", { fatal: true }).decode(body), encoding: "utf-8" };
  } catch {
    return { text: new TextDecoder("shift_jis").decode(body), encoding: "shift_jis" };
  }
};
