/**
 * カード明細PDFのOCR解析（FR-PDF-01〜03・architecture.md 7.1）。
 * OpenAI のファイル入力（PDF直接添付）＋ Structured Outputs で明細行を抽出する。
 * 失敗時は AiUnavailableError を throw し、呼び出し側が import_files を failed で記録する
 * （api.md 7.1。OCR失敗でもアプリは正常動作させる）。
 */
import { z } from "zod";

import { AiUnavailableError } from "@/shared/errors/appError";
import { getServerEnv } from "@/shared/config/env";

import type { ParseResult } from "../../types";

const OPENAI_URL = "https://api.openai.com/v1/chat/completions";
const MODEL = "gpt-4o-mini";

const responseSchema = z.object({
  choices: z.array(z.object({ message: z.object({ content: z.string() }) })).min(1),
});

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

const resultSchema = z.object({
  rows: z.array(
    z.object({
      usedOn: z.string().regex(DATE_PATTERN),
      amount: z.number().int(),
      description: z.string().min(1),
    }),
  ),
});

const PROMPT = [
  "添付はクレジットカードの利用明細PDFです。",
  "全ての利用明細行を抽出し、rows 配列で返してください。",
  "usedOn は利用日（YYYY-MM-DD）、amount は利用金額（円・整数。返金はマイナス）、",
  "description は利用店名・摘要です。",
  "合計行・繰越行・注記などの明細以外は含めないでください。",
].join("\n");

export type PdfStatementOcr = {
  parse(bytes: Uint8Array, fileName: string): Promise<ParseResult>;
};

/** OpenAI を使う PDF OCR 実装。 */
export const createPdfStatementOcr = (): PdfStatementOcr => ({
  async parse(bytes, fileName) {
    const { OPENAI_API_KEY } = getServerEnv();
    if (OPENAI_API_KEY === "") {
      throw new AiUnavailableError("PDF解析は未設定のため利用できません");
    }
    let response: Response;
    try {
      response = await fetch(OPENAI_URL, {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${OPENAI_API_KEY}` },
        body: JSON.stringify({
          model: MODEL,
          temperature: 0,
          messages: [
            {
              role: "user",
              content: [
                { type: "text", text: PROMPT },
                {
                  type: "file",
                  file: {
                    filename: fileName,
                    file_data: `data:application/pdf;base64,${Buffer.from(bytes).toString("base64")}`,
                  },
                },
              ],
            },
          ],
          response_format: {
            type: "json_schema",
            json_schema: {
              name: "statement_rows",
              strict: true,
              schema: {
                type: "object",
                properties: {
                  rows: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        usedOn: { type: "string" },
                        amount: { type: "integer" },
                        description: { type: "string" },
                      },
                      required: ["usedOn", "amount", "description"],
                      additionalProperties: false,
                    },
                  },
                },
                required: ["rows"],
                additionalProperties: false,
              },
            },
          },
        }),
      });
    } catch {
      throw new AiUnavailableError("PDFの解析サービスへ接続できませんでした");
    }
    if (!response.ok) {
      throw new AiUnavailableError(`PDFの解析に失敗しました（status=${response.status}）`);
    }
    const parsed = responseSchema.safeParse(await response.json());
    if (!parsed.success) {
      throw new AiUnavailableError("PDFの解析結果が不正です");
    }
    const result = resultSchema.safeParse(JSON.parse(parsed.data.choices[0].message.content));
    if (!result.success) {
      throw new AiUnavailableError("PDFの解析結果が不正です");
    }
    return {
      // OCR はページ上の行番号を持たないため、抽出順を rowNumber とする
      rows: result.data.rows.map((row, index) => ({ ...row, rowNumber: index + 1 })),
      errors: [],
    };
  },
});
