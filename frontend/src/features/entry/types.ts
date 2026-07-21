/** 明細ドメインの型（database.md §3.6 / api.md 6）。 */

/** 取込元（手入力 / CSV / PDF・FR-ENTRY-06）。 */
export type EntrySource = "manual" | "csv" | "pdf";

/** 明細種別。現状は支出のみ（database.md 3.6 の type CHECK）。 */
export type EntryType = "expense";

/**
 * 按分方法（家族家計簿限定・FR-SPLIT-03）。
 * default: 家計簿の既定比重 / custom: この明細だけの比重 / assigned: 1人に全額計上。
 */
export type SplitType = "default" | "custom" | "assigned";

/** 明細ごとの独自比重1件（splitType = "custom" のときのみ使用）。 */
export type SplitShare = {
  readonly userId: string;
  readonly weight: number;
};

/** 明細（entries）のコアなドメイン表現。 */
export type Entry = {
  readonly id: string;
  readonly ledgerId: string;
  readonly categoryId: string;
  /** 利用日（YYYY-MM-DD）。 */
  readonly usedOn: string;
  /** 支払月（YYYY-MM）。カード請求の対象月。利用日と異なる場合がある（例：6/23利用が7月請求）。 */
  readonly billingMonth: string;
  /** 金額（日本円・整数・FR-ENTRY-07）。 */
  readonly amount: number;
  readonly description: string;
  /** 重複チェック用に正規化した摘要（FR-DUP-01）。 */
  readonly normalizedDescription: string;
  readonly paymentMethod: string | null;
  readonly memo: string | null;
  readonly type: EntryType;
  readonly source: EntrySource;
  readonly createdByUserId: string;
  /** 支払者（立替者・FR-SPLIT-04）。登録者とは別概念。個人家計簿では常に本人。 */
  readonly paidByUserId: string;
  readonly splitType: SplitType;
  readonly splitShares: readonly SplitShare[] | null;
  readonly assignedUserId: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
};

/** 一覧表示用の明細（カテゴリ名・登録者名を含む射影・api.md 6.1）。 */
export type EntryListItem = {
  readonly id: string;
  readonly usedOn: string;
  readonly billingMonth: string;
  readonly amount: number;
  readonly description: string;
  readonly paymentMethod: string | null;
  readonly memo: string | null;
  readonly source: EntrySource;
  readonly category: { readonly id: string; readonly name: string };
  readonly createdBy: { readonly id: string; readonly displayName: string };
  readonly paidBy: { readonly id: string; readonly displayName: string };
  readonly splitType: SplitType;
  readonly splitShares: readonly SplitShare[] | null;
  readonly assignedTo: { readonly id: string; readonly displayName: string } | null;
};
