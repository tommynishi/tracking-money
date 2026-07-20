/**
 * OpenAI によるカテゴリ分類（FR-AICAT-01・architecture.md 3.1）。
 * Structured Outputs（json_schema）で候補カテゴリ名の配列を受け取る（AI Rules：構造化データ）。
 * 依存追加を避けるため SDK は使わず fetch で呼び出す。障害時は throw し、
 * 呼び出し側（categorizeRows）がフォールバックする（FR-AICAT-04）。
 */
import { z } from "zod";

import { getServerEnv } from "@/shared/config/env";

import type { AiCategoryClassifier } from "./categorize";

const OPENAI_URL = "https://api.openai.com/v1/chat/completions";
const MODEL = "gpt-4o-mini";
/** 1リクエストで分類する摘要の上限（プロンプト肥大とタイムアウトを避ける） */
const BATCH_SIZE = 50;

const responseSchema = z.object({
  choices: z
    .array(z.object({ message: z.object({ content: z.string() }) }))
    .min(1),
});

const resultSchema = z.object({ categories: z.array(z.string().nullable()) });

const buildPrompt = (
  descriptions: readonly string[],
  categoryNames: readonly string[],
): string =>
  [
    "あなたは家計簿アプリのカテゴリ分類器です。",
    "各利用明細の摘要（店名等）を、次のカテゴリ一覧のいずれかに分類してください。",
    `カテゴリ一覧: ${categoryNames.join(" / ")}`,
    "判定できない場合は null にしてください。",
    "出力は入力と同じ順序・同じ件数の categories 配列で返してください。",
    "摘要一覧:",
    ...descriptions.map((description, index) => `${index + 1}. ${description}`),
  ].join("\n");

const classifyBatch = async (
  apiKey: string,
  descriptions: readonly string[],
  categoryNames: readonly string[],
): Promise<readonly (string | null)[]> => {
  const response = await fetch(OPENAI_URL, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: MODEL,
      temperature: 0,
      messages: [{ role: "user", content: buildPrompt(descriptions, categoryNames) }],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "category_classification",
          strict: true,
          schema: {
            type: "object",
            properties: {
              categories: {
                type: "array",
                items: { type: ["string", "null"] },
              },
            },
            required: ["categories"],
            additionalProperties: false,
          },
        },
      },
    }),
  });
  if (!response.ok) {
    throw new Error(`OpenAI API error: status=${response.status}`);
  }
  const parsed = responseSchema.parse(await response.json());
  const { categories } = resultSchema.parse(JSON.parse(parsed.choices[0].message.content));
  if (categories.length !== descriptions.length) {
    throw new Error("OpenAI API error: 件数が入力と一致しません");
  }
  return categories;
};

/** OpenAI を使う AiCategoryClassifier 実装。 */
export const createOpenAiClassifier = (): AiCategoryClassifier => ({
  async classify(descriptions, categoryNames) {
    const { OPENAI_API_KEY } = getServerEnv();
    if (OPENAI_API_KEY === "") {
      throw new Error("OpenAIは未設定のため利用できません");
    }
    const results: (string | null)[] = [];
    for (let start = 0; start < descriptions.length; start += BATCH_SIZE) {
      const batch = descriptions.slice(start, start + BATCH_SIZE);
      results.push(...(await classifyBatch(OPENAI_API_KEY, batch, categoryNames)));
    }
    return results;
  },
});
