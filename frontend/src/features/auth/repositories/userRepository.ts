/**
 * users への DB アクセス（Repository 層）。DB行⇔ドメイン型の変換を担い、業務判断は持たない。
 * 初回作成の判断（FR-AUTH-03）・表示名の検証（FR-AUTH-04）は Service 層の責務。
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

import { ConflictError, NotFoundError } from "@/shared/errors/appError";
import { isUniqueViolation } from "@/shared/lib/dbErrorCodes";

import type { User } from "../types";

const USERS_TABLE = "users";
const USER_COLUMNS = "id, line_user_id, display_name, avatar_url, created_at, updated_at";

const userRowSchema = z.object({
  id: z.string(),
  line_user_id: z.string(),
  display_name: z.string(),
  avatar_url: z.string().nullable(),
  created_at: z.string(),
  updated_at: z.string(),
});

const toUser = (row: z.infer<typeof userRowSchema>): User => ({
  id: row.id,
  lineUserId: row.line_user_id,
  displayName: row.display_name,
  avatarUrl: row.avatar_url,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

export type CreateUserInput = {
  readonly lineUserId: string;
  readonly displayName: string;
  readonly avatarUrl: string | null;
};

export type UserRepository = {
  /** LINE ユーザーIDで有効なユーザーを1件取得する。存在しなければ null。 */
  findByLineUserId(lineUserId: string): Promise<User | null>;
  /** ユーザーIDで有効なユーザーを1件取得する。存在しなければ null。 */
  getById(userId: string): Promise<User | null>;
  /** ユーザーを作成する。同一 LINE ユーザーの同時作成（unique 違反）は ConflictError。 */
  create(input: CreateUserInput): Promise<User>;
  /** 表示名を更新する。対象が存在しなければ NotFoundError。 */
  updateDisplayName(userId: string, displayName: string): Promise<User>;
};

export const createUserRepository = (client: SupabaseClient): UserRepository => ({
  async findByLineUserId(lineUserId) {
    const { data, error } = await client
      .from(USERS_TABLE)
      .select(USER_COLUMNS)
      .eq("line_user_id", lineUserId)
      .is("deleted_at", null)
      .maybeSingle();

    if (error) {
      throw new Error(`Failed to find user by LINE user id: ${error.message}`);
    }

    return data === null ? null : toUser(userRowSchema.parse(data));
  },

  async getById(userId) {
    const { data, error } = await client
      .from(USERS_TABLE)
      .select(USER_COLUMNS)
      .eq("id", userId)
      .is("deleted_at", null)
      .maybeSingle();

    if (error) {
      throw new Error(`Failed to get user: ${error.message}`);
    }

    return data === null ? null : toUser(userRowSchema.parse(data));
  },

  async create({ lineUserId, displayName, avatarUrl }) {
    const { data, error } = await client
      .from(USERS_TABLE)
      .insert({ line_user_id: lineUserId, display_name: displayName, avatar_url: avatarUrl })
      .select(USER_COLUMNS)
      .single();

    if (error) {
      if (isUniqueViolation(error)) {
        throw new ConflictError("このユーザーは既に登録されています");
      }
      throw new Error(`Failed to create user: ${error.message}`);
    }

    return toUser(userRowSchema.parse(data));
  },

  async updateDisplayName(userId, displayName) {
    const { data, error } = await client
      .from(USERS_TABLE)
      .update({ display_name: displayName })
      .eq("id", userId)
      .is("deleted_at", null)
      .select(USER_COLUMNS)
      .maybeSingle();

    if (error) {
      throw new Error(`Failed to update display name: ${error.message}`);
    }
    if (data === null) {
      throw new NotFoundError("ユーザーが見つかりません");
    }

    return toUser(userRowSchema.parse(data));
  },
});
