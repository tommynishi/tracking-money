/**
 * 家族招待API（api.md 4.1〜4.5）の認可 Integration Test。
 * 招待作成はオーナーのみ、承諾・拒否は招待先本人のみ、取消は招待者本人のみを実DBで検証する。
 */
import { beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("@/auth", () => ({ auth: vi.fn() }));

import { GET as getInvitations } from "@/app/api/invitations/route";
import { DELETE as cancelInvitation } from "@/app/api/invitations/[invitationId]/route";
import { POST as acceptInvitation } from "@/app/api/invitations/[invitationId]/accept/route";
import { POST as declineInvitation } from "@/app/api/invitations/[invitationId]/decline/route";
import { POST as postLedgerInvitation } from "@/app/api/ledgers/[ledgerId]/invitations/route";
import { GET as getMembers } from "@/app/api/ledgers/[ledgerId]/members/route";

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

type InvitationResponse = { id: string; status: string };

describe("家族招待API（認可）", () => {
  let owner: TestUser;
  let member: TestUser;
  let stranger: TestUser;
  let ledgerId: string;

  beforeAll(async () => {
    owner = await createTestUser("招待オーナー");
    member = await createTestUser("招待済メンバー");
    stranger = await createTestUser("招待部外者");
    ledgerId = await createLedgerAs(owner.id, "family", "招待テスト家族帳簿");
    await addFamilyMember(ledgerId, owner.id, member.id);
  });

  const inviteAs = async (userId: string, inviteeUserId: string): Promise<Response> => {
    signInAs(userId);
    return postLedgerInvitation(
      jsonRequest(`/api/ledgers/${ledgerId}/invitations`, "POST", { inviteeUserId }),
      routeContext({ ledgerId }),
    );
  };

  it("未認証の招待一覧は 401", async () => {
    signOutSession();
    const response = await getInvitations(jsonRequest("/api/invitations", "GET"));
    await expectErrorCode(response, 401, "UNAUTHENTICATED");
  });

  it("招待作成は非メンバー・オーナー以外のメンバーだと 403", async () => {
    const invitee = await createTestUser("招待候補");

    const strangerResponse = await inviteAs(stranger.id, invitee.id);
    await expectErrorCode(strangerResponse, 403, "FORBIDDEN");

    const memberResponse = await inviteAs(member.id, invitee.id);
    await expectErrorCode(memberResponse, 403, "FORBIDDEN");
  });

  it("承諾・拒否は招待先本人のみ（別人は 403）", async () => {
    const invitee = await createTestUser("承諾テスト招待先");
    const created = await inviteAs(owner.id, invitee.id);
    expect(created.status).toBe(201);
    const invitation = await readData<InvitationResponse>(created);

    signInAs(invitee.id);
    const listResponse = await getInvitations(jsonRequest("/api/invitations", "GET"));
    expect(listResponse.status).toBe(200);
    const received = await readData<InvitationResponse[]>(listResponse);
    expect(received.some((item) => item.id === invitation.id)).toBe(true);

    signInAs(stranger.id);
    const acceptByOther = await acceptInvitation(
      jsonRequest(`/api/invitations/${invitation.id}/accept`, "POST", {}),
      routeContext({ invitationId: invitation.id }),
    );
    await expectErrorCode(acceptByOther, 403, "FORBIDDEN");

    const declineByOther = await declineInvitation(
      jsonRequest(`/api/invitations/${invitation.id}/decline`, "POST"),
      routeContext({ invitationId: invitation.id }),
    );
    await expectErrorCode(declineByOther, 403, "FORBIDDEN");

    signInAs(invitee.id);
    const declined = await declineInvitation(
      jsonRequest(`/api/invitations/${invitation.id}/decline`, "POST"),
      routeContext({ invitationId: invitation.id }),
    );
    expect(declined.status).toBe(200);
    const declinedInvitation = await readData<InvitationResponse>(declined);
    expect(declinedInvitation.status).toBe("declined");
  });

  it("取消は招待者本人のみ（招待先・部外者は 403）", async () => {
    const invitee = await createTestUser("取消テスト招待先");
    const created = await inviteAs(owner.id, invitee.id);
    const invitation = await readData<InvitationResponse>(created);

    signInAs(invitee.id);
    const cancelByInvitee = await cancelInvitation(
      jsonRequest(`/api/invitations/${invitation.id}`, "DELETE"),
      routeContext({ invitationId: invitation.id }),
    );
    await expectErrorCode(cancelByInvitee, 403, "FORBIDDEN");

    signInAs(owner.id);
    const canceled = await cancelInvitation(
      jsonRequest(`/api/invitations/${invitation.id}`, "DELETE"),
      routeContext({ invitationId: invitation.id }),
    );
    expect(canceled.status).toBe(204);
  });

  it("承諾すると家族家計簿のメンバーへ追加される", async () => {
    const invitee = await createTestUser("参加テスト招待先");
    const created = await inviteAs(owner.id, invitee.id);
    const invitation = await readData<InvitationResponse>(created);

    signInAs(invitee.id);
    const accepted = await acceptInvitation(
      jsonRequest(`/api/invitations/${invitation.id}/accept`, "POST", {}),
      routeContext({ invitationId: invitation.id }),
    );
    expect(accepted.status).toBe(200);

    const membersResponse = await getMembers(
      jsonRequest(`/api/ledgers/${ledgerId}/members`, "GET"),
      routeContext({ ledgerId }),
    );
    expect(membersResponse.status).toBe(200);
    const members = await readData<{ userId: string }[]>(membersResponse);
    expect(members.some((item) => item.userId === invitee.id)).toBe(true);
  });
});
