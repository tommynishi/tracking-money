/**
 * 分析・ダッシュボードAPI（api.md 9）の認可 Integration Test。
 * AI所見（9.6）は OpenAI をスタブし、集計系（9.1〜9.5）は実DB集計を検証する。
 */
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("@/auth", () => ({ auth: vi.fn() }));

import { GET as getCategories } from "@/app/api/ledgers/[ledgerId]/categories/route";
import { GET as getDashboard } from "@/app/api/ledgers/[ledgerId]/dashboard/route";
import { GET as getInsight } from "@/app/api/ledgers/[ledgerId]/analysis/insight/route";
import { GET as getRanking } from "@/app/api/ledgers/[ledgerId]/analysis/ranking/route";
import { GET as getSubscriptions } from "@/app/api/ledgers/[ledgerId]/analysis/subscriptions/route";
import { GET as getSummary } from "@/app/api/ledgers/[ledgerId]/analysis/summary/route";
import { GET as getTrend } from "@/app/api/ledgers/[ledgerId]/analysis/trend/route";
import { POST as postEntry } from "@/app/api/ledgers/[ledgerId]/entries/route";

import {
  createLedgerAs,
  createTestUser,
  expectErrorCode,
  jsonRequest,
  readData,
  routeContext,
  signInAs,
  signOutSession,
  type TestUser,
} from "./helpers";

describe("分析・ダッシュボードAPI（認可・集計）", () => {
  let owner: TestUser;
  let stranger: TestUser;
  let ledgerId: string;
  let categoryId: string;

  beforeAll(async () => {
    owner = await createTestUser("分析所有者");
    stranger = await createTestUser("分析部外者");
    ledgerId = await createLedgerAs(owner.id, "personal", "分析テスト帳簿");

    signInAs(owner.id);
    const categoriesResponse = await getCategories(
      jsonRequest(`/api/ledgers/${ledgerId}/categories`, "GET"),
      routeContext({ ledgerId }),
    );
    const categories = await readData<{ id: string }[]>(categoriesResponse);
    categoryId = categories[0].id;

    await postEntry(
      jsonRequest(`/api/ledgers/${ledgerId}/entries`, "POST", {
        usedOn: "2026-07-05",
        amount: 1500,
        description: "分析テスト用の買い物",
        categoryId,
      }),
      routeContext({ ledgerId }),
    );
  });

  it("未認証は 401、非メンバーは 403（ダッシュボード・分析各種）", async () => {
    signOutSession();
    await expectErrorCode(
      await getDashboard(jsonRequest(`/api/ledgers/${ledgerId}/dashboard`, "GET"), routeContext({ ledgerId })),
      401,
      "UNAUTHENTICATED",
    );

    signInAs(stranger.id);
    await expectErrorCode(
      await getDashboard(jsonRequest(`/api/ledgers/${ledgerId}/dashboard`, "GET"), routeContext({ ledgerId })),
      403,
      "FORBIDDEN",
    );
    await expectErrorCode(
      await getSummary(jsonRequest(`/api/ledgers/${ledgerId}/analysis/summary`, "GET"), routeContext({ ledgerId })),
      403,
      "FORBIDDEN",
    );
    await expectErrorCode(
      await getTrend(jsonRequest(`/api/ledgers/${ledgerId}/analysis/trend`, "GET"), routeContext({ ledgerId })),
      403,
      "FORBIDDEN",
    );
    await expectErrorCode(
      await getRanking(jsonRequest(`/api/ledgers/${ledgerId}/analysis/ranking`, "GET"), routeContext({ ledgerId })),
      403,
      "FORBIDDEN",
    );
    await expectErrorCode(
      await getSubscriptions(
        jsonRequest(`/api/ledgers/${ledgerId}/analysis/subscriptions`, "GET"),
        routeContext({ ledgerId }),
      ),
      403,
      "FORBIDDEN",
    );
    await expectErrorCode(
      await getInsight(
        jsonRequest(`/api/ledgers/${ledgerId}/analysis/insight?type=monthly_review&month=2026-07`, "GET"),
        routeContext({ ledgerId }),
      ),
      403,
      "FORBIDDEN",
    );
  });

  it("ダッシュボードは今月の合計・カテゴリ別内訳・直近明細を返す（FR-DASH-01）", async () => {
    signInAs(owner.id);
    const response = await getDashboard(
      jsonRequest(`/api/ledgers/${ledgerId}/dashboard?month=2026-07`, "GET"),
      routeContext({ ledgerId }),
    );
    const data = await readData<{
      totalAmount: number;
      byCategory: { categoryId: string; amount: number }[];
      recentEntries: { description: string }[];
    }>(response);

    expect(data.totalAmount).toBe(1500);
    expect(data.byCategory.find((c) => c.categoryId === categoryId)?.amount).toBe(1500);
    expect(data.recentEntries.some((e) => e.description === "分析テスト用の買い物")).toBe(true);
  });

  it("推移APIは指定月数分の月次合計を古い順で返す", async () => {
    signInAs(owner.id);
    const response = await getTrend(
      jsonRequest(`/api/ledgers/${ledgerId}/analysis/trend?month=2026-07&months=2`, "GET"),
      routeContext({ ledgerId }),
    );
    const data = await readData<{ month: string; amount: number }[]>(response);
    expect(data).toEqual([
      { month: "2026-06", amount: 0 },
      { month: "2026-07", amount: 1500 },
    ]);
  });

  it("ランキングAPIは金額の大きい順に返す", async () => {
    signInAs(owner.id);
    const response = await getRanking(
      jsonRequest(`/api/ledgers/${ledgerId}/analysis/ranking?month=2026-07`, "GET"),
      routeContext({ ledgerId }),
    );
    const data = await readData<{ amount: number }[]>(response);
    expect(data[0].amount).toBe(1500);
  });

  describe("AI所見（OpenAIスタブ）", () => {
    const originalFetch = globalThis.fetch;

    afterEach(() => {
      vi.unstubAllGlobals();
    });

    it("集計結果をもとに所見を生成しキャッシュする（FR-AI-01・NFR-13）", async () => {
      let openAiCallCount = 0;
      vi.stubGlobal(
        "fetch",
        ((input: RequestInfo | URL, init?: RequestInit) => {
          const url = String(input);
          if (url.includes("openai.com")) {
            openAiCallCount += 1;
            return Promise.resolve(
              new Response(
                JSON.stringify({
                  choices: [{ message: { content: JSON.stringify({ summary: "要約", points: ["a"] }) } }],
                }),
                { status: 200 },
              ),
            );
          }
          return originalFetch(input, init);
        }) as typeof fetch,
      );

      signInAs(owner.id);
      const first = await getInsight(
        jsonRequest(`/api/ledgers/${ledgerId}/analysis/insight?type=monthly_review&month=2026-07`, "GET"),
        routeContext({ ledgerId }),
      );
      expect(first.status).toBe(200);
      expect(openAiCallCount).toBe(1);

      const second = await getInsight(
        jsonRequest(`/api/ledgers/${ledgerId}/analysis/insight?type=monthly_review&month=2026-07`, "GET"),
        routeContext({ ledgerId }),
      );
      expect(second.status).toBe(200);
      // 入力（集計結果）が変わらないためキャッシュを再利用し、OpenAIを再度呼ばない
      expect(openAiCallCount).toBe(1);
    });

    it("AI障害時は 502 AI_UNAVAILABLE（FR-AI-11：集計系には影響しない）", async () => {
      vi.stubGlobal(
        "fetch",
        ((input: RequestInfo | URL, init?: RequestInit) => {
          const url = String(input);
          if (url.includes("openai.com")) {
            return Promise.resolve(new Response("down", { status: 500 }));
          }
          return originalFetch(input, init);
        }) as typeof fetch,
      );

      signInAs(owner.id);
      const response = await getInsight(
        jsonRequest(`/api/ledgers/${ledgerId}/analysis/insight?type=forecast&month=2026-07`, "GET"),
        routeContext({ ledgerId }),
      );
      await expectErrorCode(response, 502, "AI_UNAVAILABLE");

      const summaryResponse = await getSummary(
        jsonRequest(`/api/ledgers/${ledgerId}/analysis/summary?month=2026-07`, "GET"),
        routeContext({ ledgerId }),
      );
      expect(summaryResponse.status).toBe(200);
    });
  });
});
