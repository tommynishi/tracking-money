/**
 * notification_settings への DB アクセス（Repository 層・database.md 3.10）。
 * 行が存在しない場合は既定値で作成する（初回アクセス時に遅延作成。FR-NOTIFY-01〜03）。
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

import type { NotificationSettings } from "../types";

const TABLE = "notification_settings";
const COLUMNS =
  "user_id, monthly_enabled, monthly_day, monthly_last_sent_on, " +
  "inactivity_enabled, inactivity_days, inactivity_last_sent_at";

const rowSchema = z.object({
  user_id: z.string(),
  monthly_enabled: z.boolean(),
  monthly_day: z.number(),
  monthly_last_sent_on: z.string().nullable(),
  inactivity_enabled: z.boolean(),
  inactivity_days: z.number(),
  inactivity_last_sent_at: z.string().nullable(),
});

const toSettings = (row: z.infer<typeof rowSchema>): NotificationSettings => ({
  userId: row.user_id,
  monthlyEnabled: row.monthly_enabled,
  monthlyDay: row.monthly_day,
  monthlyLastSentOn: row.monthly_last_sent_on,
  inactivityEnabled: row.inactivity_enabled,
  inactivityDays: row.inactivity_days,
  inactivityLastSentAt: row.inactivity_last_sent_at,
});

export type UpdateNotificationSettingsFields = {
  readonly monthlyEnabled?: boolean;
  readonly monthlyDay?: number;
  readonly inactivityEnabled?: boolean;
  readonly inactivityDays?: number;
};

/** 通知バッチ対象の1件（cron/notifications 用・FR-NOTIFY-01〜02）。 */
export type NotificationBatchTarget = NotificationSettings & { readonly lineUserId: string };

export type NotificationSettingsRepository = {
  /** 設定を取得し、なければ既定値で作成して返す。 */
  getOrCreateByUserId(userId: string): Promise<NotificationSettings>;
  updateByUserId(
    userId: string,
    fields: UpdateNotificationSettingsFields,
  ): Promise<NotificationSettings>;
  /** 通知バッチの対象（有効なユーザー全員。LINEユーザーIDを含む）を返す。 */
  listBatchTargets(): Promise<NotificationBatchTarget[]>;
  markMonthlySent(userId: string, sentOn: string): Promise<void>;
  markInactivitySent(userId: string, sentAt: string): Promise<void>;
};

export const createNotificationSettingsRepository = (
  client: SupabaseClient,
): NotificationSettingsRepository => ({
  async getOrCreateByUserId(userId) {
    const { data, error } = await client
      .from(TABLE)
      .select(COLUMNS)
      .eq("user_id", userId)
      .is("deleted_at", null)
      .maybeSingle();

    if (error) {
      throw new Error(`Failed to get notification settings: ${error.message}`);
    }
    if (data !== null) {
      return toSettings(rowSchema.parse(data));
    }

    const { data: created, error: insertError } = await client
      .from(TABLE)
      .insert({ user_id: userId })
      .select(COLUMNS)
      .single();

    if (insertError) {
      throw new Error(`Failed to create notification settings: ${insertError.message}`);
    }
    return toSettings(rowSchema.parse(created));
  },

  async updateByUserId(userId, fields) {
    const patch: Record<string, boolean | number> = {};
    if (fields.monthlyEnabled !== undefined) patch.monthly_enabled = fields.monthlyEnabled;
    if (fields.monthlyDay !== undefined) patch.monthly_day = fields.monthlyDay;
    if (fields.inactivityEnabled !== undefined) {
      patch.inactivity_enabled = fields.inactivityEnabled;
    }
    if (fields.inactivityDays !== undefined) patch.inactivity_days = fields.inactivityDays;

    const { data, error } = await client
      .from(TABLE)
      .update(patch)
      .eq("user_id", userId)
      .is("deleted_at", null)
      .select(COLUMNS)
      .maybeSingle();

    if (error) {
      throw new Error(`Failed to update notification settings: ${error.message}`);
    }
    if (data !== null) {
      return toSettings(rowSchema.parse(data));
    }
    // 行が未作成のまま PATCH された場合は既定値を土台に作成する
    await this.getOrCreateByUserId(userId);
    return this.updateByUserId(userId, fields);
  },

  async listBatchTargets() {
    const { data, error } = await client
      .from(TABLE)
      .select(`${COLUMNS}, users!inner(line_user_id, deleted_at)`)
      .is("deleted_at", null)
      .is("users.deleted_at", null);

    if (error) {
      throw new Error(`Failed to list notification batch targets: ${error.message}`);
    }

    const batchRowSchema = rowSchema.extend({
      users: z.object({ line_user_id: z.string() }),
    });
    return z
      .array(batchRowSchema)
      .parse(data)
      .map((row) => ({ ...toSettings(row), lineUserId: row.users.line_user_id }));
  },

  async markMonthlySent(userId, sentOn) {
    const { error } = await client
      .from(TABLE)
      .update({ monthly_last_sent_on: sentOn })
      .eq("user_id", userId);
    if (error) {
      throw new Error(`Failed to mark monthly notification sent: ${error.message}`);
    }
  },

  async markInactivitySent(userId, sentAt) {
    const { error } = await client
      .from(TABLE)
      .update({ inactivity_last_sent_at: sentAt })
      .eq("user_id", userId);
    if (error) {
      throw new Error(`Failed to mark inactivity notification sent: ${error.message}`);
    }
  },
});
