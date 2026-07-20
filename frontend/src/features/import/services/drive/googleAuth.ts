/**
 * Google サービスアカウント認証（CON-05・アプリ管理の共通Drive）。
 * 依存追加を避け、JWT（RS256）の生成とトークン交換を node:crypto と fetch で行う。
 * GOOGLE_SERVICE_ACCOUNT_KEY にはサービスアカウントの JSON キー全文を設定する。
 */
import { createSign } from "node:crypto";

import { z } from "zod";

import { ExternalServiceError } from "@/shared/errors/appError";
import { getServerEnv } from "@/shared/config/env";

const TOKEN_URL = "https://oauth2.googleapis.com/token";
const DRIVE_SCOPE = "https://www.googleapis.com/auth/drive";
/** 有効期限（Google の上限は3600秒） */
const TOKEN_TTL_SECONDS = 3600;

const serviceAccountSchema = z.object({
  client_email: z.string().min(1),
  private_key: z.string().min(1),
});

const tokenResponseSchema = z.object({
  access_token: z.string().min(1),
  expires_in: z.number(),
});

const base64Url = (input: string | Buffer): string =>
  Buffer.from(input).toString("base64url");

type CachedToken = { accessToken: string; expiresAt: number };
let cachedToken: CachedToken | undefined;

/** アクセストークンを取得する（有効期限内はキャッシュを返す）。 */
export const getDriveAccessToken = async (): Promise<string> => {
  const now = Date.now();
  if (cachedToken !== undefined && now < cachedToken.expiresAt) {
    return cachedToken.accessToken;
  }

  const { GOOGLE_SERVICE_ACCOUNT_KEY } = getServerEnv();
  const parsedKey = serviceAccountSchema.safeParse(JSON.parse(GOOGLE_SERVICE_ACCOUNT_KEY));
  if (!parsedKey.success) {
    throw new ExternalServiceError("Googleサービスアカウントの設定が不正です");
  }
  const { client_email: clientEmail, private_key: privateKey } = parsedKey.data;

  const issuedAt = Math.floor(now / 1000);
  const header = base64Url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claims = base64Url(
    JSON.stringify({
      iss: clientEmail,
      scope: DRIVE_SCOPE,
      aud: TOKEN_URL,
      iat: issuedAt,
      exp: issuedAt + TOKEN_TTL_SECONDS,
    }),
  );
  const signature = createSign("RSA-SHA256")
    .update(`${header}.${claims}`)
    .sign(privateKey, "base64url");
  const assertion = `${header}.${claims}.${signature}`;

  const response = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion,
    }),
  });
  if (!response.ok) {
    throw new ExternalServiceError(`Google認証に失敗しました（status=${response.status}）`);
  }
  const token = tokenResponseSchema.parse(await response.json());
  cachedToken = {
    accessToken: token.access_token,
    // 期限の少し手前で失効させる（境界での失敗を避ける）
    expiresAt: now + (token.expires_in - 60) * 1000,
  };
  return cachedToken.accessToken;
};
