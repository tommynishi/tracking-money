/**
 * パーサーレジストリとフォーマット自動判定（FR-CSV-03）。
 * 新しいカード会社は StatementParser 実装を追加してここへ登録する。
 */
import type { StatementFormat } from "../../types";

import { jcbParser } from "./jcbParser";
import { rakutenParser } from "./rakutenParser";
import type { StatementParser } from "./statementParser";

/** 対応済みのカード会社パーサー（判定は登録順に試行する）。 */
export const statementParsers: readonly StatementParser[] = [rakutenParser, jcbParser];

/** レコード内容からフォーマットを自動判定する。判定不能は null（ユーザー選択へ委ねる）。 */
export const detectStatementFormat = (
  records: readonly (readonly string[])[],
): StatementFormat | null =>
  statementParsers.find((parser) => parser.detect(records))?.format ?? null;

/** フォーマット指定でパーサーを取得する。未対応フォーマットは null。 */
export const getStatementParser = (format: StatementFormat): StatementParser | null =>
  statementParsers.find((parser) => parser.format === format) ?? null;
