/**
 * インポートAPI（api.md 7〜8）の認可・基本フロー Integration Test。
 * 外部API（OpenAI / Google）はスタブし、AI・Drive 障害時も取込が成立すること
 * （FR-AICAT-04 / FR-DRIVE-06）を実DBで検証する。
 */
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("@/auth", () => ({ auth: vi.fn() }));

import { POST as postAnalyze } from "@/app/api/ledgers/[ledgerId]/imports/analyze/route";
import { GET as getImports } from "@/app/api/ledgers/[ledgerId]/imports/route";
import { GET as getImportDetail } from "@/app/api/ledgers/[ledgerId]/imports/[importFileId]/route";
import { POST as postConfirm } from "@/app/api/ledgers/[ledgerId]/imports/[importFileId]/confirm/route";
import { GET as getDownload } from "@/app/api/ledgers/[ledgerId]/imports/[importFileId]/download/route";
import { DELETE as deleteDriveFile } from "@/app/api/ledgers/[ledgerId]/imports/[importFileId]/file/route";
import { GET as getEntries } from "@/app/api/ledgers/[ledgerId]/entries/route";
import {
  GET as getMappings,
  POST as postMapping,
} from "@/app/api/ledgers/[ledgerId]/csv-mappings/route";
import {
  DELETE as deleteMapping,
  PATCH as patchMapping,
} from "@/app/api/ledgers/[ledgerId]/csv-mappings/[mappingId]/route";

import {
  createLedgerAs,
  createTestUser,
  expectErrorCode,
  jsonRequest,
  readData,
  routeContext,
  signInAs,
  signOutSession,
  unknownUuid,
  type TestUser,
} from "./helpers";

const RAKUTEN_CSV = [
  '"利用日","利用店名・商品名","利用者","支払方法","利用金額"',
  '"2026/06/25","ITテストスーパー","本人","1回払い","853"',
].join("\n");

const analyzeRequest = (ledgerId: string, csv: string, extra?: Record<string, string>): Request => {
  const form = new FormData();
  form.set("file", new File([csv], "it-sample.csv", { type: "text/csv" }));
  form.set("billingMonth", "2026-07");
  for (const [key, value] of Object.entries(extra ?? {})) {
    form.set(key, value);
  }
  return new Request(`http://localhost/api/ledgers/${ledgerId}/imports/analyze`, {
    method: "POST",
    body: form,
  });
};

const originalFetch = globalThis.fetch;

describe("インポートAPI（認可・基本フロー）", () => {
  let owner: TestUser;
  let stranger: TestUser;
  let ledgerId: string;

  beforeAll(async () => {
    // 外部API（OpenAI / Google）への実呼び出しを遮断する（障害時フォールバックの検証を兼ねる）
    vi.stubGlobal("fetch", ((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes("openai.com") || url.includes("googleapis.com")) {
        return Promise.resolve(new Response("stubbed", { status: 500 }));
      }
      return originalFetch(input, init);
    }) as typeof fetch);

    owner = await createTestUser("取込オーナー");
    stranger = await createTestUser("取込部外者");
    ledgerId = await createLedgerAs(owner.id, "personal", "取込テスト帳簿");
  });

  afterAll(() => {
    vi.unstubAllGlobals();
  });

  it("未認証の履歴一覧は 401", async () => {
    signOutSession();
    const response = await getImports(
      jsonRequest(`/api/ledgers/${ledgerId}/imports`, "GET"),
      routeContext({ ledgerId }),
    );
    await expectErrorCode(response, 401, "UNAUTHENTICATED");
  });

  it("非メンバーは全エンドポイントが 403", async () => {
    signInAs(stranger.id);
    const importFileId = unknownUuid();
    const mappingId = unknownUuid();

    await expectErrorCode(
      await postAnalyze(analyzeRequest(ledgerId, RAKUTEN_CSV), routeContext({ ledgerId })),
      403,
      "FORBIDDEN",
    );
    await expectErrorCode(
      await getImports(
        jsonRequest(`/api/ledgers/${ledgerId}/imports`, "GET"),
        routeContext({ ledgerId }),
      ),
      403,
      "FORBIDDEN",
    );
    await expectErrorCode(
      await getImportDetail(
        jsonRequest(`/api/ledgers/${ledgerId}/imports/${importFileId}`, "GET"),
        routeContext({ ledgerId, importFileId }),
      ),
      403,
      "FORBIDDEN",
    );
    await expectErrorCode(
      await postConfirm(
        jsonRequest(`/api/ledgers/${ledgerId}/imports/${importFileId}/confirm`, "POST", {
          rows: [],
        }),
        routeContext({ ledgerId, importFileId }),
      ),
      403,
      "FORBIDDEN",
    );
    await expectErrorCode(
      await getDownload(
        jsonRequest(`/api/ledgers/${ledgerId}/imports/${importFileId}/download`, "GET"),
        routeContext({ ledgerId, importFileId }),
      ),
      403,
      "FORBIDDEN",
    );
    await expectErrorCode(
      await deleteDriveFile(
        jsonRequest(`/api/ledgers/${ledgerId}/imports/${importFileId}/file`, "DELETE"),
        routeContext({ ledgerId, importFileId }),
      ),
      403,
      "FORBIDDEN",
    );
    await expectErrorCode(
      await getMappings(
        jsonRequest(`/api/ledgers/${ledgerId}/csv-mappings`, "GET"),
        routeContext({ ledgerId }),
      ),
      403,
      "FORBIDDEN",
    );
    await expectErrorCode(
      await postMapping(
        jsonRequest(`/api/ledgers/${ledgerId}/csv-mappings`, "POST", {
          name: "不正",
          mapping: {
            headerRows: 1,
            usedOnColumn: 0,
            usedOnFormat: "YYYY/MM/DD",
            descriptionColumn: 1,
            amountColumn: 2,
          },
        }),
        routeContext({ ledgerId }),
      ),
      403,
      "FORBIDDEN",
    );
    await expectErrorCode(
      await patchMapping(
        jsonRequest(`/api/ledgers/${ledgerId}/csv-mappings/${mappingId}`, "PATCH", {
          name: "改名",
        }),
        routeContext({ ledgerId, mappingId }),
      ),
      403,
      "FORBIDDEN",
    );
    await expectErrorCode(
      await deleteMapping(
        jsonRequest(`/api/ledgers/${ledgerId}/csv-mappings/${mappingId}`, "DELETE"),
        routeContext({ ledgerId, mappingId }),
      ),
      403,
      "FORBIDDEN",
    );
  });

  it("解析→確定→履歴反映の基本フロー（AI/Drive障害時もフォールバックで成立）", async () => {
    signInAs(owner.id);

    const analyzeResponse = await postAnalyze(
      analyzeRequest(ledgerId, RAKUTEN_CSV),
      routeContext({ ledgerId }),
    );
    expect(analyzeResponse.status).toBe(200);
    const analyzed = await readData<{
      importFileId: string;
      format: string;
      rows: {
        usedOn: string;
        billingMonth: string;
        amount: number;
        description: string;
        suggestedCategoryId: string;
        categorySource: string;
        duplicate: unknown;
      }[];
    }>(analyzeResponse);
    expect(analyzed.format).toBe("rakuten");
    expect(analyzed.rows).toHaveLength(1);
    // OpenAI スタブ（500）のため AI 判定は行われず「その他」フォールバック
    expect(analyzed.rows[0].categorySource).toBe("none");
    expect(analyzed.rows[0].duplicate).toBeNull();
    expect(analyzed.rows[0].billingMonth).toBe("2026-07");

    const importFileId = analyzed.importFileId;
    const confirmResponse = await postConfirm(
      jsonRequest(`/api/ledgers/${ledgerId}/imports/${importFileId}/confirm`, "POST", {
        rows: analyzed.rows.map((row) => ({
          usedOn: row.usedOn,
          billingMonth: row.billingMonth,
          amount: row.amount,
          description: row.description,
          categoryId: row.suggestedCategoryId,
          memo: "統合テスト備考",
          skip: false,
        })),
      }),
      routeContext({ ledgerId, importFileId }),
    );
    expect(confirmResponse.status).toBe(200);
    await expect(readData(confirmResponse)).resolves.toEqual({
      importedCount: 1,
      skippedCount: 0,
      errorCount: 0,
    });

    // 明細一覧に csv 由来で登録されている
    const entriesResponse = await getEntries(
      jsonRequest(`/api/ledgers/${ledgerId}/entries?source=csv`, "GET"),
      routeContext({ ledgerId }),
    );
    const entries = await readData<{ description: string }[]>(entriesResponse);
    expect(entries.some((entry) => entry.description === "ITテストスーパー")).toBe(true);

    // 確定済みへの再確定は 409
    await expectErrorCode(
      await postConfirm(
        jsonRequest(`/api/ledgers/${ledgerId}/imports/${importFileId}/confirm`, "POST", {
          rows: [],
        }),
        routeContext({ ledgerId, importFileId }),
      ),
      409,
      "CONFLICT",
    );

    // 同一ファイルの再解析は DUPLICATE_FILE（force で回避）
    await expectErrorCode(
      await postAnalyze(analyzeRequest(ledgerId, RAKUTEN_CSV), routeContext({ ledgerId })),
      409,
      "CONFLICT",
    );
    const forced = await postAnalyze(
      analyzeRequest(ledgerId, RAKUTEN_CSV, { force: "true" }),
      routeContext({ ledgerId }),
    );
    expect(forced.status).toBe(200);
    // 再解析では確定済み明細が重複候補として検知される（FR-DUP-01）
    const forcedData = await readData<{ rows: { duplicate: unknown }[] }>(forced);
    expect(forcedData.rows[0].duplicate).not.toBeNull();

    // 履歴一覧・詳細に反映（Drive はスタブ障害のため failed）
    const listResponse = await getImports(
      jsonRequest(`/api/ledgers/${ledgerId}/imports`, "GET"),
      routeContext({ ledgerId }),
    );
    const items = await readData<
      { id: string; status: string; importedCount: number; driveStatus: string }[]
    >(listResponse);
    const completed = items.find((item) => item.id === importFileId);
    expect(completed).toMatchObject({ status: "completed", importedCount: 1, driveStatus: "failed" });

    // Drive 未保存のためダウンロード・原本削除は 404
    await expectErrorCode(
      await getDownload(
        jsonRequest(`/api/ledgers/${ledgerId}/imports/${importFileId}/download`, "GET"),
        routeContext({ ledgerId, importFileId }),
      ),
      404,
      "NOT_FOUND",
    );
  });

  it("列マッピングの保存・一覧・変更・削除と名前重複 409", async () => {
    signInAs(owner.id);
    const mapping = {
      headerRows: 1,
      usedOnColumn: 0,
      usedOnFormat: "YYYY/MM/DD",
      descriptionColumn: 1,
      amountColumn: 2,
    };

    const created = await postMapping(
      jsonRequest(`/api/ledgers/${ledgerId}/csv-mappings`, "POST", { name: "ITカード用", mapping }),
      routeContext({ ledgerId }),
    );
    expect(created.status).toBe(201);
    const { id: mappingId } = await readData<{ id: string }>(created);

    await expectErrorCode(
      await postMapping(
        jsonRequest(`/api/ledgers/${ledgerId}/csv-mappings`, "POST", { name: "ITカード用", mapping }),
        routeContext({ ledgerId }),
      ),
      409,
      "CONFLICT",
    );

    const patched = await patchMapping(
      jsonRequest(`/api/ledgers/${ledgerId}/csv-mappings/${mappingId}`, "PATCH", {
        name: "ITカード改",
      }),
      routeContext({ ledgerId, mappingId }),
    );
    expect(patched.status).toBe(200);

    const deleted = await deleteMapping(
      jsonRequest(`/api/ledgers/${ledgerId}/csv-mappings/${mappingId}`, "DELETE"),
      routeContext({ ledgerId, mappingId }),
    );
    expect(deleted.status).toBe(204);

    const listResponse = await getMappings(
      jsonRequest(`/api/ledgers/${ledgerId}/csv-mappings`, "GET"),
      routeContext({ ledgerId }),
    );
    const mappings = await readData<{ id: string }[]>(listResponse);
    expect(mappings.some((item) => item.id === mappingId)).toBe(false);
  });
});
