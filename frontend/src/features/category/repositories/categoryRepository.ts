/**
 * categories への DB アクセス（Repository 層）。DB行⇔ドメイン型の変換を担い、業務判断は持たない。
 * 認可（ledger_members 検証）は Route Handler、業務ルール（is_system 保護等）は Service の責務。
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

import { ConflictError, NotFoundError } from "@/shared/errors/appError";
import { isUniqueViolation } from "@/shared/lib/dbErrorCodes";

import type { Category } from "../types";

const CATEGORIES_TABLE = "categories";
const CATEGORY_COLUMNS =
  "id, ledger_id, name, is_fixed_cost, is_system, sort_order, created_at, updated_at";
const DELETE_CATEGORY_RPC = "delete_category_with_reassign";
const REORDER_CATEGORIES_RPC = "reorder_categories";

const categoryRowSchema = z.object({
  id: z.string(),
  ledger_id: z.string(),
  name: z.string(),
  is_fixed_cost: z.boolean(),
  is_system: z.boolean(),
  sort_order: z.number(),
  created_at: z.string(),
  updated_at: z.string(),
});

const sortOrderRowSchema = z.object({ sort_order: z.number() });
const idRowSchema = z.object({ id: z.string() });

const toCategory = (row: z.infer<typeof categoryRowSchema>): Category => ({
  id: row.id,
  ledgerId: row.ledger_id,
  name: row.name,
  isFixedCost: row.is_fixed_cost,
  isSystem: row.is_system,
  sortOrder: row.sort_order,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

const DUPLICATE_NAME_MESSAGE = "同名のカテゴリが既に存在します";

export type CreateCategoryInput = {
  readonly ledgerId: string;
  readonly name: string;
  readonly isFixedCost: boolean;
};

export type UpdateCategoryFields = {
  readonly name?: string;
  readonly isFixedCost?: boolean;
};

export type CategoryRepository = {
  /** 家計簿のカテゴリを sort_order 昇順で取得する（api.md 5.1）。 */
  listByLedger(ledgerId: string): Promise<Category[]>;
  /** 家計簿スコープで有効なカテゴリを1件取得する。存在しなければ null。 */
  getById(ledgerId: string, categoryId: string): Promise<Category | null>;
  /** カテゴリを末尾（最大 sort_order + 1）へ追加する。名称重複は ConflictError。 */
  create(input: CreateCategoryInput): Promise<Category>;
  /** 指定フィールドのみ更新する。対象が無ければ NotFoundError、名称重複は ConflictError。 */
  updateFields(
    ledgerId: string,
    categoryId: string,
    fields: UpdateCategoryFields,
  ): Promise<Category>;
  /** システムカテゴリ（その他）の id を返す。削除時の既定付け替え先に使う。 */
  findSystemCategoryId(ledgerId: string): Promise<string | null>;
  /** 家計簿の有効カテゴリ id 一覧（並び替えの全件一致検証に使う）。 */
  listActiveIds(ledgerId: string): Promise<string[]>;
  /** 使用中明細を付け替えてからカテゴリを論理削除する（RPC・原子的）。 */
  deleteWithReassign(ledgerId: string, categoryId: string, reassignTo: string): Promise<void>;
  /** カテゴリの表示順を配列順で再設定する（RPC・原子的）。 */
  reorder(ledgerId: string, categoryIds: readonly string[]): Promise<void>;
};

export const createCategoryRepository = (client: SupabaseClient): CategoryRepository => ({
  async listByLedger(ledgerId) {
    const { data, error } = await client
      .from(CATEGORIES_TABLE)
      .select(CATEGORY_COLUMNS)
      .eq("ledger_id", ledgerId)
      .is("deleted_at", null)
      .order("sort_order", { ascending: true });

    if (error) {
      throw new Error(`Failed to list categories: ${error.message}`);
    }

    return z.array(categoryRowSchema).parse(data).map(toCategory);
  },

  async getById(ledgerId, categoryId) {
    const { data, error } = await client
      .from(CATEGORIES_TABLE)
      .select(CATEGORY_COLUMNS)
      .eq("id", categoryId)
      .eq("ledger_id", ledgerId)
      .is("deleted_at", null)
      .maybeSingle();

    if (error) {
      throw new Error(`Failed to get category: ${error.message}`);
    }

    return data === null ? null : toCategory(categoryRowSchema.parse(data));
  },

  async create({ ledgerId, name, isFixedCost }) {
    // 末尾へ追加するため現在の最大 sort_order を取得する
    const { data: maxData, error: maxError } = await client
      .from(CATEGORIES_TABLE)
      .select("sort_order")
      .eq("ledger_id", ledgerId)
      .is("deleted_at", null)
      .order("sort_order", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (maxError) {
      throw new Error(`Failed to resolve sort order: ${maxError.message}`);
    }
    const nextSortOrder = maxData === null ? 0 : sortOrderRowSchema.parse(maxData).sort_order + 1;

    const { data, error } = await client
      .from(CATEGORIES_TABLE)
      .insert({
        ledger_id: ledgerId,
        name,
        is_fixed_cost: isFixedCost,
        is_system: false,
        sort_order: nextSortOrder,
      })
      .select(CATEGORY_COLUMNS)
      .single();

    if (error) {
      if (isUniqueViolation(error)) {
        throw new ConflictError(DUPLICATE_NAME_MESSAGE);
      }
      throw new Error(`Failed to create category: ${error.message}`);
    }

    return toCategory(categoryRowSchema.parse(data));
  },

  async updateFields(ledgerId, categoryId, fields) {
    const patch: Record<string, string | boolean> = {};
    if (fields.name !== undefined) patch.name = fields.name;
    if (fields.isFixedCost !== undefined) patch.is_fixed_cost = fields.isFixedCost;

    const { data, error } = await client
      .from(CATEGORIES_TABLE)
      .update(patch)
      .eq("id", categoryId)
      .eq("ledger_id", ledgerId)
      .is("deleted_at", null)
      .select(CATEGORY_COLUMNS)
      .maybeSingle();

    if (error) {
      if (isUniqueViolation(error)) {
        throw new ConflictError(DUPLICATE_NAME_MESSAGE);
      }
      throw new Error(`Failed to update category: ${error.message}`);
    }
    if (data === null) {
      throw new NotFoundError("カテゴリが見つかりません");
    }

    return toCategory(categoryRowSchema.parse(data));
  },

  async findSystemCategoryId(ledgerId) {
    const { data, error } = await client
      .from(CATEGORIES_TABLE)
      .select("id")
      .eq("ledger_id", ledgerId)
      .eq("is_system", true)
      .is("deleted_at", null)
      .limit(1)
      .maybeSingle();

    if (error) {
      throw new Error(`Failed to find system category: ${error.message}`);
    }

    return data === null ? null : idRowSchema.parse(data).id;
  },

  async listActiveIds(ledgerId) {
    const { data, error } = await client
      .from(CATEGORIES_TABLE)
      .select("id")
      .eq("ledger_id", ledgerId)
      .is("deleted_at", null);

    if (error) {
      throw new Error(`Failed to list category ids: ${error.message}`);
    }

    return z
      .array(idRowSchema)
      .parse(data)
      .map((row) => row.id);
  },

  async deleteWithReassign(ledgerId, categoryId, reassignTo) {
    const { error } = await client.rpc(DELETE_CATEGORY_RPC, {
      p_ledger_id: ledgerId,
      p_category_id: categoryId,
      p_reassign_to: reassignTo,
    });

    if (error) {
      throw new Error(`Failed to delete category: ${error.message}`);
    }
  },

  async reorder(ledgerId, categoryIds) {
    const { error } = await client.rpc(REORDER_CATEGORIES_RPC, {
      p_ledger_id: ledgerId,
      p_category_ids: categoryIds,
    });

    if (error) {
      throw new Error(`Failed to reorder categories: ${error.message}`);
    }
  },
});
