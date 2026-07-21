/** 家計簿ドメインの型（database.md §3.2 / §3.5・api.md 3）。 */

/** 家計簿種別（personal=個人 / family=家族）。 */
export type LedgerType = "personal" | "family";

/** 帳簿メンバーの役割（owner=作成者 / member=参加者）。 */
export type MemberRole = "owner" | "member";

/** 帳簿メンバー1件のドメイン表現（表示用のユーザー情報を含む・api.md 3.6）。 */
export type LedgerMember = {
  readonly userId: string;
  readonly role: MemberRole;
  readonly displayName: string;
  readonly avatarUrl: string | null;
  /** 参加日時（ledger_members.created_at）。 */
  readonly joinedAt: string;
  /** 既定按分比重（正の重み・FR-SPLIT-01）。個人家計簿では常に1（未使用）。 */
  readonly weight: number;
};

/** 家計簿（ledgers）のドメイン表現。 */
export type Ledger = {
  readonly id: string;
  readonly ownerUserId: string;
  readonly type: LedgerType;
  readonly name: string;
  readonly createdAt: string;
  readonly updatedAt: string;
};

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
