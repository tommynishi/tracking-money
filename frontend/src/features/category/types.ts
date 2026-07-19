/** カテゴリドメインの型（database.md §3.5 / api.md 5）。 */

/** カテゴリ（categories）のドメイン表現。 */
export type Category = {
  readonly id: string;
  readonly ledgerId: string;
  readonly name: string;
  /** 固定費フラグ（FR-CATEGORY-04・AI固定費分析で利用）。 */
  readonly isFixedCost: boolean;
  /** システムカテゴリ（「その他」）。名称変更・削除不可（api.md 5.3 / 5.4）。 */
  readonly isSystem: boolean;
  /** 表示順（0始まり・昇順）。 */
  readonly sortOrder: number;
  readonly createdAt: string;
  readonly updatedAt: string;
};
