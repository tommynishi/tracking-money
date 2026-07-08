import { describe, expect, it, vi } from "vitest";

import { ForbiddenError, isAppError } from "@/shared/errors/appError";

import type { LedgerMemberRepository } from "../repositories/ledgerMemberRepository";
import { assertLedgerAccess, assertLedgerOwner } from "./authorization";

const USER_ID = "11111111-1111-1111-1111-111111111111";
const LEDGER_ID = "22222222-2222-2222-2222-222222222222";

const createRepositoryStub = (
  hasMembership: boolean,
): Pick<LedgerMemberRepository, "hasActiveMembership"> => ({
  hasActiveMembership: vi.fn(async () => hasMembership),
});

describe("assertLedgerAccess", () => {
  it("メンバーの場合は例外を投げずに解決する", async () => {
    // Arrange
    const repository = createRepositoryStub(true);

    // Act & Assert
    await expect(assertLedgerAccess(repository, USER_ID, LEDGER_ID)).resolves.toBeUndefined();
    expect(repository.hasActiveMembership).toHaveBeenCalledWith(USER_ID, LEDGER_ID);
  });

  it("非メンバーの場合は ForbiddenError(403) を投げる", async () => {
    // Arrange
    const repository = createRepositoryStub(false);

    // Act & Assert
    await expect(assertLedgerAccess(repository, USER_ID, LEDGER_ID)).rejects.toBeInstanceOf(
      ForbiddenError,
    );
  });

  it("投げられるエラーは AppError（code=FORBIDDEN / status=403）である", async () => {
    // Arrange
    const repository = createRepositoryStub(false);

    // Act
    const error = await assertLedgerAccess(repository, USER_ID, LEDGER_ID).catch(
      (caught: unknown) => caught,
    );

    // Assert
    expect(isAppError(error)).toBe(true);
    if (isAppError(error)) {
      expect(error.code).toBe("FORBIDDEN");
      expect(error.status).toBe(403);
    }
  });
});

describe("assertLedgerOwner", () => {
  it("オーナー本人の場合は例外を投げない", () => {
    // Act & Assert
    expect(() => assertLedgerOwner({ ownerUserId: USER_ID }, USER_ID)).not.toThrow();
  });

  it("オーナーでない場合は ForbiddenError(403) を投げる", () => {
    // Act & Assert
    expect(() => assertLedgerOwner({ ownerUserId: USER_ID }, LEDGER_ID)).toThrow(ForbiddenError);
  });
});
