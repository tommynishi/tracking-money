import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AiUnavailableError } from "@/shared/errors/appError";

import { generateInsight } from "./aiInsightClient";

const okResponse = (summary: string, points: string[]): Response =>
  new Response(
    JSON.stringify({ choices: [{ message: { content: JSON.stringify({ summary, points }) } }] }),
    { status: 200 },
  );

describe("generateInsight", () => {
  beforeEach(() => {
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

  it("所見（summary/points）を返す", async () => {
    vi.mocked(fetch).mockResolvedValue(okResponse("要約", ["a", "b"]));
    const result = await generateInsight({ type: "monthly_review", month: "2026-07", summaryJson: "{}" });
    expect(result).toEqual({ summary: "要約", points: ["a", "b"] });
  });

  it("APIエラーは AiUnavailableError", async () => {
    vi.mocked(fetch).mockResolvedValue(new Response("down", { status: 500 }));
    await expect(
      generateInsight({ type: "forecast", month: "2026-07", summaryJson: "{}" }),
    ).rejects.toThrow(AiUnavailableError);
  });

  it("OPENAI_API_KEY未設定は AiUnavailableError（fetchは呼ばない）", async () => {
    vi.stubEnv("OPENAI_API_KEY", "");
    vi.resetModules();
    const { generateInsight: generateFresh } = await import("./aiInsightClient");
    await expect(
      generateFresh({ type: "monthly_review", month: "2026-07", summaryJson: "{}" }),
    ).rejects.toThrow("未設定");
    expect(vi.mocked(fetch)).not.toHaveBeenCalled();
  });
});
