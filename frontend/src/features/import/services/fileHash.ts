/** ファイル内容の SHA-256 ハッシュ（FR-DUP-03・import_files.file_hash）。 */
import { createHash } from "node:crypto";

/** バイト列の SHA-256 を16進小文字で返す。 */
export const computeFileHash = (bytes: Uint8Array): string =>
  createHash("sha256").update(bytes).digest("hex");
