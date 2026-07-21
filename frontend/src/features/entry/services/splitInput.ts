/**
 * 明細の按分入力（支払者・按分方法）の解決（FR-SPLIT-03/04・api.md 6.2/6.4）。
 * 個人家計簿では按分方法は default 固定・支払者は本人のみとする。
 * 家族家計簿では split_type に応じた組み合わせの整合性（DBのCHECK制約と対応）を検証する。
 */
import { ValidationError } from "@/shared/errors/appError";

import type { LedgerType } from "@/features/ledger/types";

import type { SplitShare, SplitType } from "../types";

export type SplitInput = {
  readonly paidByUserId?: string;
  readonly splitType?: SplitType;
  readonly splitShares?: readonly SplitShare[] | null;
  readonly assignedUserId?: string | null;
};

export type ResolvedSplitCombination = {
  readonly splitType: SplitType;
  readonly splitShares: readonly SplitShare[] | null;
  readonly assignedUserId: string | null;
};

export type ResolvedSplit = ResolvedSplitCombination & {
  readonly paidByUserId: string;
};

const assertMember = (memberIds: ReadonlySet<string>, userId: string, label: string): void => {
  if (!memberIds.has(userId)) {
    throw new ValidationError(`${label}は家計簿のメンバーである必要があります`);
  }
};

const resolveCombination = (
  ledgerType: LedgerType,
  memberIds: ReadonlySet<string>,
  splitType: SplitType,
  splitShares: readonly SplitShare[] | null | undefined,
  assignedUserId: string | null | undefined,
): ResolvedSplitCombination => {
  if (ledgerType === "personal") {
    if (splitType !== "default" || splitShares != null || assignedUserId != null) {
      throw new ValidationError("個人家計簿では按分方法を指定できません");
    }
    return { splitType: "default", splitShares: null, assignedUserId: null };
  }

  if (splitType === "default") {
    if (splitShares != null || assignedUserId != null) {
      throw new ValidationError("按分方法が既定比重のときは独自比重・計上先を指定できません");
    }
    return { splitType: "default", splitShares: null, assignedUserId: null };
  }

  if (splitType === "custom") {
    if (assignedUserId != null) {
      throw new ValidationError("按分方法が独自比重のときは計上先を指定できません");
    }
    if (splitShares == null || splitShares.length < 2) {
      throw new ValidationError("独自の比重は2人分以上指定してください");
    }
    const seen = new Set<string>();
    for (const share of splitShares) {
      if (share.weight <= 0) {
        throw new ValidationError("比重は正の数で指定してください");
      }
      assertMember(memberIds, share.userId, "独自比重の対象者");
      if (seen.has(share.userId)) {
        throw new ValidationError("独自比重の対象者が重複しています");
      }
      seen.add(share.userId);
    }
    return { splitType: "custom", splitShares, assignedUserId: null };
  }

  // splitType === "assigned"
  if (splitShares != null) {
    throw new ValidationError("按分方法が全額計上のときは独自比重を指定できません");
  }
  if (assignedUserId == null) {
    throw new ValidationError("計上先メンバーを指定してください");
  }
  assertMember(memberIds, assignedUserId, "計上先");
  return { splitType: "assigned", splitShares: null, assignedUserId };
};

/**
 * 新規作成時の按分入力を解決する。常にフル解決した値を返す（支払者を含む）。
 */
export const resolveSplitForCreate = (
  ledgerType: LedgerType,
  memberIds: ReadonlySet<string>,
  defaultPaidByUserId: string,
  input: SplitInput,
): ResolvedSplit => {
  const paidByUserId = input.paidByUserId ?? defaultPaidByUserId;
  assertMember(memberIds, paidByUserId, "支払者");

  const combination = resolveCombination(
    ledgerType,
    memberIds,
    input.splitType ?? "default",
    input.splitShares,
    input.assignedUserId,
  );
  return { paidByUserId, ...combination };
};

/**
 * 編集時の按分方法（splitType/splitShares/assignedUserId）を解決する。
 * いずれも未指定なら変更しない（null を返す）。変更する場合は完全な組み合わせを要求する。
 * 支払者（paidByUserId）は本関数の対象外（呼び出し側で個別に検証・反映する）。
 */
export const resolveSplitForUpdate = (
  ledgerType: LedgerType,
  memberIds: ReadonlySet<string>,
  input: SplitInput,
): ResolvedSplitCombination | null => {
  const touchesSplit =
    input.splitType !== undefined ||
    input.splitShares !== undefined ||
    input.assignedUserId !== undefined;
  if (!touchesSplit) {
    return null;
  }

  return resolveCombination(
    ledgerType,
    memberIds,
    input.splitType ?? "default",
    input.splitShares,
    input.assignedUserId,
  );
};

/** 支払者の変更を検証する（メンバーであること）。 */
export const assertValidPaidBy = (memberIds: ReadonlySet<string>, paidByUserId: string): void => {
  assertMember(memberIds, paidByUserId, "支払者");
};
