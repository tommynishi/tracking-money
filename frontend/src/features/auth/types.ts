/** 認証・アカウントのドメイン型（database.md 3.1 users・FR-AUTH）。 */

export type User = {
  readonly id: string;
  /** LINE のユーザーID。個人情報のためログ・APIレスポンスへ出力しない（NFR-05）。 */
  readonly lineUserId: string;
  readonly displayName: string;
  readonly avatarUrl: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
};
