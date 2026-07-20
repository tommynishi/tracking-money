import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AiUnavailableError } from "@/shared/errors/appError";

import { createPdfStatementOcr } from "./pdfStatementOcr";

const okResponse = (rows: unknown[]): Response =>
  new Response(
    JSON.stringify({ choices: [{ message: { content: JSON.stringify({ rows }) } }] }),
    { status: 200 },
  );

const pdfBytes = new TextEncoder().encode("%PDF-1.4 dummy");

describe("createPdfStatementOcr", () => {
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

  it("PDFを添付して明細行を抽出し、抽出順の rowNumber を付ける", async () => {
    vi.mocked(fetch).mockResolvedValue(
      okResponse([
        { usedOn: "2026-06-10", amount: 2200, description: "レストランA" },
        { usedOn: "2026-06-12", amount: -500, description: "返金B" },
      ]),
    );

    const result = await createPdfStatementOcr().parse(pdfBytes, "meisai.pdf");
    expect(result.rows).toEqual([
      { rowNumber: 1, usedOn: "2026-06-10", amount: 2200, description: "レストランA" },
      { rowNumber: 2, usedOn: "2026-06-12", amount: -500, description: "返金B" },
    ]);
    expect(result.errors).toEqual([]);

    const body = JSON.parse(String(vi.mocked(fetch).mock.calls[0][1]?.body)) as {
      messages: { content: { type: string; file?: { file_data: string } }[] }[];
    };
    const fileContent = body.messages[0].content.find((part) => part.type === "file");
    expect(fileContent?.file?.file_data.startsWith("data:application/pdf;base64,")).toBe(true);
  });

  it("APIエラー・不正な抽出結果は AiUnavailableError", async () => {
    vi.mocked(fetch).mockResolvedValue(new Response("overloaded", { status: 503 }));
    await expect(createPdfStatementOcr().parse(pdfBytes, "meisai.pdf")).rejects.toThrow(
      AiUnavailableError,
    );

    vi.mocked(fetch).mockResolvedValue(
      okResponse([{ usedOn: "10/06/2026", amount: 100, description: "形式不正" }]),
    );
    await expect(createPdfStatementOcr().parse(pdfBytes, "meisai.pdf")).rejects.toThrow(
      AiUnavailableError,
    );
  });

  it("OPENAI_API_KEY未設定は AiUnavailableError（fetchは呼ばない）", async () => {
    vi.stubEnv("OPENAI_API_KEY", "");
    vi.resetModules();
    const { createPdfStatementOcr: createFresh } = await import("./pdfStatementOcr");
    await expect(createFresh().parse(pdfBytes, "meisai.pdf")).rejects.toThrow("未設定");
    expect(vi.mocked(fetch)).not.toHaveBeenCalled();
  });
});
