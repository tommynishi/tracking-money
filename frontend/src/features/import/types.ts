/** インポート機能の型定義（requirements.md 5.6〜5.8・database.md 3.7）。 */

/** 取込フォーマット（database.md 3.7 import_files.format と一致させる）。 */
export type StatementFormat = "rakuten" | "jcb" | "epos" | "saison" | "generic" | "pdf";

/** パース済みの明細行（確定前のプレビュー行の元データ）。 */
export type ParsedRow = {
  /** 元ファイルの行番号（1始まり。エラー報告・プレビュー対応付け用） */
  readonly rowNumber: number;
  /** 利用日（YYYY-MM-DD） */
  readonly usedOn: string;
  /** 円・整数。返金はマイナス（api.md 1.1） */
  readonly amount: number;
  /** 摘要（利用店名等。原文のまま保持し、正規化は重複判定時に行う） */
  readonly description: string;
};

/** 不正行の報告（FR-CSV-07。取込全体は失敗させない）。 */
export type RowError = {
  readonly rowNumber: number;
  readonly message: string;
};

/** パース結果。rows と errors は行単位で排他。 */
export type ParseResult = {
  readonly rows: readonly ParsedRow[];
  readonly errors: readonly RowError[];
};
