/** 精算サービス（api.md 12.2・FR-SPLIT-05）。家族家計簿限定。 */
import { ValidationError } from "@/shared/errors/appError";

import type { LedgerMemberRepository } from "@/features/ledger/repositories/ledgerMemberRepository";
import type { Ledger } from "@/features/ledger/types";

import type { SettlementEntryRepository } from "../repositories/settlementEntryRepository";
import type { SettlementResult } from "../types";
import { calculateSettlement } from "./settlementCalc";

export type SettlementDeps = {
  readonly memberRepository: Pick<LedgerMemberRepository, "listMembers">;
  readonly settlementEntryRepository: Pick<SettlementEntryRepository, "listByBillingMonth">;
};

/** 指定月の精算を計算する（家族家計簿のみ・FR-SPLIT-05）。 */
export const getSettlement = async (
  deps: SettlementDeps,
  ledger: Pick<Ledger, "type">,
  ledgerId: string,
  billingMonth: string,
): Promise<SettlementResult> => {
  if (ledger.type !== "family") {
    throw new ValidationError("精算は家族家計簿でのみ利用できます");
  }

  const [members, entries] = await Promise.all([
    deps.memberRepository.listMembers(ledgerId),
    deps.settlementEntryRepository.listByBillingMonth(ledgerId, billingMonth),
  ]);

  return calculateSettlement(
    billingMonth,
    members.map((member) => ({
      userId: member.userId,
      displayName: member.displayName,
      weight: member.weight,
    })),
    entries,
  );
};
