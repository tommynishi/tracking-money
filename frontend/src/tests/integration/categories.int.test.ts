/**
 * カテゴリAPI（api.md 5.1〜5.5）の認可 Integration Test。
 * 全操作が assertLedgerAccess を通ること（非メンバー=403）と基本フローを実DBで検証する。
 */
import { beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("@/auth", () => ({ auth: vi.fn() }));

import {
  GET as getCategories,
  POST as postCategory,
} from "@/app/api/ledgers/[ledgerId]/categories/route";
import {
  DELETE as deleteCategory,
  PATCH as patchCategory,
} from "@/app/api/ledgers/[ledgerId]/categories/[categoryId]/route";
import { PUT as putCategoryOrder } from "@/app/api/ledgers/[ledgerId]/categories/order/route";

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

type CategoryResponse = { id: string; name: string; sortOrder: number };

describe("カテゴリAPI（認可）", () => {
  let owner: TestUser;
  let stranger: TestUser;
  let ledgerId: string;

  beforeAll(async () => {
    owner = await createTestUser("カテゴリ所有者");
    stranger = await createTestUser("カテゴリ部外者");
    ledgerId = await createLedgerAs(owner.id, "personal", "カテゴリテスト帳簿");
  });

  const listAs = async (userId: string): Promise<Response> => {
    signInAs(userId);
    return getCategories(
      jsonRequest(`/api/ledgers/${ledgerId}/categories`, "GET"),
      routeContext({ ledgerId }),
    );
  };

  it("未認証の一覧取得は 401", async () => {
    signOutSession();
    const response = await getCategories(
      jsonRequest(`/api/ledgers/${ledgerId}/categories`, "GET"),
      routeContext({ ledgerId }),
    );
    await expectErrorCode(response, 401, "UNAUTHENTICATED");
  });

  it("メンバーは一覧を取得でき、デフォルト14カテゴリが投入されている", async () => {
    const response = await listAs(owner.id);
    expect(response.status).toBe(200);
    const categories = await readData<CategoryResponse[]>(response);
    expect(categories).toHaveLength(14);
  });

  it("非メンバーは全操作が 403", async () => {
    signInAs(stranger.id);
    const categoryId = unknownUuid();

    const listResponse = await getCategories(
      jsonRequest(`/api/ledgers/${ledgerId}/categories`, "GET"),
      routeContext({ ledgerId }),
    );
    await expectErrorCode(listResponse, 403, "FORBIDDEN");

    const createResponse = await postCategory(
      jsonRequest(`/api/ledgers/${ledgerId}/categories`, "POST", { name: "不正カテゴリ" }),
      routeContext({ ledgerId }),
    );
    await expectErrorCode(createResponse, 403, "FORBIDDEN");

    const patchResponse = await patchCategory(
      jsonRequest(`/api/ledgers/${ledgerId}/categories/${categoryId}`, "PATCH", { name: "改名" }),
      routeContext({ ledgerId, categoryId }),
    );
    await expectErrorCode(patchResponse, 403, "FORBIDDEN");

    const deleteResponse = await deleteCategory(
      jsonRequest(`/api/ledgers/${ledgerId}/categories/${categoryId}`, "DELETE"),
      routeContext({ ledgerId, categoryId }),
    );
    await expectErrorCode(deleteResponse, 403, "FORBIDDEN");

    const orderResponse = await putCategoryOrder(
      jsonRequest(`/api/ledgers/${ledgerId}/categories/order`, "PUT", {
        categoryIds: [categoryId],
      }),
      routeContext({ ledgerId }),
    );
    await expectErrorCode(orderResponse, 403, "FORBIDDEN");
  });

  it("メンバーは追加・変更・並び替え・付け替え削除ができる", async () => {
    signInAs(owner.id);
    const created = await postCategory(
      jsonRequest(`/api/ledgers/${ledgerId}/categories`, "POST", {
        name: "テスト追加",
        isFixedCost: true,
      }),
      routeContext({ ledgerId }),
    );
    expect(created.status).toBe(201);
    const category = await readData<CategoryResponse>(created);

    const patched = await patchCategory(
      jsonRequest(`/api/ledgers/${ledgerId}/categories/${category.id}`, "PATCH", {
        name: "テスト改名",
      }),
      routeContext({ ledgerId, categoryId: category.id }),
    );
    expect(patched.status).toBe(200);
    const renamed = await readData<CategoryResponse>(patched);
    expect(renamed.name).toBe("テスト改名");

    const listResponse = await listAs(owner.id);
    const categories = await readData<CategoryResponse[]>(listResponse);
    const reordered = await putCategoryOrder(
      jsonRequest(`/api/ledgers/${ledgerId}/categories/order`, "PUT", {
        categoryIds: categories
          .map((item) => item.id)
          .slice()
          .reverse(),
      }),
      routeContext({ ledgerId }),
    );
    expect(reordered.status).toBe(204);

    const reassignTarget = categories.find((item) => item.id !== category.id);
    const deleted = await deleteCategory(
      jsonRequest(
        `/api/ledgers/${ledgerId}/categories/${category.id}?reassignToCategoryId=${reassignTarget?.id}`,
        "DELETE",
      ),
      routeContext({ ledgerId, categoryId: category.id }),
    );
    expect(deleted.status).toBe(204);
  });
});
