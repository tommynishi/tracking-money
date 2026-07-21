/** 按分・精算ドメインの型（database.md 3.3/3.6・api.md 12・FR-SPLIT）。 */
import type { SplitShare, SplitType } from "@/features/entry/types";

/** 精算計算に使う明細1件の最小表現。 */
export type SettlementEntry = {
  readonly amount: number;
  readonly paidByUserId: string;
  readonly splitType: SplitType;
  readonly splitShares: readonly SplitShare[] | null;
  readonly assignedUserId: string | null;
};

/** 精算計算に使う対象メンバー（既定比重を含む）。 */
export type SettlementMember = {
  readonly userId: string;
  readonly displayName: string;
  readonly weight: number;
};

/** メンバー1名分の精算結果。 */
export type SettlementMemberResult = SettlementMember & {
  /** 按分後の本来の負担額。 */
  readonly fairShareAmount: number;
  /** 実際に支払った額の合計（paidByUserId 基準）。 */
  readonly paidAmount: number;
  /** paidAmount - fairShareAmount。正なら受け取るべき額、負なら支払うべき額。 */
  readonly balance: number;
};

/** 差額を相殺する送金1件。 */
export type SettlementTransfer = {
  readonly fromUserId: string;
  readonly toUserId: string;
  readonly amount: number;
};

export type SettlementResult = {
  readonly billingMonth: string;
  readonly members: readonly SettlementMemberResult[];
  readonly transfers: readonly SettlementTransfer[];
  /** 退出済みメンバーが関与し精算対象から除外した明細数。 */
  readonly excludedEntryCount: number;
};
