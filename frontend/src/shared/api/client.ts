/**
 * クライアント側の API 呼び出し（api.md 1.3 のレスポンス形式を解釈する薄い fetch ラッパー）。
 * 成功は { data, meta? } を返し、エラーは ApiError を throw する（エラーは握りつぶさない）。
 */
import type { ErrorDetail } from "@/shared/errors/appError";

import type { ListMeta } from "./response";

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details?: readonly ErrorDetail[];

  constructor(status: number, code: string, message: string, details?: readonly ErrorDetail[]) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export type ApiResult<T> = {
  readonly data: T;
  readonly meta?: ListMeta;
};

const errorBodySchemaGuard = (
  body: unknown,
): body is { error: { code: string; message: string; details?: ErrorDetail[] } } =>
  typeof body === "object" && body !== null && "error" in body;

/** 認証は HttpOnly Cookie（同一オリジン）。302 で /login へ飛ばず 401 を検出できるようにする。 */
export const apiFetch = async <T>(path: string, init?: RequestInit): Promise<ApiResult<T>> => {
  const response = await fetch(path, {
    ...init,
    headers: { "Content-Type": "application/json", ...init?.headers },
  });

  if (response.status === 204) {
    return { data: undefined as T };
  }

  const body: unknown = await response.json();
  if (!response.ok) {
    if (errorBodySchemaGuard(body)) {
      throw new ApiError(response.status, body.error.code, body.error.message, body.error.details);
    }
    throw new ApiError(response.status, "INTERNAL_ERROR", "サーバーでエラーが発生しました");
  }

  return body as ApiResult<T>;
};

export const isApiError = (value: unknown): value is ApiError => value instanceof ApiError;
