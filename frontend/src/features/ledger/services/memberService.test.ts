import { describe, expect, it, vi } from "vitest";

import { ForbiddenError, NotFoundError, ValidationError } from "@/shared/errors/appError";

import type { LedgerMemberRepository } from "../repositories/ledgerMemberRepository";
import type { LedgerMember, MemberRole } from "../types";
import { removeMember, updateMemberWeights } from "./memberService";

const LEDGER_ID = "11111111-1111-1111-1111-111111111111";
const OWNER_ID = "22222222-2222-2222-2222-222222222222";
const MEMBER_ID = "33333333-3333-3333-3333-333333333333";

/** ユーザーごとの role を返すスタブ。未登録ユーザーは null。 */
const createRepositoryStub = (
  roles: Record<string, MemberRole>,
  members: LedgerMember[] = [],
): LedgerMemberRepository => ({
  hasActiveMembership: vi.fn(async () => true),
  getMembershipRole: vi.fn(async (userId: string) => roles[userId] ?? null),
  listMembers: vi.fn(async () => members),
  softDeleteMembership: vi.fn(async () => undefined),
  updateWeights: vi.fn(async () => members),
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

describe("updateMemberWeights", () => {
  const members: LedgerMember[] = [
    { userId: OWNER_ID, role: "owner", displayName: "たろう", avatarUrl: null, joinedAt: "", weight: 1 },
    { userId: MEMBER_ID, role: "member", displayName: "はなこ", avatarUrl: null, joinedAt: "", weight: 1 },
  ];

  it("家族家計簿のオーナーは全メンバー分の比重を更新できる", async () => {
    const repository = createRepositoryStub({ [OWNER_ID]: "owner" }, members);
    const weights = [
      { userId: OWNER_ID, weight: 60 },
      { userId: MEMBER_ID, weight: 40 },
    ];

    await updateMemberWeights(repository, {
      ledgerId: LEDGER_ID,
      ledger: { ownerUserId: OWNER_ID, type: "family" },
      actorUserId: OWNER_ID,
      weights,
    });

    expect(repository.updateWeights).toHaveBeenCalledWith(LEDGER_ID, weights);
  });

  it("個人家計簿では ValidationError", async () => {
    const repository = createRepositoryStub({ [OWNER_ID]: "owner" }, members);
    await expect(
      updateMemberWeights(repository, {
        ledgerId: LEDGER_ID,
        ledger: { ownerUserId: OWNER_ID, type: "personal" },
        actorUserId: OWNER_ID,
        weights: [{ userId: OWNER_ID, weight: 100 }],
      }),
    ).rejects.toBeInstanceOf(ValidationError);
    expect(repository.updateWeights).not.toHaveBeenCalled();
  });

  it("オーナー以外は ForbiddenError", async () => {
    const repository = createRepositoryStub({ [MEMBER_ID]: "member" }, members);
    await expect(
      updateMemberWeights(repository, {
        ledgerId: LEDGER_ID,
        ledger: { ownerUserId: OWNER_ID, type: "family" },
        actorUserId: MEMBER_ID,
        weights: [
          { userId: OWNER_ID, weight: 60 },
          { userId: MEMBER_ID, weight: 40 },
        ],
      }),
    ).rejects.toBeInstanceOf(ForbiddenError);
    expect(repository.updateWeights).not.toHaveBeenCalled();
  });

  it("現メンバーと過不足があれば ValidationError", async () => {
    const repository = createRepositoryStub({ [OWNER_ID]: "owner" }, members);
    await expect(
      updateMemberWeights(repository, {
        ledgerId: LEDGER_ID,
        ledger: { ownerUserId: OWNER_ID, type: "family" },
        actorUserId: OWNER_ID,
        weights: [{ userId: OWNER_ID, weight: 100 }],
      }),
    ).rejects.toBeInstanceOf(ValidationError);
    expect(repository.updateWeights).not.toHaveBeenCalled();
  });
});
