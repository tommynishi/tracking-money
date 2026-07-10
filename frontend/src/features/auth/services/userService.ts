/**
 * アカウントの業務ロジック（Service 層・FR-AUTH-03/04・api.md 2）。
 * 初回ユーザー作成・表示名検証を担い、永続化は Repository へ委譲する。
 * セッションの確立・検証は Auth.js（src/auth.ts / Route Handler）の責務とする。
 */
import { NotFoundError, ValidationError, isAppError } from "@/shared/errors/appError";

import type { LedgerRepository } from "@/features/ledger/repositories/ledgerRepository";

import type { UserRepository } from "../repositories/userRepository";
import type { User } from "../types";

const DISPLAY_NAME_MAX_LENGTH = 50;
const USER_NOT_FOUND_MESSAGE = "ユーザーが見つかりません";

export type EnsureUserInput = {
  readonly lineUserId: string;
  readonly displayName: string;
  readonly avatarUrl: string | null;
};

/**
 * LINE ユーザーIDに対応するユーザーを返し、未登録なら作成する（FR-AUTH-03）。
 * 同時ログインで作成が競合（ConflictError）した場合は既存ユーザーを取り直す。
 */
export const ensureUser = async (
  repository: Pick<UserRepository, "findByLineUserId" | "create">,
  input: EnsureUserInput,
): Promise<User> => {
  const existing = await repository.findByLineUserId(input.lineUserId);
  if (existing !== null) {
    return existing;
  }

  try {
    return await repository.create(input);
  } catch (error) {
    if (isAppError(error) && error.code === "CONFLICT") {
      const created = await repository.findByLineUserId(input.lineUserId);
      if (created !== null) {
        return created;
      }
    }
    throw error;
  }
};

export type Me = {
  readonly id: string;
  readonly displayName: string;
  readonly avatarUrl: string | null;
  readonly personalLedgerId: string | null;
  readonly familyLedgerId: string | null;
};

export type GetMeDeps = {
  readonly userRepository: Pick<UserRepository, "getById">;
  readonly ledgerRepository: Pick<
    LedgerRepository,
    "getOwnedPersonalLedgerId" | "getUserFamilyMembership"
  >;
};

/** ログイン中ユーザーの情報と所属帳簿 id を返す（api.md 2.1）。LINE ID は含めない。 */
export const getMe = async (deps: GetMeDeps, userId: string): Promise<Me> => {
  const user = await deps.userRepository.getById(userId);
  if (user === null) {
    throw new NotFoundError(USER_NOT_FOUND_MESSAGE);
  }

  const [personalLedgerId, familyMembership] = await Promise.all([
    deps.ledgerRepository.getOwnedPersonalLedgerId(userId),
    deps.ledgerRepository.getUserFamilyMembership(userId),
  ]);

  return {
    id: user.id,
    displayName: user.displayName,
    avatarUrl: user.avatarUrl,
    personalLedgerId,
    familyLedgerId: familyMembership?.ledgerId ?? null,
  };
};

/** 表示名を変更する（FR-AUTH-04・api.md 2.2）。空・長すぎる名前は ValidationError。 */
export const updateDisplayName = async (
  repository: Pick<UserRepository, "updateDisplayName">,
  input: { userId: string; displayName: string },
): Promise<User> => {
  const trimmed = input.displayName.trim();
  if (trimmed.length === 0) {
    throw new ValidationError("表示名を入力してください", [
      { field: "displayName", message: "表示名を入力してください" },
    ]);
  }
  if (trimmed.length > DISPLAY_NAME_MAX_LENGTH) {
    throw new ValidationError(`表示名は${DISPLAY_NAME_MAX_LENGTH}文字以内で入力してください`, [
      { field: "displayName", message: `${DISPLAY_NAME_MAX_LENGTH}文字以内で入力してください` },
    ]);
  }

  return repository.updateDisplayName(input.userId, trimmed);
};
