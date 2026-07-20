/**
 * 金額・日付の表示フォーマット（ui-rules §5）。画面ごとに実装せず本モジュールへ集約する。
 * 表示色（refund トークン等）は UI 側の責務とし、ここは文字列生成のみを担う。
 */

const YEN = "円";
/** 返金（負値）に用いる U+2212 MINUS SIGN（ハイフンより視認性が高い・ui-rules §5）。 */
const MINUS_SIGN = "−";
const WEEKDAYS_JA = ["日", "月", "火", "水", "木", "金", "土"] as const;

const DATE_ONLY_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

/**
 * 日付入力を Date へ変換する。`YYYY-MM-DD`（entries.used_on 等の日付のみ）は
 * タイムゾーンによる日付ずれを避けるためローカル日付として解釈する。
 */
const toDate = (value: string | Date): Date => {
  if (value instanceof Date) return value;
  const dateOnly = DATE_ONLY_PATTERN.exec(value);
  if (dateOnly !== null) {
    const [, year, month, day] = dateOnly;
    return new Date(Number(year), Number(month) - 1, Number(day));
  }
  return new Date(value);
};

const pad2 = (value: number): string => String(value).padStart(2, "0");

/** 金額を「12,480円」形式で表示する。負値（返金）は「−3,980円」。 */
export const formatAmount = (value: number): string => {
  const grouped = new Intl.NumberFormat("ja-JP").format(Math.abs(value));
  const sign = value < 0 ? MINUS_SIGN : "";
  return `${sign}${grouped}${YEN}`;
};

/** 一覧向けの日付「M/D（曜）」（例：7/8（水））。 */
export const formatDateList = (value: string | Date): string => {
  const date = toDate(value);
  return `${date.getMonth() + 1}/${date.getDate()}（${WEEKDAYS_JA[date.getDay()]}）`;
};

/** 詳細・フォーム向けの日付「YYYY/MM/DD」。 */
export const formatDateFull = (value: string | Date): string => {
  const date = toDate(value);
  return `${date.getFullYear()}/${pad2(date.getMonth() + 1)}/${pad2(date.getDate())}`;
};

/** 履歴向けの日時「YYYY/MM/DD HH:mm」（取込履歴の取込日時等）。 */
export const formatDateTime = (value: string | Date): string => {
  const date = toDate(value);
  return `${formatDateFull(date)} ${pad2(date.getHours())}:${pad2(date.getMinutes())}`;
};
