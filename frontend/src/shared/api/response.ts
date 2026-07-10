/**
 * Route Handler の共通レスポンス組み立て（api.md 1.2〜1.3）。
 * 成功は { data }（一覧は { data, meta }）、エラーは { error: { code, message, details } }。
 * AppError → HTTP ステータスの変換をここへ集約し、各 Route Handler は handleApiError に委譲する。
 */
import { ZodError } from "zod";

import { isAppError, type ErrorDetail } from "@/shared/errors/appError";

export type ListMeta = {
  readonly page: number;
  readonly perPage: number;
  readonly totalCount: number;
  readonly totalPages: number;
};

/** 成功レスポンス（api.md 1.3）。作成時は status: 201 を指定する。 */
export const jsonData = (data: unknown, init?: { status?: number; meta?: ListMeta }): Response =>
  Response.json(
    init?.meta === undefined ? { data } : { data, meta: init.meta },
    { status: init?.status ?? 200 },
  );

/** 削除成功（204・ボディなし・api.md 1.2）。 */
export const noContent = (): Response => new Response(null, { status: 204 });

const jsonError = (
  status: number,
  code: string,
  message: string,
  details?: readonly ErrorDetail[],
): Response =>
  Response.json(
    { error: details === undefined ? { code, message } : { code, message, details } },
    { status },
  );

const toValidationDetails = (error: ZodError): ErrorDetail[] =>
  error.issues.map((issue) => ({
    field: issue.path.join(".") || undefined,
    message: issue.message,
  }));

/**
 * Route Handler の catch 節で例外を HTTP レスポンスへ変換する。
 * AppError はステータス・コードどおり、ZodError は 400、その他は原因をログへ残して 500
 * （メッセージに個人情報を含み得るためレスポンスへは返さない・NFR-05）。
 */
export const handleApiError = (error: unknown): Response => {
  if (isAppError(error)) {
    return jsonError(error.status, error.code, error.message, error.details);
  }
  if (error instanceof ZodError) {
    return jsonError(400, "VALIDATION_ERROR", "入力内容が不正です", toValidationDetails(error));
  }
  console.error("Unhandled API error:", error);
  return jsonError(500, "INTERNAL_ERROR", "サーバー内部でエラーが発生しました");
};
