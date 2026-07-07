/** 家計簿ドメインの型（database.md §3.2 / §3.5・api.md 3）。 */

/** 家計簿種別（personal=個人 / family=家族）。 */
export type LedgerType = "personal" | "family";

/**
 * 家計簿作成時に投入するデフォルトカテゴリ1件の定義（database.md §5）。
 * DBのカラム名（snake_case）ではなくドメイン表現（camelCase）で保持する。
 */
export type DefaultCategorySeed = {
  readonly name: string;
  readonly isFixedCost: boolean;
  readonly isSystem: boolean;
  readonly sortOrder: number;
};
