/** 通知設定のドメイン型（database.md 3.10 notification_settings・FR-NOTIFY-01〜03）。 */

export type NotificationSettings = {
  readonly userId: string;
  readonly monthlyEnabled: boolean;
  readonly monthlyDay: number;
  readonly monthlyLastSentOn: string | null;
  readonly inactivityEnabled: boolean;
  readonly inactivityDays: number;
  readonly inactivityLastSentAt: string | null;
};
