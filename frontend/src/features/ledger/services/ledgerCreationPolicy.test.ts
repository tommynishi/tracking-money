import { describe, expect, it } from "vitest";

import { ConflictError } from "@/shared/errors/appError";

import { assertCanCreateLedger, type UserLedgerSummary } from "./ledgerCreationPolicy";

const summary = (overrides: Partial<UserLedgerSummary> = {}): UserLedgerSummary => ({
  ownsPersonalLedger: false,
  belongsToFamilyLedger: false,
  ...overrides,
});

describe("assertCanCreateLedger", () => {
  it("個人家計簿を未所有なら personal を作成できる", () => {
    expect(() => assertCanCreateLedger(summary(), "personal")).not.toThrow();
  });

  it("個人家計簿を所有済みなら personal 作成は ConflictError(409)", () => {
    // Act
    const act = () => assertCanCreateLedger(summary({ ownsPersonalLedger: true }), "personal");

    // Assert
    expect(act).toThrow(ConflictError);
    expect(act).toThrowError(expect.objectContaining({ code: "CONFLICT", status: 409 }));
  });

  it("家族家計簿に未所属なら family を作成できる", () => {
    expect(() => assertCanCreateLedger(summary(), "family")).not.toThrow();
  });

  it("いずれかの家族家計簿に所属済みなら family 作成は ConflictError(409)", () => {
    // Act
    const act = () => assertCanCreateLedger(summary({ belongsToFamilyLedger: true }), "family");

    // Assert
    expect(act).toThrow(ConflictError);
  });

  it("個人所有していても family 作成には影響しない（種別独立）", () => {
    expect(() =>
      assertCanCreateLedger(summary({ ownsPersonalLedger: true }), "family"),
    ).not.toThrow();
  });
});
