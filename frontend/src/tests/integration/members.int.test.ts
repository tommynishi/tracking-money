/**
 * メンバーAPI（api.md 3.6 / 3.7）の認可 Integration Test。
 * 除外はオーナーのみ・オーナーは退出不可・非メンバー=403 を実DBで検証する。
 */
import { beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("@/auth", () => ({ auth: vi.fn() }));

import { GET as getMembers } from "@/app/api/ledgers/[ledgerId]/members/route";
import { DELETE as removeMember } from "@/app/api/ledgers/[ledgerId]/members/[userId]/route";

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
  type TestUser,
} from "./helpers";

describe("メンバーAPI（認可）", () => {
  let owner: TestUser;
  let memberA: TestUser;
  let memberB: TestUser;
  let stranger: TestUser;
  let ledgerId: string;

  beforeAll(async () => {
    owner = await createTestUser("メンバー帳簿オーナー");
    memberA = await createTestUser("メンバーA");
    memberB = await createTestUser("メンバーB");
    stranger = await createTestUser("メンバー部外者");
    ledgerId = await createLedgerAs(owner.id, "family", "メンバーテスト家族帳簿");
    await addFamilyMember(ledgerId, owner.id, memberA.id);
    await addFamilyMember(ledgerId, owner.id, memberB.id);
  });

  const removeAs = async (actorUserId: string, targetUserId: string): Promise<Response> => {
    signInAs(actorUserId);
    return removeMember(
      jsonRequest(`/api/ledgers/${ledgerId}/members/${targetUserId}`, "DELETE"),
      routeContext({ ledgerId, userId: targetUserId }),
    );
  };

  it("未認証の一覧取得は 401", async () => {
    signOutSession();
    const response = await getMembers(
      jsonRequest(`/api/ledgers/${ledgerId}/members`, "GET"),
      routeContext({ ledgerId }),
    );
    await expectErrorCode(response, 401, "UNAUTHENTICATED");
  });

  it("一覧はメンバーのみ取得でき（3名）、非メンバーは 403", async () => {
    signInAs(memberA.id);
    const memberResponse = await getMembers(
      jsonRequest(`/api/ledgers/${ledgerId}/members`, "GET"),
      routeContext({ ledgerId }),
    );
    expect(memberResponse.status).toBe(200);
    const members = await readData<{ userId: string }[]>(memberResponse);
    expect(members).toHaveLength(3);

    signInAs(stranger.id);
    const strangerResponse = await getMembers(
      jsonRequest(`/api/ledgers/${ledgerId}/members`, "GET"),
      routeContext({ ledgerId }),
    );
    await expectErrorCode(strangerResponse, 403, "FORBIDDEN");
  });

  it("オーナー以外は他メンバーを除外できず、オーナーの除外・退出も 403", async () => {
    const removeOtherByMember = await removeAs(memberA.id, memberB.id);
    await expectErrorCode(removeOtherByMember, 403, "FORBIDDEN");

    const removeOwnerByMember = await removeAs(memberA.id, owner.id);
    await expectErrorCode(removeOwnerByMember, 403, "FORBIDDEN");

    const ownerLeave = await removeAs(owner.id, owner.id);
    await expectErrorCode(ownerLeave, 403, "FORBIDDEN");
  });

  it("オーナーによる除外と本人の退出は 204、残メンバーが一覧へ反映される", async () => {
    const removedByOwner = await removeAs(owner.id, memberA.id);
    expect(removedByOwner.status).toBe(204);

    const selfLeave = await removeAs(memberB.id, memberB.id);
    expect(selfLeave.status).toBe(204);

    signInAs(owner.id);
    const membersResponse = await getMembers(
      jsonRequest(`/api/ledgers/${ledgerId}/members`, "GET"),
      routeContext({ ledgerId }),
    );
    const members = await readData<{ userId: string }[]>(membersResponse);
    expect(members).toHaveLength(1);
    expect(members[0].userId).toBe(owner.id);
  });
});
