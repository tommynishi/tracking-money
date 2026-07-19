/**
 * 業務エラーの基底クラスとサブタイプ。
 * Service 層は AppError を throw し、Route Handler が HTTP ステータスへ変換する
 * （docs/architecture.md 10.1 / docs/coding-rules.md 7 / docs/api.md 1.2〜1.3）。
 */

export type AppErrorCode =
  | "UNAUTHENTICATED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "VALIDATION_ERROR"
  | "CONFLICT"
  | "EXTERNAL_SERVICE_ERROR"
  | "AI_UNAVAILABLE";

/** エラー詳細（api.md 1.3 の details 要素）。field はバリデーション対象項目。 */
export type ErrorDetail = {
  readonly field?: string;
  readonly code?: string;
  readonly message: string;
};

export abstract class AppError extends Error {
  abstract readonly code: AppErrorCode;
  abstract readonly status: number;
  readonly details?: readonly ErrorDetail[];

  constructor(message: string, details?: readonly ErrorDetail[]) {
    super(message);
    // Error を継承する際に name をクラス名へ揃える（スタック・ログ識別のため）
    this.name = new.target.name;
    this.details = details;
  }
}

/** 未認証（401）。 */
export class UnauthenticatedError extends AppError {
  readonly code = "UNAUTHENTICATED" as const;
  readonly status = 401;
}

/** 認可エラー（403）。他人の帳簿へのアクセス等。 */
export class ForbiddenError extends AppError {
  readonly code = "FORBIDDEN" as const;
  readonly status = 403;
}

/** リソースが存在しない（404）。論理削除済みを含む。 */
export class NotFoundError extends AppError {
  readonly code = "NOT_FOUND" as const;
  readonly status = 404;
}

/** 入力不正（400）。 */
export class ValidationError extends AppError {
  readonly code = "VALIDATION_ERROR" as const;
  readonly status = 400;
}

/**
 * 業務ルール衝突（409）。
 * 詳細コード（FAMILY_LEDGER_EXISTS / ALREADY_FAMILY_MEMBER / DUPLICATE_FILE 等・api.md 1.3）を
 * details に含める。
 */
export class ConflictError extends AppError {
  readonly code = "CONFLICT" as const;
  readonly status = 409;
}

/** 外部サービス障害（502）。OpenAI / LINE / Drive。 */
export class ExternalServiceError extends AppError {
  readonly code = "EXTERNAL_SERVICE_ERROR" as const;
  readonly status = 502;
}

/** AI機能のみ利用不可（502）。非AI機能は正常（api.md 1.3 / FR-AI-11）。 */
export class AiUnavailableError extends AppError {
  readonly code = "AI_UNAVAILABLE" as const;
  readonly status = 502;
}

/** unknown を AppError かどうかで絞り込む型ガード（catch 節での分岐に使用）。 */
export const isAppError = (value: unknown): value is AppError => value instanceof AppError;
