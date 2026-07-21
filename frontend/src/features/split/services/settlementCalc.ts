/**
 * 精算の純粋計算（FR-SPLIT-05・architecture.md 3.4(c)）。
 * DBアクセスを持たず、明細一覧とメンバー一覧から都度計算する（キャッシュなし）。
 */
import type { SettlementEntry, SettlementMember, SettlementMemberResult, SettlementResult, SettlementTransfer } from "../types";

/**
 * amount を weights（userId→正の重み）の比率で按分し、端数は最大剰余法で1円単位に配分する。
 * 合計が amount と厳密に一致することを保証する。
 */
const allocateByWeight = (
  amount: number,
  weights: ReadonlyMap<string, number>,
): Map<string, number> => {
  const totalWeight = [...weights.values()].reduce((sum, w) => sum + w, 0);
  const raw = [...weights.entries()].map(([userId, weight]) => {
    const exact = (amount * weight) / totalWeight;
    return { userId, floor: Math.floor(exact), remainder: exact - Math.floor(exact) };
  });

  const allocated = new Map(raw.map(({ userId, floor }) => [userId, floor]));
  const distributed = raw.reduce((sum, { floor }) => sum + floor, 0);
  let remaining = amount - distributed;

  const byRemainderDesc = [...raw].sort((a, b) => b.remainder - a.remainder);
  for (const { userId } of byRemainderDesc) {
    if (remaining <= 0) break;
    allocated.set(userId, (allocated.get(userId) ?? 0) + 1);
    remaining -= 1;
  }

  return allocated;
};

/** この明細を計算対象にできるか（登場する全ユーザーが現メンバーであること）。 */
const isEntryEligible = (entry: SettlementEntry, memberIds: ReadonlySet<string>): boolean => {
  if (!memberIds.has(entry.paidByUserId)) return false;
  if (entry.splitType === "assigned") {
    return entry.assignedUserId !== null && memberIds.has(entry.assignedUserId);
  }
  if (entry.splitType === "custom") {
    return (entry.splitShares ?? []).every((share) => memberIds.has(share.userId));
  }
  return true;
};

/** 明細1件の按分比重（userId→正の重み）を決定する。 */
const weightsForEntry = (
  entry: SettlementEntry,
  members: readonly SettlementMember[],
): Map<string, number> => {
  if (entry.splitType === "assigned") {
    // assertion: isEntryEligible で assignedUserId の非nullを検証済み
    return new Map([[entry.assignedUserId as string, 1]]);
  }
  if (entry.splitType === "custom") {
    return new Map((entry.splitShares ?? []).map((share) => [share.userId, share.weight]));
  }
  // default: 家計簿の現在の既定比重を常に適用する（FR-SPLIT-06）
  return new Map(members.map((member) => [member.userId, member.weight]));
};

/** 差額（balance）を相殺する最小送金の一覧を貪欲法で計算する。 */
const buildTransfers = (members: readonly SettlementMemberResult[]): SettlementTransfer[] => {
  const creditors = members
    .filter((m) => m.balance > 0)
    .map((m) => ({ userId: m.userId, amount: m.balance }))
    .sort((a, b) => b.amount - a.amount);
  const debtors = members
    .filter((m) => m.balance < 0)
    .map((m) => ({ userId: m.userId, amount: -m.balance }))
    .sort((a, b) => b.amount - a.amount);

  const transfers: SettlementTransfer[] = [];
  let ci = 0;
  let di = 0;
  while (ci < creditors.length && di < debtors.length) {
    const creditor = creditors[ci];
    const debtor = debtors[di];
    const amount = Math.min(creditor.amount, debtor.amount);
    if (amount > 0) {
      transfers.push({ fromUserId: debtor.userId, toUserId: creditor.userId, amount });
    }
    creditor.amount -= amount;
    debtor.amount -= amount;
    if (creditor.amount === 0) ci += 1;
    if (debtor.amount === 0) di += 1;
  }
  return transfers;
};

/** 指定月の精算を計算する（FR-SPLIT-05）。メンバーが1名以下でも空の結果を返す。 */
export const calculateSettlement = (
  billingMonth: string,
  members: readonly SettlementMember[],
  entries: readonly SettlementEntry[],
): SettlementResult => {
  const memberIds = new Set(members.map((m) => m.userId));
  const fairShare = new Map<string, number>(members.map((m) => [m.userId, 0]));
  const paidAmount = new Map<string, number>(members.map((m) => [m.userId, 0]));
  let excludedEntryCount = 0;

  for (const entry of entries) {
    if (!isEntryEligible(entry, memberIds)) {
      excludedEntryCount += 1;
      continue;
    }
    const weights = weightsForEntry(entry, members);
    const allocation = allocateByWeight(entry.amount, weights);
    for (const [userId, share] of allocation) {
      fairShare.set(userId, (fairShare.get(userId) ?? 0) + share);
    }
    paidAmount.set(entry.paidByUserId, (paidAmount.get(entry.paidByUserId) ?? 0) + entry.amount);
  }

  const memberResults: SettlementMemberResult[] = members.map((member) => {
    const paid = paidAmount.get(member.userId) ?? 0;
    const share = fairShare.get(member.userId) ?? 0;
    return { ...member, fairShareAmount: share, paidAmount: paid, balance: paid - share };
  });

  return {
    billingMonth,
    members: memberResults,
    transfers: buildTransfers(memberResults),
    excludedEntryCount,
  };
};
