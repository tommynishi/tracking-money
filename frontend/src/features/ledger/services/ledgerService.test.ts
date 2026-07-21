import { describe, expect, it, vi } from "vitest";

import { ConflictError, ForbiddenError, NotFoundError } from "@/shared/errors/appError";

import type {
  CreateLedgerWithDefaultsInput,
  LedgerRepository,
} from "../repositories/ledgerRepository";
import type { Ledger } from "../types";
import { createLedger, deleteLedger, getLedgerDetail, renameLedger } from "./ledgerService";

const OWNER_ID = "11111111-1111-1111-1111-111111111111";
const OTHER_USER_ID = "22222222-2222-2222-2222-222222222222";
const LEDGER_ID = "99999999-9999-9999-9999-999999999999";

const createdLedger: Ledger = {
  id: LEDGER_ID,
  ownerUserId: OWNER_ID,
  type: "personal",
  name: "わたしの家計簿",
  createdAt: "2026-07-06T00:00:00.000Z",
  updatedAt: "2026-07-06T00:00:00.000Z",
};

const createRepositoryStub = (
  summary: { ownsPersonalLedger: boolean; belongsToFamilyLedger: boolean },
  captured: { input?: CreateLedgerWithDefaultsInput } = {},
): LedgerRepository => ({
  getUserLedgerSummary: vi.fn(async () => summary),
  getOwnedPersonalLedgerId: vi.fn(async () => null),
  listUserLedgers: vi.fn(async () => []),
  createLedgerWithDefaults: vi.fn(async (input: CreateLedgerWithDefaultsInput) => {
    captured.input = input;
    return createdLedger;
  }),
  getLedgerById: vi.fn(async () => createdLedger),
  updateLedgerName: vi.fn(async (_ledgerId: string, name: string) => ({
    ...createdLedger,
    name,
  })),
  deleteLedgerCascade: vi.fn(async () => undefined),
  getUserFamilyMembership: vi.fn(async () => null),
});

describe("createLedger", () => {
  it("作成可能なら14件のデフォルトカテゴリ付きで永続化し、作成した家計簿を返す", async () => {
    // Arrange
    const captured: { input?: CreateLedgerWithDefaultsInput } = {};
    const repository = createRepositoryStub(
      { ownsPersonalLedger: false, belongsToFamilyLedger: false },
      captured,
    );

    // Act
    const result = await createLedger(repository, {
      ownerUserId: OWNER_ID,
      type: "personal",
      name: "わたしの家計簿",
    });

    // Assert
    expect(result).toEqual(createdLedger);
    expect(captured.input?.ownerUserId).toBe(OWNER_ID);
    expect(captured.input?.categories).toHaveLength(14);
    expect(captured.input?.categories.at(-1)?.isSystem).toBe(true);
  });

  it("既に個人家計簿を所有していれば ConflictError を投げ、永続化しない", async () => {
    // Arrange
    const repository = createRepositoryStub({
      ownsPersonalLedger: true,
      belongsToFamilyLedger: false,
    });

    // Act & Assert
    await expect(
      createLedger(repository, { ownerUserId: OWNER_ID, type: "personal", name: "重複" }),
    ).rejects.toBeInstanceOf(ConflictError);
    expect(repository.createLedgerWithDefaults).not.toHaveBeenCalled();
  });
});

describe("renameLedger", () => {
  it("オーナーなら名称を更新し、更新後の家計簿を返す", async () => {
    // Arrange
    const repository = createRepositoryStub({
      ownsPersonalLedger: true,
      belongsToFamilyLedger: false,
    });

    // Act
    const result = await renameLedger(repository, {
      ledgerId: LEDGER_ID,
      userId: OWNER_ID,
      name: "新しい家計簿名",
    });

    // Assert
    expect(result.name).toBe("新しい家計簿名");
    expect(repository.updateLedgerName).toHaveBeenCalledWith(LEDGER_ID, "新しい家計簿名");
  });

  it("存在しなければ NotFoundError を投げ、更新しない", async () => {
    // Arrange
    const repository = createRepositoryStub({
      ownsPersonalLedger: false,
      belongsToFamilyLedger: false,
    });
    repository.getLedgerById = vi.fn(async () => null);

    // Act & Assert
    await expect(
      renameLedger(repository, { ledgerId: LEDGER_ID, userId: OWNER_ID, name: "x" }),
    ).rejects.toBeInstanceOf(NotFoundError);
    expect(repository.updateLedgerName).not.toHaveBeenCalled();
  });

  it("オーナー以外なら ForbiddenError を投げ、更新しない", async () => {
    // Arrange
    const repository = createRepositoryStub({
      ownsPersonalLedger: true,
      belongsToFamilyLedger: false,
    });

    // Act & Assert
    await expect(
      renameLedger(repository, { ledgerId: LEDGER_ID, userId: OTHER_USER_ID, name: "x" }),
    ).rejects.toBeInstanceOf(ForbiddenError);
    expect(repository.updateLedgerName).not.toHaveBeenCalled();
  });
});

describe("deleteLedger", () => {
  it("オーナーなら子データごと論理削除する", async () => {
    // Arrange
    const repository = createRepositoryStub({
      ownsPersonalLedger: true,
      belongsToFamilyLedger: false,
    });

    // Act
    await deleteLedger(repository, { ledgerId: LEDGER_ID, userId: OWNER_ID });

    // Assert
    expect(repository.deleteLedgerCascade).toHaveBeenCalledWith(LEDGER_ID);
  });

  it("存在しなければ NotFoundError を投げ、削除しない", async () => {
    // Arrange
    const repository = createRepositoryStub({
      ownsPersonalLedger: false,
      belongsToFamilyLedger: false,
    });
    repository.getLedgerById = vi.fn(async () => null);

    // Act & Assert
    await expect(
      deleteLedger(repository, { ledgerId: LEDGER_ID, userId: OWNER_ID }),
    ).rejects.toBeInstanceOf(NotFoundError);
    expect(repository.deleteLedgerCascade).not.toHaveBeenCalled();
  });

  it("オーナー以外なら ForbiddenError を投げ、削除しない", async () => {
    // Arrange
    const repository = createRepositoryStub({
      ownsPersonalLedger: true,
      belongsToFamilyLedger: false,
    });

    // Act & Assert
    await expect(
      deleteLedger(repository, { ledgerId: LEDGER_ID, userId: OTHER_USER_ID }),
    ).rejects.toBeInstanceOf(ForbiddenError);
    expect(repository.deleteLedgerCascade).not.toHaveBeenCalled();
  });
});

describe("getLedgerDetail", () => {
  const createDeps = (
    overrides: { ledger?: Ledger | null; role?: "owner" | "member" | null } = {},
  ) => ({
    ledgerRepository: {
      getLedgerById: vi.fn(async () =>
        overrides.ledger === undefined ? createdLedger : overrides.ledger,
      ),
    },
    memberRepository: {
      getMembershipRole: vi.fn(async () =>
        overrides.role === undefined ? "owner" : overrides.role,
      ),
      listMembers: vi.fn(async () => [
        {
          userId: OWNER_ID,
          role: "owner" as const,
          displayName: "たろう",
          avatarUrl: null,
          joinedAt: "2026-07-06T00:00:00.000Z",
          weight: 1,
        },
      ]),
    },
  });

  it("名称・type・自分の role・メンバー数を返す（api.md 3.3）", async () => {
    const result = await getLedgerDetail(createDeps(), { ledgerId: LEDGER_ID, userId: OWNER_ID });

    expect(result).toEqual({
      id: createdLedger.id,
      type: "personal",
      name: "わたしの家計簿",
      role: "owner",
      memberCount: 1,
    });
  });

  it("家計簿が無ければ NotFoundError", async () => {
    await expect(
      getLedgerDetail(createDeps({ ledger: null }), { ledgerId: LEDGER_ID, userId: OWNER_ID }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });
});
