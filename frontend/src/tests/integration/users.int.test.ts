/**
 * アカウント・ユーザー検索API（api.md 2.1〜2.3）の Integration Test。
 * 未認証=401、検索結果に LINE ID を含めないこと（NFR）を実DBで検証する。
 */
import { beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("@/auth", () => ({ auth: vi.fn() }));

import { GET as getMe, PATCH as patchMe } from "@/app/api/me/route";
import { GET as searchUsers } from "@/app/api/users/search/route";

import {
  createLedgerAs,
  createTestUser,
  expectErrorCode,
  jsonRequest,
  readData,
  signInAs,
  signOutSession,
  type TestUser,
} from "./helpers";

type MeResponse = {
  id: string;
  displayName: string;
  personalLedgerId: string | null;
};

describe("アカウント・ユーザー検索API", () => {
  let user: TestUser;

  beforeAll(async () => {
    user = await createTestUser("アカウント本人");
  });

  it("未認証の /api/me・検索は 401", async () => {
    signOutSession();
    await expectErrorCode(await getMe(), 401, "UNAUTHENTICATED");
    await expectErrorCode(
      await searchUsers(jsonRequest("/api/users/search?q=テスト", "GET")),
      401,
      "UNAUTHENTICATED",
    );
  });

  it("/api/me は本人情報と個人家計簿IDを返す", async () => {
    const personalLedgerId = await createLedgerAs(user.id, "personal", "本人の個人帳簿");

    signInAs(user.id);
    const response = await getMe();
    expect(response.status).toBe(200);
    const me = await readData<MeResponse>(response);
    expect(me.id).toBe(user.id);
    expect(me.displayName).toBe(user.displayName);
    expect(me.personalLedgerId).toBe(personalLedgerId);
  });

  it("表示名を変更できる", async () => {
    signInAs(user.id);
    const newName = `${user.displayName}-改`;
    const response = await patchMe(jsonRequest("/api/me", "PATCH", { displayName: newName }));
    expect(response.status).toBe(200);
    const me = await readData<{ displayName: string }>(response);
    expect(me.displayName).toBe(newName);

    const emptyResponse = await patchMe(jsonRequest("/api/me", "PATCH", { displayName: "  " }));
    await expectErrorCode(emptyResponse, 400, "VALIDATION_ERROR");
  });

  it("検索は2文字以上が必須で、結果に LINE ID を含めない", async () => {
    const target = await createTestUser("検索対象者");
    signInAs(user.id);

    const shortResponse = await searchUsers(jsonRequest("/api/users/search?q=a", "GET"));
    await expectErrorCode(shortResponse, 400, "VALIDATION_ERROR");

    const response = await searchUsers(
      jsonRequest(`/api/users/search?q=${encodeURIComponent(target.displayName)}`, "GET"),
    );
    expect(response.status).toBe(200);
    const results = await readData<Record<string, unknown>[]>(response);
    const found = results.find((item) => item.id === target.id);
    expect(found).toBeDefined();
    expect(found).not.toHaveProperty("lineUserId");
    expect(found).not.toHaveProperty("line_user_id");
  });
});
