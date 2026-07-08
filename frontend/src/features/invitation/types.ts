/** 家族招待ドメインの型（database.md §3.4 / api.md 4）。 */

/** 招待の状態（database.md 3.4 の status CHECK と一致）。 */
export type InvitationStatus = "pending" | "accepted" | "declined" | "canceled";

/** 一覧の取得方向（自分宛 / 自分発・api.md 4.2）。 */
export type InvitationDirection = "received" | "sent";

/** 招待（ledger_invitations）のドメイン表現。 */
export type Invitation = {
  readonly id: string;
  readonly ledgerId: string;
  readonly inviterUserId: string;
  readonly inviteeUserId: string;
  readonly status: InvitationStatus;
  /** 招待先（invitee）が応答した日時。未応答・取消は null。 */
  readonly respondedAt: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
};
