import { describe, expect, it, vi } from "vitest";

import { ConflictError } from "@/shared/errors/appError";

import type {
  CreateLedgerWithDefaultsInput,
  LedgerRepository,
} from "../repositories/ledgerRepository";
import type { Ledger } from "../types";
import { createLedger } from "./ledgerService";

const OWNER_ID = "11111111-1111-1111-1111-111111111111";

const createdLedger: Ledger = {
  id: "99999999-9999-9999-9999-999999999999",
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
  createLedgerWithDefaults: vi.fn(async (input: CreateLedgerWithDefaultsInput) => {
    captured.input = input;
    return createdLedger;
  }),
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
