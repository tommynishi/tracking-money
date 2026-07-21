import { describe, expect, it, vi } from "vitest";

import { ValidationError } from "@/shared/errors/appError";
import type { LedgerMember } from "@/features/ledger/types";

import { getSettlement, type SettlementDeps } from "./settlementService";

const TARO = "11111111-1111-1111-1111-111111111111";
const LEDGER_ID = "22222222-2222-2222-2222-222222222222";

const member: LedgerMember = {
  userId: TARO,
  role: "owner",
  displayName: "たろう",
  avatarUrl: null,
  joinedAt: "",
  weight: 60,
};

const createDeps = (): SettlementDeps => ({
  memberRepository: { listMembers: vi.fn(async () => [member]) },
  settlementEntryRepository: { listByBillingMonth: vi.fn(async () => []) },
});

describe("getSettlement", () => {
  it("個人家計簿では ValidationError", async () => {
    const deps = createDeps();
    await expect(
      getSettlement(deps, { type: "personal" }, LEDGER_ID, "2026-07"),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("家族家計簿ではメンバー・明細を取得して計算する", async () => {
    const deps = createDeps();
    const result = await getSettlement(deps, { type: "family" }, LEDGER_ID, "2026-07");
    expect(result.billingMonth).toBe("2026-07");
    expect(result.members).toEqual([
      { userId: TARO, displayName: "たろう", weight: 60, fairShareAmount: 0, paidAmount: 0, balance: 0 },
    ]);
    expect(deps.memberRepository.listMembers).toHaveBeenCalledWith(LEDGER_ID);
    expect(deps.settlementEntryRepository.listByBillingMonth).toHaveBeenCalledWith(
      LEDGER_ID,
      "2026-07",
    );
  });
});
