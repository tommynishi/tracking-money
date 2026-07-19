/**
 * Postgres / PostgREST エラーコードの共通定義と判定（Repository 層用）。
 * 各 Repository はここの判定を使って DB エラーを AppError へ変換する（マッピングの一元管理）。
 */
import type { PostgrestError } from "@supabase/supabase-js";

/** 一意制約違反。 */
export const UNIQUE_VIOLATION_CODE = "23505";
/** 外部キー違反。 */
export const FOREIGN_KEY_VIOLATION_CODE = "23503";
/** plpgsql の raise exception 既定コード（RPC の業務ルール違反）。 */
export const RAISE_EXCEPTION_CODE = "P0001";
/** 家族家計簿の二重所属（FR-LEDGER-05・マイグレーション 20260710000100 の独自コード）。 */
export const FAMILY_MEMBERSHIP_CONFLICT_CODE = "FML01";

export const hasErrorCode = (error: PostgrestError, code: string): boolean => error.code === code;

export const isUniqueViolation = (error: PostgrestError): boolean =>
  hasErrorCode(error, UNIQUE_VIOLATION_CODE);
