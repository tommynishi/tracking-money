/**
 * 通知バッチ（api.md 11.1・FR-NOTIFY-01〜04）。Vercel Cron から日次で起動される。
 * 送信失敗は個別にログ記録するのみで他ユーザーの処理・アプリ本体へ影響させない（FR-NOTIFY-04）。
 */
import type { EntryRepository } from "@/features/entry/repositories/entryRepository";
import { dayOfMonth, diffDays, lastDayOfMonth, todayInJst } from "@/shared/utils/month";

import type { NotificationSettingsRepository } from "../repositories/notificationSettingsRepository";
import type { LineMessagingClient } from "./lineMessagingClient";

const MONTHLY_MESSAGE =
  "今月も家計簿の更新時期です。Tracking Money でカード明細を取り込みましょう。";
const inactivityMessage = (days: number): string =>
  `${days}日以上、明細の登録がありません。Tracking Money で家計簿を更新しましょう。`;

export type NotificationBatchDeps = {
  readonly settingsRepository: Pick<
    NotificationSettingsRepository,
    "listBatchTargets" | "markMonthlySent" | "markInactivitySent"
  >;
  readonly entryRepository: Pick<EntryRepository, "getLastCreatedAtByUser">;
  readonly lineClient: Pick<LineMessagingClient, "pushText">;
};

export type NotificationBatchResult = {
  readonly monthlySent: number;
  readonly inactivitySent: number;
  readonly failedCount: number;
};

/** monthly_day が月末を超える場合は月末へ繰上げる（database.md 3.10）。 */
const resolveDueDay = (monthlyDay: number, today: string): number =>
  Math.min(monthlyDay, lastDayOfMonth(today));

const isMonthlyDue = (
  target: { readonly monthlyDay: number; readonly monthlyLastSentOn: string | null },
  today: string,
): boolean => {
  if (dayOfMonth(today) !== resolveDueDay(target.monthlyDay, today)) {
    return false;
  }
  return target.monthlyLastSentOn === null || target.monthlyLastSentOn.slice(0, 7) !== today.slice(0, 7);
};

/** 実行する（FR-NOTIFY-01〜04）。個別送信失敗はログのみ記録し処理を継続する。 */
export const runNotificationBatch = async (
  deps: NotificationBatchDeps,
  now: Date = new Date(),
): Promise<NotificationBatchResult> => {
  const today = todayInJst(now);
  const targets = await deps.settingsRepository.listBatchTargets();

  let monthlySent = 0;
  let inactivitySent = 0;
  let failedCount = 0;

  for (const target of targets) {
    if (target.monthlyEnabled && isMonthlyDue(target, today)) {
      try {
        await deps.lineClient.pushText(target.lineUserId, MONTHLY_MESSAGE);
        await deps.settingsRepository.markMonthlySent(target.userId, today);
        monthlySent += 1;
      } catch (error) {
        failedCount += 1;
        console.error("Failed to send monthly notification:", error);
      }
    }

    if (target.inactivityEnabled) {
      try {
        const lastActivityAt = await deps.entryRepository.getLastCreatedAtByUser(target.userId);
        if (lastActivityAt !== null) {
          const lastActivityDate = lastActivityAt.slice(0, 10);
          const idleDays = diffDays(today, lastActivityDate);
          const alreadyNotified =
            target.inactivityLastSentAt !== null &&
            target.inactivityLastSentAt.slice(0, 10) >= lastActivityDate;
          if (idleDays >= target.inactivityDays && !alreadyNotified) {
            await deps.lineClient.pushText(
              target.lineUserId,
              inactivityMessage(target.inactivityDays),
            );
            await deps.settingsRepository.markInactivitySent(target.userId, now.toISOString());
            inactivitySent += 1;
          }
        }
      } catch (error) {
        failedCount += 1;
        console.error("Failed to send inactivity notification:", error);
      }
    }
  }

  return { monthlySent, inactivitySent, failedCount };
};
