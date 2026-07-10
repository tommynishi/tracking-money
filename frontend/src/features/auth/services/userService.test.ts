import { describe, expect, it, vi } from "vitest";

import { ConflictError, NotFoundError, ValidationError } from "@/shared/errors/appError";

import type { User } from "../types";
import { ensureUser, getMe, updateDisplayName } from "./userService";

const USER_ID = "11111111-1111-1111-1111-111111111111";
const LINE_USER_ID = "U1234567890abcdef";

const user: User = {
  id: USER_ID,
  lineUserId: LINE_USER_ID,
  displayName: "たろう",
  avatarUrl: "https://example.com/avatar.png",
  createdAt: "2026-07-10T00:00:00.000Z",
  updatedAt: "2026-07-10T00:00:00.000Z",
};

const ensureInput = {
  lineUserId: LINE_USER_ID,
  displayName: "たろう",
  avatarUrl: "https://example.com/avatar.png",
};

describe("ensureUser", () => {
  it("既存ユーザーがいればそのまま返す（作成しない）", async () => {
    const repository = {
      findByLineUserId: vi.fn(async () => user),
      create: vi.fn(async () => user),
    };

    const result = await ensureUser(repository, ensureInput);

    expect(result).toEqual(user);
    expect(repository.create).not.toHaveBeenCalled();
  });

  it("未登録なら作成する（FR-AUTH-03）", async () => {
    const repository = {
      findByLineUserId: vi.fn(async () => null),
      create: vi.fn(async () => user),
    };

    const result = await ensureUser(repository, ensureInput);

    expect(result).toEqual(user);
    expect(repository.create).toHaveBeenCalledWith(ensureInput);
  });

  it("同時ログインで作成が競合したら既存ユーザーを取り直す", async () => {
    const repository = {
      findByLineUserId: vi
        .fn<() => Promise<User | null>>()
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(user),
      create: vi.fn(async () => {
        throw new ConflictError("duplicate");
      }),
    };

    const result = await ensureUser(repository, ensureInput);

    expect(result).toEqual(user);
    expect(repository.findByLineUserId).toHaveBeenCalledTimes(2);
  });
});

describe("getMe", () => {
  const createDeps = (overrides: { user?: User | null } = {}) => ({
    userRepository: {
      getById: vi.fn(async () => (overrides.user === undefined ? user : overrides.user)),
    },
    ledgerRepository: {
      getOwnedPersonalLedgerId: vi.fn(async () => "personal-ledger"),
      getUserFamilyMembership: vi.fn(async () => ({
        ledgerId: "family-ledger",
        role: "member" as const,
      })),
    },
  });

  it("ユーザー情報と所属帳簿 id を返す（LINE ID は含めない）", async () => {
    const result = await getMe(createDeps(), USER_ID);

    expect(result).toEqual({
      id: USER_ID,
      displayName: "たろう",
      avatarUrl: "https://example.com/avatar.png",
      personalLedgerId: "personal-ledger",
      familyLedgerId: "family-ledger",
    });
    expect(Object.keys(result)).not.toContain("lineUserId");
  });

  it("ユーザーが存在しなければ NotFoundError", async () => {
    await expect(getMe(createDeps({ user: null }), USER_ID)).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe("updateDisplayName", () => {
  it("前後の空白を除去して更新する", async () => {
    const repository = { updateDisplayName: vi.fn(async () => user) };

    await updateDisplayName(repository, { userId: USER_ID, displayName: "  たろう  " });

    expect(repository.updateDisplayName).toHaveBeenCalledWith(USER_ID, "たろう");
  });

  it("空なら ValidationError", async () => {
    const repository = { updateDisplayName: vi.fn(async () => user) };

    await expect(
      updateDisplayName(repository, { userId: USER_ID, displayName: "   " }),
    ).rejects.toBeInstanceOf(ValidationError);
    expect(repository.updateDisplayName).not.toHaveBeenCalled();
  });

  it("50文字を超えたら ValidationError", async () => {
    const repository = { updateDisplayName: vi.fn(async () => user) };

    await expect(
      updateDisplayName(repository, { userId: USER_ID, displayName: "あ".repeat(51) }),
    ).rejects.toBeInstanceOf(ValidationError);
  });
});
