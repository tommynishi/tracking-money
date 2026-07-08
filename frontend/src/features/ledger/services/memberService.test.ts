import { describe, expect, it, vi } from "vitest";

import { ForbiddenError, NotFoundError } from "@/shared/errors/appError";

import type { LedgerMemberRepository } from "../repositories/ledgerMemberRepository";
import type { MemberRole } from "../types";
import { removeMember } from "./memberService";

const LEDGER_ID = "11111111-1111-1111-1111-111111111111";
const OWNER_ID = "22222222-2222-2222-2222-222222222222";
const MEMBER_ID = "33333333-3333-3333-3333-333333333333";

/** ユーザーごとの role を返すスタブ。未登録ユーザーは null。 */
const createRepositoryStub = (roles: Record<string, MemberRole>): LedgerMemberRepository => ({
  hasActiveMembership: vi.fn(async () => true),
  getMembershipRole: vi.fn(async (userId: string) => roles[userId] ?? null),
  listMembers: vi.fn(async () => []),
  softDeleteMembership: vi.fn(async () => undefined),
});

describe("removeMember", () => {
  it("オーナーが他メンバーを除外できる", async () => {
    const repository = createRepositoryStub({ [OWNER_ID]: "owner", [MEMBER_ID]: "member" });
    await removeMember(repository, {
      ledgerId: LEDGER_ID,
      actorUserId: OWNER_ID,
      targetUserId: MEMBER_ID,
    });
    expect(repository.softDeleteMembership).toHaveBeenCalledWith(MEMBER_ID, LEDGER_ID);
  });

  it("メンバーは自分で退出できる", async () => {
    const repository = createRepositoryStub({ [MEMBER_ID]: "member" });
    await removeMember(repository, {
      ledgerId: LEDGER_ID,
      actorUserId: MEMBER_ID,
      targetUserId: MEMBER_ID,
    });
    expect(repository.softDeleteMembership).toHaveBeenCalledWith(MEMBER_ID, LEDGER_ID);
  });

  it("オーナー自身は退出できない（ForbiddenError）", async () => {
    const repository = createRepositoryStub({ [OWNER_ID]: "owner" });
    await expect(
      removeMember(repository, {
        ledgerId: LEDGER_ID,
        actorUserId: OWNER_ID,
        targetUserId: OWNER_ID,
      }),
    ).rejects.toBeInstanceOf(ForbiddenError);
    expect(repository.softDeleteMembership).not.toHaveBeenCalled();
  });

  it("オーナー以外は他メンバーを除外できない（ForbiddenError）", async () => {
    const otherMemberId = "44444444-4444-4444-4444-444444444444";
    const repository = createRepositoryStub({
      [MEMBER_ID]: "member",
      [otherMemberId]: "member",
    });
    await expect(
      removeMember(repository, {
        ledgerId: LEDGER_ID,
        actorUserId: MEMBER_ID,
        targetUserId: otherMemberId,
      }),
    ).rejects.toBeInstanceOf(ForbiddenError);
    expect(repository.softDeleteMembership).not.toHaveBeenCalled();
  });

  it("対象がメンバーでなければ NotFoundError", async () => {
    const repository = createRepositoryStub({ [OWNER_ID]: "owner" });
    await expect(
      removeMember(repository, {
        ledgerId: LEDGER_ID,
        actorUserId: OWNER_ID,
        targetUserId: MEMBER_ID,
      }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });
});
