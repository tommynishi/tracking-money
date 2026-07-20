/**
 * 明細API（api.md 6.1〜6.5）の認可 Integration Test。
 * 非メンバー=403・未認証=401 と、手入力CRUD＋一覧ページングの基本フローを実DBで検証する。
 */
import { beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("@/auth", () => ({ auth: vi.fn() }));

import { GET as getCategories } from "@/app/api/ledgers/[ledgerId]/categories/route";
import { GET as getEntries, POST as postEntry } from "@/app/api/ledgers/[ledgerId]/entries/route";
import {
  DELETE as deleteEntry,
  GET as getEntry,
  PATCH as patchEntry,
} from "@/app/api/ledgers/[ledgerId]/entries/[entryId]/route";

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

type EntryResponse = { id: string; amount: number; description: string; usedOn: string; billingMonth: string };

describe("明細API（認可）", () => {
  let owner: TestUser;
  let stranger: TestUser;
  let ledgerId: string;
  let categoryId: string;

  beforeAll(async () => {
    owner = await createTestUser("明細所有者");
    stranger = await createTestUser("明細部外者");
    ledgerId = await createLedgerAs(owner.id, "personal", "明細テスト帳簿");

    signInAs(owner.id);
    const categoriesResponse = await getCategories(
      jsonRequest(`/api/ledgers/${ledgerId}/categories`, "GET"),
      routeContext({ ledgerId }),
    );
    const categories = await readData<{ id: string }[]>(categoriesResponse);
    categoryId = categories[0].id;
  });

  const createEntryAs = async (userId: string): Promise<Response> => {
    signInAs(userId);
    return postEntry(
      jsonRequest(`/api/ledgers/${ledgerId}/entries`, "POST", {
        usedOn: "2026-07-01",
        amount: 1200,
        description: "スーパーで買い物",
        categoryId,
      }),
      routeContext({ ledgerId }),
    );
  };

  it("未認証の一覧取得は 401", async () => {
    signOutSession();
    const response = await getEntries(
      jsonRequest(`/api/ledgers/${ledgerId}/entries`, "GET"),
      routeContext({ ledgerId }),
    );
    await expectErrorCode(response, 401, "UNAUTHENTICATED");
  });

  it("非メンバーは全操作が 403", async () => {
    signInAs(stranger.id);
    const entryId = unknownUuid();

    const listResponse = await getEntries(
      jsonRequest(`/api/ledgers/${ledgerId}/entries`, "GET"),
      routeContext({ ledgerId }),
    );
    await expectErrorCode(listResponse, 403, "FORBIDDEN");

    const createResponse = await createEntryAs(stranger.id);
    await expectErrorCode(createResponse, 403, "FORBIDDEN");

    const detailResponse = await getEntry(
      jsonRequest(`/api/ledgers/${ledgerId}/entries/${entryId}`, "GET"),
      routeContext({ ledgerId, entryId }),
    );
    await expectErrorCode(detailResponse, 403, "FORBIDDEN");

    const patchResponse = await patchEntry(
      jsonRequest(`/api/ledgers/${ledgerId}/entries/${entryId}`, "PATCH", { amount: 1 }),
      routeContext({ ledgerId, entryId }),
    );
    await expectErrorCode(patchResponse, 403, "FORBIDDEN");

    const deleteResponse = await deleteEntry(
      jsonRequest(`/api/ledgers/${ledgerId}/entries/${entryId}`, "DELETE"),
      routeContext({ ledgerId, entryId }),
    );
    await expectErrorCode(deleteResponse, 403, "FORBIDDEN");
  });

  it("メンバーは登録〜一覧〜編集〜削除ができ、削除後の詳細は 404", async () => {
    const created = await createEntryAs(owner.id);
    expect(created.status).toBe(201);
    const entry = await readData<EntryResponse>(created);

    const listResponse = await getEntries(
      jsonRequest(`/api/ledgers/${ledgerId}/entries?billingMonth=2026-07`, "GET"),
      routeContext({ ledgerId }),
    );
    expect(listResponse.status).toBe(200);
    const listBody = (await listResponse.json()) as {
      data: EntryResponse[];
      meta: { totalCount: number };
    };
    expect(listBody.meta.totalCount).toBeGreaterThanOrEqual(1);
    expect(listBody.data.some((item) => item.id === entry.id)).toBe(true);

    const patched = await patchEntry(
      jsonRequest(`/api/ledgers/${ledgerId}/entries/${entry.id}`, "PATCH", { amount: 980 }),
      routeContext({ ledgerId, entryId: entry.id }),
    );
    expect(patched.status).toBe(200);
    const updated = await readData<EntryResponse>(patched);
    expect(updated.amount).toBe(980);

    const deleted = await deleteEntry(
      jsonRequest(`/api/ledgers/${ledgerId}/entries/${entry.id}`, "DELETE"),
      routeContext({ ledgerId, entryId: entry.id }),
    );
    expect(deleted.status).toBe(204);

    const afterDelete = await getEntry(
      jsonRequest(`/api/ledgers/${ledgerId}/entries/${entry.id}`, "GET"),
      routeContext({ ledgerId, entryId: entry.id }),
    );
    await expectErrorCode(afterDelete, 404, "NOT_FOUND");
  });

  it("支払月は利用日と独立して登録・絞り込みできる（6/23利用→7月請求）", async () => {
    signInAs(owner.id);
    const created = await postEntry(
      jsonRequest(`/api/ledgers/${ledgerId}/entries`, "POST", {
        usedOn: "2026-06-23",
        billingMonth: "2026-07",
        amount: 500,
        description: "支払月ズレテスト",
        categoryId,
      }),
      routeContext({ ledgerId }),
    );
    expect(created.status).toBe(201);
    const entry = await readData<EntryResponse>(created);
    expect(entry.usedOn).toBe("2026-06-23");
    expect(entry.billingMonth).toBe("2026-07");

    const foundInBillingMonth = await getEntries(
      jsonRequest(`/api/ledgers/${ledgerId}/entries?billingMonth=2026-07`, "GET"),
      routeContext({ ledgerId }),
    );
    const foundBody = await readData<EntryResponse[]>(foundInBillingMonth);
    expect(foundBody.some((item) => item.id === entry.id)).toBe(true);

    const notFoundInJuneBillingMonth = await getEntries(
      jsonRequest(`/api/ledgers/${ledgerId}/entries?billingMonth=2026-06`, "GET"),
      routeContext({ ledgerId }),
    );
    const notFoundBody = await readData<EntryResponse[]>(notFoundInJuneBillingMonth);
    expect(notFoundBody.some((item) => item.id === entry.id)).toBe(false);
  });
});
