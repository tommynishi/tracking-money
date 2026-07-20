/**
 * OpenAI によるAI所見生成（api.md 9.6・FR-AI-01/06/08/09・AI Rules：構造化データ）。
 * 依存追加を避け SDK は使わず fetch で呼び出す。障害時は AiUnavailableError（FR-AI-11：非AI機能は影響しない）。
 */
import { z } from "zod";

import { AiUnavailableError } from "@/shared/errors/appError";
import { getServerEnv } from "@/shared/config/env";

import type { InsightType } from "../types";

const OPENAI_URL = "https://api.openai.com/v1/chat/completions";
const MODEL = "gpt-4o-mini";

const resultSchema = z.object({
  summary: z.string(),
  points: z.array(z.string()),
});

export type InsightResult = z.infer<typeof resultSchema>;

export type InsightInput = {
  readonly type: InsightType;
  readonly month: string;
  /** 集計済みデータのJSON文字列（明細個別の内容は含めない・NFR-05）。 */
  readonly summaryJson: string;
};

const PROMPT_BY_TYPE: Record<InsightType, string> = {
  monthly_review: "今月の支出について、カテゴリ別内訳・前月比・前年同月比を踏まえた所見を述べてください。",
  fixed_cost: "固定費カテゴリの支出について、金額の妥当性や見直し余地の所見を述べてください。",
  saving_advice: "支出傾向を踏まえ、具体的で実行しやすい節約案を提案してください。",
  forecast: "過去の月次実績を踏まえ、来月の支出予測とその根拠を述べてください。",
};

const buildPrompt = (input: InsightInput): string =>
  [
    "あなたは家計簿アプリのAIアドバイザーです。日本語で簡潔に回答してください。",
    PROMPT_BY_TYPE[input.type],
    `対象月: ${input.month}`,
    "集計データ（JSON）:",
    input.summaryJson,
    "summary は1〜2文の要約、points は箇条書きの要点（3件程度）としてください。",
  ].join("\n");

/** OpenAI を呼び出し所見を生成する。失敗時は AiUnavailableError（FR-AI-11）。 */
export const generateInsight = async (input: InsightInput): Promise<InsightResult> => {
  const { OPENAI_API_KEY } = getServerEnv();
  if (OPENAI_API_KEY === "") {
    throw new AiUnavailableError("AI所見は未設定のため利用できません");
  }
  let response: Response;
  try {
    response = await fetch(OPENAI_URL, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${OPENAI_API_KEY}` },
      body: JSON.stringify({
        model: MODEL,
        temperature: 0.3,
        messages: [{ role: "user", content: buildPrompt(input) }],
        response_format: {
          type: "json_schema",
          json_schema: {
            name: "insight",
            strict: true,
            schema: {
              type: "object",
              properties: {
                summary: { type: "string" },
                points: { type: "array", items: { type: "string" } },
              },
              required: ["summary", "points"],
              additionalProperties: false,
            },
          },
        },
      }),
    });
  } catch {
    throw new AiUnavailableError("AI所見の取得に失敗しました");
  }
  if (!response.ok) {
    throw new AiUnavailableError(`AI所見の取得に失敗しました（status=${response.status}）`);
  }

  try {
    const body = z
      .object({ choices: z.array(z.object({ message: z.object({ content: z.string() }) })).min(1) })
      .parse(await response.json());
    return resultSchema.parse(JSON.parse(body.choices[0].message.content));
  } catch {
    throw new AiUnavailableError("AI所見の解析に失敗しました");
  }
};
