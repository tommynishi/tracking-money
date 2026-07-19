/**
 * 家計簿API（api.md 3.1〜3.5）の認可 Integration Test。
 * 未認証=401、非メンバー=403（存在有無を漏らさない）、オーナー専用操作=403 を実DBで検証する。
 */
import { beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("@/auth", () => ({ auth: vi.fn() }));

import { GET as getLedgers, POST as postLedgers } from "@/app/api/ledgers/route";
import {
  DELETE as deleteLedger,
  GET as getLedgerDetail,
  PATCH as patchLedger,
} from "@/app/api/ledgers/[ledgerId]/route";

import {
  addFamilyMember,
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

describe("家計簿API（認可）", () => {
  let owner: TestUser;
  let stranger: TestUser;

  beforeAll(async () => {
    owner = await createTestUser("帳簿オーナー");
    stranger = await createTestUser("部外者");
  });

  it("未認証の一覧取得は 401", async () => {
    signOutSession();
    const response = await getLedgers();
    await expectErrorCode(response, 401, "UNAUTHENTICATED");
  });

  it("作成した家計簿が一覧へ role 付きで返る", async () => {
    const ledgerId = await createLedgerAs(owner.id, "personal", "個人テスト帳簿");

    signInAs(owner.id);
    const response = await getLedgers();
    expect(response.status).toBe(200);
    const ledgers = await readData<{ id: string; role: string }[]>(response);
    const created = ledgers.find((ledger) => ledger.id === ledgerId);
    expect(created?.role).toBe("owner");
  });

  it("詳細はメンバーのみ取得でき、非メンバー・不存在はいずれも 403", async () => {
    const detailOwner = await createTestUser("詳細オーナー");
    const ledgerId = await createLedgerAs(detailOwner.id, "personal", "詳細テスト帳簿");

    signInAs(detailOwner.id);
    const ownerResponse = await getLedgerDetail(
      jsonRequest(`/api/ledgers/${ledgerId}`, "GET"),
      routeContext({ ledgerId }),
    );
    expect(ownerResponse.status).toBe(200);

    signInAs(stranger.id);
    const strangerResponse = await getLedgerDetail(
      jsonRequest(`/api/ledgers/${ledgerId}`, "GET"),
      routeContext({ ledgerId }),
    );
    await expectErrorCode(strangerResponse, 403, "FORBIDDEN");

    const missingId = unknownUuid();
    const missingResponse = await getLedgerDetail(
      jsonRequest(`/api/ledgers/${missingId}`, "GET"),
      routeContext({ ledgerId: missingId }),
    );
    await expectErrorCode(missingResponse, 403, "FORBIDDEN");
  });

  it("名称変更は非メンバー 403・オーナー 200", async () => {
    const renameOwner = await createTestUser("改名オーナー");
    const ledgerId = await createLedgerAs(renameOwner.id, "personal", "改名前");

    signInAs(stranger.id);
    const forbidden = await patchLedger(
      jsonRequest(`/api/ledgers/${ledgerId}`, "PATCH", { name: "不正な改名" }),
      routeContext({ ledgerId }),
    );
    await expectErrorCode(forbidden, 403, "FORBIDDEN");

    signInAs(renameOwner.id);
    const renamed = await patchLedger(
      jsonRequest(`/api/ledgers/${ledgerId}`, "PATCH", { name: "改名後" }),
      routeContext({ ledgerId }),
    );
    expect(renamed.status).toBe(200);
    const ledger = await readData<{ name: string }>(renamed);
    expect(ledger.name).toBe("改名後");
  });

  it("削除は非メンバー 403・オーナー 204、削除後はアクセス不可（403）", async () => {
    const deleteOwner = await createTestUser("削除オーナー");
    const deleteTarget = await createLedgerAs(deleteOwner.id, "personal", "削除対象帳簿");

    signInAs(stranger.id);
    const forbidden = await deleteLedger(
      jsonRequest(`/api/ledgers/${deleteTarget}`, "DELETE"),
      routeContext({ ledgerId: deleteTarget }),
    );
    await expectErrorCode(forbidden, 403, "FORBIDDEN");

    signInAs(deleteOwner.id);
    const deleted = await deleteLedger(
      jsonRequest(`/api/ledgers/${deleteTarget}`, "DELETE"),
      routeContext({ ledgerId: deleteTarget }),
    );
    expect(deleted.status).toBe(204);

    const afterDelete = await getLedgerDetail(
      jsonRequest(`/api/ledgers/${deleteTarget}`, "GET"),
      routeContext({ ledgerId: deleteTarget }),
    );
    await expectErrorCode(afterDelete, 403, "FORBIDDEN");
  });

  it("家族家計簿の名称変更・削除はオーナー以外のメンバーだと 403", async () => {
    const familyOwner = await createTestUser("家族オーナー");
    const familyMember = await createTestUser("家族メンバー");
    const familyLedgerId = await createLedgerAs(familyOwner.id, "family", "家族帳簿（権限）");
    await addFamilyMember(familyLedgerId, familyOwner.id, familyMember.id);

    signInAs(familyMember.id);
    const renameResponse = await patchLedger(
      jsonRequest(`/api/ledgers/${familyLedgerId}`, "PATCH", { name: "メンバーによる改名" }),
      routeContext({ ledgerId: familyLedgerId }),
    );
    await expectErrorCode(renameResponse, 403, "FORBIDDEN");

    const deleteResponse = await deleteLedger(
      jsonRequest(`/api/ledgers/${familyLedgerId}`, "DELETE"),
      routeContext({ ledgerId: familyLedgerId }),
    );
    await expectErrorCode(deleteResponse, 403, "FORBIDDEN");
  });

  it("不正な body の作成リクエストは 400", async () => {
    signInAs(owner.id);
    const response = await postLedgers(
      jsonRequest("/api/ledgers", "POST", { type: "personal", name: "" }),
    );
    await expectErrorCode(response, 400, "VALIDATION_ERROR");
  });
});
