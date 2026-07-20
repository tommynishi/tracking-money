/**
 * 分析APIで使う年月（YYYY-MM）の純粋ロジック（api.md 9・CON-03 Asia/Tokyo 固定）。
 * 日付範囲解決は entry/services/entryQuery.ts と同じ考え方（DB非依存）。
 */
import { ValidationError } from "@/shared/errors/appError";

const MONTH_PATTERN = /^(\d{4})-(0[1-9]|1[0-2])$/;
const pad2 = (value: number): string => String(value).padStart(2, "0");

export type MonthRange = { readonly from: string; readonly to: string };

/** month（YYYY-MM）を検証して {year, month} を返す。不正なら ValidationError。 */
export const parseMonth = (value: string): { year: number; month: number } => {
  const matched = MONTH_PATTERN.exec(value);
  if (matched === null) {
    throw new ValidationError("month は YYYY-MM 形式（01〜12月）で指定してください");
  }
  return { year: Number(matched[1]), month: Number(matched[2]) };
};

/** 対象月の初日〜末日（used_on の範囲。inclusive）。 */
export const monthRange = (value: string): MonthRange => {
  const { year, month } = parseMonth(value);
  const lastDay = new Date(year, month, 0).getDate();
  return { from: `${value}-01`, to: `${value}-${pad2(lastDay)}` };
};

/** month を delta ヶ月ずらした YYYY-MM を返す（負値で過去へ）。 */
export const shiftMonth = (value: string, delta: number): string => {
  const { year, month } = parseMonth(value);
  const total = year * 12 + (month - 1) + delta;
  const nextYear = Math.floor(total / 12);
  const nextMonth = (total % 12) + 1;
  return `${nextYear}-${pad2(nextMonth)}`;
};

/** month を含めて過去 count ヶ月分の YYYY-MM を古い順で返す（最大36ヶ月）。 */
export const monthsBack = (value: string, count: number): string[] => {
  const clamped = Math.min(Math.max(count, 1), 36);
  return Array.from({ length: clamped }, (_, i) => shiftMonth(value, -(clamped - 1) + i));
};

/** 現在時刻を Asia/Tokyo の YYYY-MM-DD として返す（通知バッチ等・CON-03）。 */
export const todayInJst = (now: Date = new Date()): string => {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const get = (type: string): string => parts.find((p) => p.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
};

/** YYYY-MM-DD の日を1〜31で返す（monthly_day との比較用）。 */
export const dayOfMonth = (dateStr: string): number => Number(dateStr.slice(8, 10));

/** その月の最終日を返す（monthly_day が月末を超える場合の繰上げ判定用）。 */
export const lastDayOfMonth = (dateStr: string): number => {
  const year = Number(dateStr.slice(0, 4));
  const month = Number(dateStr.slice(5, 7));
  return new Date(year, month, 0).getDate();
};

/** YYYY-MM-DD 同士の経過日数（a - b、a が未来なら正）。 */
export const diffDays = (a: string, b: string): number => {
  const toUtc = (s: string): number => Date.UTC(Number(s.slice(0, 4)), Number(s.slice(5, 7)) - 1, Number(s.slice(8, 10)));
  return Math.round((toUtc(a) - toUtc(b)) / (1000 * 60 * 60 * 24));
};

/** 「当月」とみなす締め日（この日を含めて当月・超えたら翌月扱い）。 */
const BILLING_CUTOFF_DAY = 10;

/**
 * ダッシュボード・分析・取込の既定の支払月（YYYY-MM）を返す。
 * 毎月10日を締め日とし、10日を含めそれ以前なら当月、超えたら翌月とする
 * （カード請求は締め後に翌月扱いになることが多いための実用上のデフォルト。
 * 個々の明細の支払月はユーザーが自由に指定・変更できる）。
 */
export const currentBillingMonth = (now: Date = new Date()): string => {
  const today = todayInJst(now);
  const currentMonth = today.slice(0, 7);
  return dayOfMonth(today) <= BILLING_CUTOFF_DAY ? currentMonth : shiftMonth(currentMonth, 1);
};
