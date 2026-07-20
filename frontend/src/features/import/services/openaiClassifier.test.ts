import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createOpenAiClassifier } from "./openaiClassifier";

const okResponse = (categories: (string | null)[]): Response =>
  new Response(
    JSON.stringify({ choices: [{ message: { content: JSON.stringify({ categories }) } }] }),
    { status: 200 },
  );

describe("createOpenAiClassifier", () => {
  beforeEach(() => {
    // getServerEnv は全サーバー変数を検証するためダミーで揃える
    for (const key of [
      "SUPABASE_SERVICE_ROLE_KEY",
      "AUTH_SECRET",
      "LINE_CHANNEL_ID",
      "LINE_CHANNEL_SECRET",
      "LINE_MESSAGING_CHANNEL_ACCESS_TOKEN",
      "OPENAI_API_KEY",
      "GOOGLE_SERVICE_ACCOUNT_KEY",
      "GOOGLE_DRIVE_ROOT_FOLDER_ID",
      "CRON_SECRET",
    ]) {
      vi.stubEnv(key, "test-value");
    }
    vi.stubGlobal("fetch", vi.fn());
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("分類結果を入力順で返す", async () => {
    vi.mocked(fetch).mockResolvedValue(okResponse(["食費", null]));
    const classifier = createOpenAiClassifier();
    await expect(classifier.classify(["すき家", "不明店"], ["食費", "その他"])).resolves.toEqual([
      "食費",
      null,
    ]);
    const body = JSON.parse(String(vi.mocked(fetch).mock.calls[0][1]?.body)) as {
      model: string;
      response_format: { type: string };
    };
    expect(body.response_format.type).toBe("json_schema");
  });

  it("APIエラー時は throw する（フォールバックは呼び出し側の責務）", async () => {
    vi.mocked(fetch).mockResolvedValue(new Response("rate limited", { status: 429 }));
    const classifier = createOpenAiClassifier();
    await expect(classifier.classify(["店A"], ["食費"])).rejects.toThrow("status=429");
  });

  it("件数不一致は throw する", async () => {
    vi.mocked(fetch).mockResolvedValue(okResponse(["食費", "食費"]));
    const classifier = createOpenAiClassifier();
    await expect(classifier.classify(["店A"], ["食費"])).rejects.toThrow("件数");
  });

  it("50件を超える摘要はバッチ分割して問い合わせる", async () => {
    const first = Array.from({ length: 50 }, () => "食費");
    vi.mocked(fetch)
      .mockResolvedValueOnce(okResponse(first))
      .mockResolvedValueOnce(okResponse(["その他"]));
    const classifier = createOpenAiClassifier();
    const descriptions = Array.from({ length: 51 }, (_, i) => `店${i}`);
    const results = await classifier.classify(descriptions, ["食費", "その他"]);
    expect(results).toHaveLength(51);
    expect(results[50]).toBe("その他");
    expect(vi.mocked(fetch)).toHaveBeenCalledTimes(2);
  });
});
