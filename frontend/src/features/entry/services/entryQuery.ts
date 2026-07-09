/**
 * 明細一覧のクエリ組み立てに関わる純粋ロジック（api.md 6.1）。
 * 期間の解決・ページ範囲・総ページ数を DOM/DB 非依存で算出する。
 */
import { ValidationError } from "@/shared/errors/appError";

import type { EntrySource } from "../types";

export type EntrySort = "usedOn" | "amount";
export type EntryOrder = "asc" | "desc";

export type EntryListFilters = {
  /** 対象月 YYYY-MM（from/to と排他）。 */
  readonly month?: string;
  readonly from?: string;
  readonly to?: string;
  readonly categoryId?: string;
  readonly minAmount?: number;
  readonly maxAmount?: number;
  readonly q?: string;
  readonly source?: EntrySource;
};

export type EntryListQuery = {
  readonly filters: EntryListFilters;
  readonly sort: EntrySort;
  readonly order: EntryOrder;
  readonly page: number;
  readonly perPage: number;
};

/** used_on の絞り込み範囲（inclusive・YYYY-MM-DD）。 */
export type DateRange = {
  readonly from?: string;
  readonly to?: string;
};

const MONTH_PATTERN = /^(\d{4})-(0[1-9]|1[0-2])$/;

const pad2 = (value: number): string => String(value).padStart(2, "0");

/**
 * フィルタから used_on の範囲を解決する。
 * month 指定時はその月の初日〜末日、未指定時は from/to をそのまま用いる。
 * month の書式・値域（YYYY-MM・01〜12月）が不正な場合は ValidationError を throw する。
 */
export const resolveDateRange = (filters: EntryListFilters): DateRange => {
  if (filters.month === undefined) {
    return { from: filters.from, to: filters.to };
  }

  const matched = MONTH_PATTERN.exec(filters.month);
  if (matched === null) {
    throw new ValidationError("month は YYYY-MM 形式（01〜12月）で指定してください");
  }

  const [, year, month] = matched;
  const lastDay = new Date(Number(year), Number(month), 0).getDate();
  return { from: `${year}-${month}-01`, to: `${year}-${month}-${pad2(lastDay)}` };
};

/** ページ番号・件数から取得範囲（0始まり・inclusive の [from, to]）を算出する。 */
export const toRange = (page: number, perPage: number): { from: number; to: number } => {
  const from = (page - 1) * perPage;
  return { from, to: from + perPage - 1 };
};

/** 総件数と1ページ件数から総ページ数を算出する（0件でも最低1ページ）。 */
export const toTotalPages = (totalCount: number, perPage: number): number =>
  totalCount === 0 ? 1 : Math.ceil(totalCount / perPage);
