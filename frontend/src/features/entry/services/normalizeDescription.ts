/**
 * 摘要の正規化（FR-DUP-01）。重複チェックのキー・保存用の normalized_description を生成する。
 * DOM・DB に依存しない純粋関数。表記ゆれ（全角/半角・大小・空白）を吸収する。
 */

/**
 * 摘要を正規化する：
 * - NFKC 正規化（全角英数字・記号を半角へ、互換文字を統一）
 * - 前後空白を除去し、連続空白を1つへ
 * - 小文字化（大小文字の違いを無視）
 */
export const normalizeDescription = (raw: string): string =>
  raw.normalize("NFKC").replace(/\s+/g, " ").trim().toLowerCase();
