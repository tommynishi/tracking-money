import { describe, expect, it, vi } from "vitest";

import {
  ConflictError,
  ForbiddenError,
  NotFoundError,
  ValidationError,
} from "@/shared/errors/appError";
import type { Ledger } from "@/features/ledger/types";

import type { FamilyMembership } from "@/features/ledger/repositories/ledgerRepository";

import type { InvitationRepository } from "../repositories/invitationRepository";
import type { Invitation } from "../types";
import {
  acceptInvitation,
  cancelInvitation,
  createInvitation,
  declineInvitation,
  type AcceptInvitationDeps,
  type InvitationServiceDeps,
} from "./invitationService";

const OWNER_ID = "11111111-1111-1111-1111-111111111111";
const INVITEE_ID = "22222222-2222-2222-2222-222222222222";
const LEDGER_ID = "33333333-3333-3333-3333-333333333333";
const INVITATION_ID = "44444444-4444-4444-4444-444444444444";

const familyLedger: Ledger = {
  id: LEDGER_ID,
  ownerUserId: OWNER_ID,
  type: "family",
  name: "家族の家計簿",
  createdAt: "2026-07-06T00:00:00.000Z",
  updatedAt: "2026-07-06T00:00:00.000Z",
};

const pendingInvitation: Invitation = {
  id: INVITATION_ID,
  ledgerId: LEDGER_ID,
  inviterUserId: OWNER_ID,
  inviteeUserId: INVITEE_ID,
  status: "pending",
  respondedAt: null,
  createdAt: "2026-07-06T00:00:00.000Z",
  updatedAt: "2026-07-06T00:00:00.000Z",
};

const createInvitationRepoStub = (): InvitationRepository => ({
  createPending: vi.fn(async () => pendingInvitation),
  getById: vi.fn(async () => pendingInvitation),
  listForUser: vi.fn(async () => [pendingInvitation]),
  markResponded: vi.fn(async (_id, status) => ({ ...pendingInvitation, status })),
  cancel: vi.fn(async () => ({ ...pendingInvitation, status: "canceled" as const })),
  acceptFamilyInvitation: vi.fn(async () => undefined),
});

const createAcceptDeps = (
  family: FamilyMembership | null,
  invitationRepository: InvitationRepository = createInvitationRepoStub(),
): AcceptInvitationDeps => ({
  invitationRepository,
  ledgerRepository: {
    getUserFamilyMembership: vi.fn(async () => family),
  },
});

const createDeps = (
  overrides: {
    ledger?: Ledger | null;
    alreadyMember?: boolean;
    invitationRepository?: InvitationRepository;
  } = {},
): InvitationServiceDeps => ({
  invitationRepository: overrides.invitationRepository ?? createInvitationRepoStub(),
  ledgerRepository: {
    getLedgerById: vi.fn(async () =>
      overrides.ledger === undefined ? familyLedger : overrides.ledger,
    ),
  },
  memberRepository: {
    hasActiveMembership: vi.fn(async () => overrides.alreadyMember ?? false),
  },
});

describe("createInvitation", () => {
  const input = { ledgerId: LEDGER_ID, inviterUserId: OWNER_ID, inviteeUserId: INVITEE_ID };

  it("オーナーが非メンバーを招待すると pending 招待を作成する", async () => {
    const deps = createDeps();
    const result = await createInvitation(deps, input);
    expect(result).toEqual(pendingInvitation);
    expect(deps.invitationRepository.createPending).toHaveBeenCalledWith(input);
  });

  it("家計簿が無ければ NotFoundError", async () => {
    const deps = createDeps({ ledger: null });
    await expect(createInvitation(deps, input)).rejects.toBeInstanceOf(NotFoundError);
  });

  it("オーナー以外は ForbiddenError", async () => {
    const deps = createDeps();
    await expect(
      createInvitation(deps, { ...input, inviterUserId: INVITEE_ID }),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("個人家計簿には招待できない（ValidationError）", async () => {
    const deps = createDeps({ ledger: { ...familyLedger, type: "personal" } });
    await expect(createInvitation(deps, input)).rejects.toBeInstanceOf(ValidationError);
  });

  it("自分自身は招待できない（ValidationError）", async () => {
    const deps = createDeps();
    await expect(
      createInvitation(deps, { ...input, inviteeUserId: OWNER_ID }),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("既にメンバーなら ConflictError", async () => {
    const deps = createDeps({ alreadyMember: true });
    await expect(createInvitation(deps, input)).rejects.toBeInstanceOf(ConflictError);
    expect(deps.invitationRepository.createPending).not.toHaveBeenCalled();
  });
});

describe("acceptInvitation", () => {
  const input = { invitationId: INVITATION_ID, userId: INVITEE_ID, deleteOwnFamilyLedger: false };
  const ownedFamily: FamilyMembership = { ledgerId: "own-ledger", role: "owner" };
  const joinedFamily: FamilyMembership = { ledgerId: "other-ledger", role: "member" };

  it("家族家計簿に未所属なら参加する（削除対象なし）", async () => {
    const repository = createInvitationRepoStub();
    const deps = createAcceptDeps(null, repository);
    await acceptInvitation(deps, input);
    expect(repository.acceptFamilyInvitation).toHaveBeenCalledWith(INVITATION_ID, INVITEE_ID, null);
  });

  it("自分の家族家計簿を所有し deleteOwnFamilyLedger=true なら自帳簿を削除して参加する", async () => {
    const repository = createInvitationRepoStub();
    const deps = createAcceptDeps(ownedFamily, repository);
    await acceptInvitation(deps, { ...input, deleteOwnFamilyLedger: true });
    expect(repository.acceptFamilyInvitation).toHaveBeenCalledWith(
      INVITATION_ID,
      INVITEE_ID,
      "own-ledger",
    );
  });

  it("自分の家族家計簿を所有し false なら FAMILY_LEDGER_EXISTS で拒否する", async () => {
    const repository = createInvitationRepoStub();
    const deps = createAcceptDeps(ownedFamily, repository);
    const error = await acceptInvitation(deps, input).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(ConflictError);
    expect((error as ConflictError).details?.[0]?.code).toBe("FAMILY_LEDGER_EXISTS");
    expect(repository.acceptFamilyInvitation).not.toHaveBeenCalled();
  });

  it("他者の家族家計簿に参加済みなら ALREADY_FAMILY_MEMBER で拒否する（自動退出しない）", async () => {
    const repository = createInvitationRepoStub();
    const deps = createAcceptDeps(joinedFamily, repository);
    const error = await acceptInvitation(deps, { ...input, deleteOwnFamilyLedger: true }).catch(
      (caught: unknown) => caught,
    );
    expect(error).toBeInstanceOf(ConflictError);
    expect((error as ConflictError).details?.[0]?.code).toBe("ALREADY_FAMILY_MEMBER");
    expect(repository.acceptFamilyInvitation).not.toHaveBeenCalled();
  });

  it("招待先本人でなければ ForbiddenError", async () => {
    const deps = createAcceptDeps(null);
    await expect(acceptInvitation(deps, { ...input, userId: OWNER_ID })).rejects.toBeInstanceOf(
      ForbiddenError,
    );
  });

  it("pending でなければ ConflictError", async () => {
    const repository = createInvitationRepoStub();
    repository.getById = vi.fn(async () => ({ ...pendingInvitation, status: "accepted" as const }));
    const deps = createAcceptDeps(null, repository);
    await expect(acceptInvitation(deps, input)).rejects.toBeInstanceOf(ConflictError);
  });
});

describe("declineInvitation", () => {
  it("招待先本人なら declined へ更新する", async () => {
    const repository = createInvitationRepoStub();
    await declineInvitation(repository, { invitationId: INVITATION_ID, userId: INVITEE_ID });
    expect(repository.markResponded).toHaveBeenCalledWith(INVITATION_ID, "declined");
  });

  it("招待先本人でなければ ForbiddenError", async () => {
    const repository = createInvitationRepoStub();
    await expect(
      declineInvitation(repository, { invitationId: INVITATION_ID, userId: OWNER_ID }),
    ).rejects.toBeInstanceOf(ForbiddenError);
    expect(repository.markResponded).not.toHaveBeenCalled();
  });

  it("招待が無ければ NotFoundError", async () => {
    const repository = createInvitationRepoStub();
    repository.getById = vi.fn(async () => null);
    await expect(
      declineInvitation(repository, { invitationId: INVITATION_ID, userId: INVITEE_ID }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe("cancelInvitation", () => {
  it("招待者本人なら canceled へ更新する", async () => {
    const repository = createInvitationRepoStub();
    await cancelInvitation(repository, { invitationId: INVITATION_ID, userId: OWNER_ID });
    expect(repository.cancel).toHaveBeenCalledWith(INVITATION_ID);
  });

  it("招待者本人でなければ ForbiddenError", async () => {
    const repository = createInvitationRepoStub();
    await expect(
      cancelInvitation(repository, { invitationId: INVITATION_ID, userId: INVITEE_ID }),
    ).rejects.toBeInstanceOf(ForbiddenError);
    expect(repository.cancel).not.toHaveBeenCalled();
  });
});
