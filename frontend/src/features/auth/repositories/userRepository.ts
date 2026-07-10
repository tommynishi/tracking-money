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

/** 検索結果に返してよいユーザー情報（LINE ID は含めない・api.md 2.3）。 */
export type UserSearchResult = {
  readonly id: string;
  readonly displayName: string;
  readonly avatarUrl: string | null;
};

/** ILIKE パターンとして解釈される文字をエスケープする（キーワードはリテラル扱い）。 */
const escapeLikePattern = (keyword: string): string => keyword.replace(/[\\%_]/g, "\\$&");

/** PostgREST の filter 区切り文字を除去する（クエリ構造の破壊防止）。 */
const sanitizeKeyword = (keyword: string): string => keyword.replace(/[,()*]/g, "");

export type UserRepository = {
  /** LINE ユーザーIDで有効なユーザーを1件取得する。存在しなければ null。 */
  findByLineUserId(lineUserId: string): Promise<User | null>;
  /** ユーザーIDで有効なユーザーを1件取得する。存在しなければ null。 */
  getById(userId: string): Promise<User | null>;
  /** ユーザーを作成する。同一 LINE ユーザーの同時作成（unique 違反）は ConflictError。 */
  create(input: CreateUserInput): Promise<User>;
  /** 表示名を更新する。対象が存在しなければ NotFoundError。 */
  updateDisplayName(userId: string, displayName: string): Promise<User>;
  /** 表示名の部分一致でユーザーを検索する（表示名昇順・最大 limit 件・api.md 2.3）。 */
  searchByDisplayName(keyword: string, limit: number): Promise<UserSearchResult[]>;
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

  async searchByDisplayName(keyword, limit) {
    const sanitized = sanitizeKeyword(keyword);
    if (sanitized === "") {
      return [];
    }

    const { data, error } = await client
      .from(USERS_TABLE)
      .select("id, display_name, avatar_url")
      .ilike("display_name", `%${escapeLikePattern(sanitized)}%`)
      .is("deleted_at", null)
      .order("display_name", { ascending: true })
      .limit(limit);

    if (error) {
      throw new Error(`Failed to search users: ${error.message}`);
    }

    const rowSchema = z.object({
      id: z.string(),
      display_name: z.string(),
      avatar_url: z.string().nullable(),
    });
    return z
      .array(rowSchema)
      .parse(data)
      .map((row) => ({
        id: row.id,
        displayName: row.display_name,
        avatarUrl: row.avatar_url,
      }));
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
