import { generateKeyPairSync } from "node:crypto";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { privateKey } = generateKeyPairSync("rsa", {
  modulusLength: 2048,
  privateKeyEncoding: { type: "pkcs8", format: "pem" },
  publicKeyEncoding: { type: "spki", format: "pem" },
});

const serviceAccountJson = JSON.stringify({
  client_email: "svc@test.iam.gserviceaccount.com",
  private_key: privateKey,
});

const tokenResponse = (accessToken: string): Response =>
  new Response(JSON.stringify({ access_token: accessToken, expires_in: 3600 }), { status: 200 });

/** getServerEnv がモジュール内でキャッシュされるため、テストごとに読み直す。 */
const loadGoogleAuth = async (): Promise<typeof import("./googleAuth")> => {
  vi.resetModules();
  return import("./googleAuth");
};

describe("getDriveAccessToken", () => {
  beforeEach(() => {
    for (const key of [
      "SUPABASE_SERVICE_ROLE_KEY",
      "AUTH_SECRET",
      "LINE_CHANNEL_ID",
      "LINE_CHANNEL_SECRET",
      "LINE_MESSAGING_CHANNEL_ACCESS_TOKEN",
      "OPENAI_API_KEY",
      "GOOGLE_DRIVE_ROOT_FOLDER_ID",
      "CRON_SECRET",
    ]) {
      vi.stubEnv(key, "test-value");
    }
    vi.stubEnv("GOOGLE_SERVICE_ACCOUNT_KEY", serviceAccountJson);
    vi.stubGlobal("fetch", vi.fn());
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("JWT署名付きでトークンを取得し、有効期限内はキャッシュする", async () => {
    vi.mocked(fetch).mockResolvedValue(tokenResponse("token-1"));
    const { getDriveAccessToken } = await loadGoogleAuth();

    await expect(getDriveAccessToken()).resolves.toBe("token-1");
    await expect(getDriveAccessToken()).resolves.toBe("token-1");
    expect(vi.mocked(fetch)).toHaveBeenCalledTimes(1);

    const body = vi.mocked(fetch).mock.calls[0][1]?.body as URLSearchParams;
    expect(body.get("grant_type")).toBe("urn:ietf:params:oauth:grant-type:jwt-bearer");
    // JWT は header.claims.signature の3パート
    expect(body.get("assertion")?.split(".")).toHaveLength(3);
  });

  it("トークン交換失敗は ExternalServiceError", async () => {
    vi.mocked(fetch).mockResolvedValue(new Response("bad", { status: 401 }));
    const { getDriveAccessToken } = await loadGoogleAuth();
    await expect(getDriveAccessToken()).rejects.toThrow("Google認証に失敗しました");
  });

  it("サービスアカウントJSONが不正なら ExternalServiceError", async () => {
    vi.stubEnv("GOOGLE_SERVICE_ACCOUNT_KEY", JSON.stringify({ foo: "bar" }));
    const { getDriveAccessToken } = await loadGoogleAuth();
    await expect(getDriveAccessToken()).rejects.toThrow("設定が不正");
  });

  it("Drive未設定（GOOGLE_SERVICE_ACCOUNT_KEY未設定）は ExternalServiceError", async () => {
    vi.stubEnv("GOOGLE_SERVICE_ACCOUNT_KEY", "");
    const { getDriveAccessToken } = await loadGoogleAuth();
    await expect(getDriveAccessToken()).rejects.toThrow("未設定のため利用できません");
  });
});
