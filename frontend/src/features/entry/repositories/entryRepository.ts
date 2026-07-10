/**
 * entries への DB アクセス（Repository 層）。DB行⇔ドメイン型の変換を担い、業務判断は持たない。
 * 認可（ledger_members 検証）・書式検証は上位（Route Handler / Service）の責務とする。
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

import { NotFoundError } from "@/shared/errors/appError";

import { resolveDateRange, toRange, type EntryListQuery } from "../services/entryQuery";
import type { Entry, EntryListItem, EntrySource } from "../types";

const ENTRIES_TABLE = "entries";
const ENTRY_COLUMNS =
  "id, ledger_id, category_id, used_on, amount, description, normalized_description, " +
  "payment_method, memo, type, source, created_by_user_id, created_at, updated_at";
// categories / users の埋め込みは表示情報の参照であり、明細の有効性は entries.deleted_at が正。
// カテゴリの有効参照は削除RPC（delete_category_with_reassign）の付け替えで保証され、
// 登録者は退会後も履歴として表示するため、埋め込み側の deleted_at では絞らない
const ENTRY_LIST_COLUMNS =
  "id, used_on, amount, description, payment_method, memo, source, " +
  "categories!inner(id, name), users!inner(id, display_name)";

const entryRowSchema = z.object({
  id: z.string(),
  ledger_id: z.string(),
  category_id: z.string(),
  used_on: z.string(),
  amount: z.number(),
  description: z.string(),
  normalized_description: z.string(),
  payment_method: z.string().nullable(),
  memo: z.string().nullable(),
  type: z.enum(["expense"]),
  source: z.enum(["manual", "csv", "pdf"]),
  created_by_user_id: z.string(),
  created_at: z.string(),
  updated_at: z.string(),
});

const entryListRowSchema = z.object({
  id: z.string(),
  used_on: z.string(),
  amount: z.number(),
  description: z.string(),
  payment_method: z.string().nullable(),
  memo: z.string().nullable(),
  source: z.enum(["manual", "csv", "pdf"]),
  categories: z.object({ id: z.string(), name: z.string() }),
  users: z.object({ id: z.string(), display_name: z.string() }),
});

const toEntry = (row: z.infer<typeof entryRowSchema>): Entry => ({
  id: row.id,
  ledgerId: row.ledger_id,
  categoryId: row.category_id,
  usedOn: row.used_on,
  amount: row.amount,
  description: row.description,
  normalizedDescription: row.normalized_description,
  paymentMethod: row.payment_method,
  memo: row.memo,
  type: row.type,
  source: row.source,
  createdByUserId: row.created_by_user_id,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

const toEntryListItem = (row: z.infer<typeof entryListRowSchema>): EntryListItem => ({
  id: row.id,
  usedOn: row.used_on,
  amount: row.amount,
  description: row.description,
  paymentMethod: row.payment_method,
  memo: row.memo,
  source: row.source,
  category: { id: row.categories.id, name: row.categories.name },
  createdBy: { id: row.users.id, displayName: row.users.display_name },
});

/** キーワードから PostgREST フィルタ構文を壊す文字を除去する（安全化）。 */
const sanitizeKeyword = (raw: string | undefined): string | null => {
  if (raw === undefined) return null;
  const cleaned = raw.replace(/[,()*%\\]/g, " ").trim();
  return cleaned === "" ? null : cleaned;
};

export type CreateEntryDbInput = {
  readonly ledgerId: string;
  readonly categoryId: string;
  readonly usedOn: string;
  readonly amount: number;
  readonly description: string;
  readonly normalizedDescription: string;
  readonly paymentMethod: string | null;
  readonly memo: string | null;
  readonly source: EntrySource;
  readonly createdByUserId: string;
};

export type UpdateEntryFields = {
  readonly categoryId?: string;
  readonly usedOn?: string;
  readonly amount?: number;
  readonly description?: string;
  readonly normalizedDescription?: string;
  readonly paymentMethod?: string | null;
  readonly memo?: string | null;
};

export type EntryRepository = {
  create(input: CreateEntryDbInput): Promise<Entry>;
  getById(ledgerId: string, entryId: string): Promise<Entry | null>;
  updateFields(ledgerId: string, entryId: string, fields: UpdateEntryFields): Promise<Entry>;
  softDelete(ledgerId: string, entryId: string): Promise<void>;
  list(
    ledgerId: string,
    query: EntryListQuery,
  ): Promise<{ items: EntryListItem[]; totalCount: number }>;
};

export const createEntryRepository = (client: SupabaseClient): EntryRepository => ({
  async create(input) {
    const { data, error } = await client
      .from(ENTRIES_TABLE)
      .insert({
        ledger_id: input.ledgerId,
        category_id: input.categoryId,
        used_on: input.usedOn,
        amount: input.amount,
        description: input.description,
        normalized_description: input.normalizedDescription,
        payment_method: input.paymentMethod,
        memo: input.memo,
        source: input.source,
        created_by_user_id: input.createdByUserId,
      })
      .select(ENTRY_COLUMNS)
      .single();

    if (error) {
      throw new Error(`Failed to create entry: ${error.message}`);
    }

    return toEntry(entryRowSchema.parse(data));
  },

  async getById(ledgerId, entryId) {
    const { data, error } = await client
      .from(ENTRIES_TABLE)
      .select(ENTRY_COLUMNS)
      .eq("id", entryId)
      .eq("ledger_id", ledgerId)
      .is("deleted_at", null)
      .maybeSingle();

    if (error) {
      throw new Error(`Failed to get entry: ${error.message}`);
    }

    return data === null ? null : toEntry(entryRowSchema.parse(data));
  },

  async updateFields(ledgerId, entryId, fields) {
    const patch: Record<string, string | number | null> = {};
    if (fields.categoryId !== undefined) patch.category_id = fields.categoryId;
    if (fields.usedOn !== undefined) patch.used_on = fields.usedOn;
    if (fields.amount !== undefined) patch.amount = fields.amount;
    if (fields.description !== undefined) patch.description = fields.description;
    if (fields.normalizedDescription !== undefined) {
      patch.normalized_description = fields.normalizedDescription;
    }
    if (fields.paymentMethod !== undefined) patch.payment_method = fields.paymentMethod;
    if (fields.memo !== undefined) patch.memo = fields.memo;

    const { data, error } = await client
      .from(ENTRIES_TABLE)
      .update(patch)
      .eq("id", entryId)
      .eq("ledger_id", ledgerId)
      .is("deleted_at", null)
      .select(ENTRY_COLUMNS)
      .maybeSingle();

    if (error) {
      throw new Error(`Failed to update entry: ${error.message}`);
    }
    if (data === null) {
      throw new NotFoundError("明細が見つかりません");
    }

    return toEntry(entryRowSchema.parse(data));
  },

  async softDelete(ledgerId, entryId) {
    const { error } = await client
      .from(ENTRIES_TABLE)
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", entryId)
      .eq("ledger_id", ledgerId)
      .is("deleted_at", null);

    if (error) {
      throw new Error(`Failed to delete entry: ${error.message}`);
    }
  },

  async list(ledgerId, query) {
    const { filters, sort, order, page, perPage } = query;
    const range = resolveDateRange(filters);

    let builder = client
      .from(ENTRIES_TABLE)
      .select(ENTRY_LIST_COLUMNS, { count: "exact" })
      .eq("ledger_id", ledgerId)
      .is("deleted_at", null);

    if (range.from !== undefined) builder = builder.gte("used_on", range.from);
    if (range.to !== undefined) builder = builder.lte("used_on", range.to);
    if (filters.categoryId !== undefined) builder = builder.eq("category_id", filters.categoryId);
    if (filters.minAmount !== undefined) builder = builder.gte("amount", filters.minAmount);
    if (filters.maxAmount !== undefined) builder = builder.lte("amount", filters.maxAmount);
    if (filters.source !== undefined) builder = builder.eq("source", filters.source);

    const keyword = sanitizeKeyword(filters.q);
    if (keyword !== null) {
      builder = builder.or(`description.ilike.*${keyword}*,memo.ilike.*${keyword}*`);
    }

    const sortColumn = sort === "amount" ? "amount" : "used_on";
    const { from, to } = toRange(page, perPage);
    const { data, error, count } = await builder
      .order(sortColumn, { ascending: order === "asc" })
      .range(from, to);

    if (error) {
      throw new Error(`Failed to list entries: ${error.message}`);
    }

    return {
      items: z.array(entryListRowSchema).parse(data).map(toEntryListItem),
      totalCount: count ?? 0,
    };
  },
});
