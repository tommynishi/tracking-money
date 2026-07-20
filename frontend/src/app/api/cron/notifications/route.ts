/**
 * 通知バッチの内部API（api.md 11.1・CON-07）。Vercel Cron から日次で起動される。
 * クライアントからは使用しない。認証は Authorization: Bearer {CRON_SECRET}。
 */
import { getServerEnv } from "@/shared/config/env";
import { jsonData } from "@/shared/api/response";
import { getSupabaseServerClient } from "@/shared/lib/supabaseServer";

import { createEntryRepository } from "@/features/entry/repositories/entryRepository";
import { createNotificationSettingsRepository } from "@/features/notification/repositories/notificationSettingsRepository";
import { createLineMessagingClient } from "@/features/notification/services/lineMessagingClient";
import { runNotificationBatch } from "@/features/notification/services/notificationBatchService";

export async function GET(request: Request): Promise<Response> {
  const { CRON_SECRET } = getServerEnv();
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${CRON_SECRET}`) {
    return Response.json({ error: { code: "UNAUTHENTICATED", message: "認証が必要です" } }, { status: 401 });
  }

  const client = getSupabaseServerClient();
  const result = await runNotificationBatch({
    settingsRepository: createNotificationSettingsRepository(client),
    entryRepository: createEntryRepository(client),
    lineClient: createLineMessagingClient(),
  });
  return jsonData(result);
}
