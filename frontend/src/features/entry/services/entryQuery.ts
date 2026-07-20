/**
 * 明細一覧のクエリ組み立てに関わる純粋ロジック（api.md 6.1）。
 * ページ範囲・総ページ数・支払月の書式検証を DOM/DB 非依存で算出する。
 */
import { ValidationError } from "@/shared/errors/appError";

import type { EntrySource } from "../types";

export type EntrySort = "usedOn" | "amount";
export type EntryOrder = "asc" | "desc";

export type EntryListFilters = {
  /** 支払月 YYYY-MM（billing_month の完全一致。既定の絞り込み軸）。 */
  readonly billingMonth?: string;
  /** 利用日（used_on）の範囲絞り込み（任意・支払月と併用可）。 */
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

const MONTH_PATTERN = /^(\d{4})-(0[1-9]|1[0-2])$/;

/** 支払月（YYYY-MM・01〜12月）の書式を検証する。不正なら ValidationError。 */
export const assertBillingMonthFormat = (value: string): void => {
  if (!MONTH_PATTERN.test(value)) {
    throw new ValidationError("billingMonth は YYYY-MM 形式（01〜12月）で指定してください");
  }
};

/** ページ番号・件数から取得範囲（0始まり・inclusive の [from, to]）を算出する。 */
export const toRange = (page: number, perPage: number): { from: number; to: number } => {
  const from = (page - 1) * perPage;
  return { from, to: from + perPage - 1 };
};

/** 総件数と1ページ件数から総ページ数を算出する（0件でも最低1ページ）。 */
export const toTotalPages = (totalCount: number, perPage: number): number =>
  totalCount === 0 ? 1 : Math.ceil(totalCount / perPage);
