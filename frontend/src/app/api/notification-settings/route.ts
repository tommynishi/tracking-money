/** 通知設定API（api.md 10.1 / 10.2・FR-NOTIFY-03）。 */
import { z } from "zod";

import { handleApiError, jsonData } from "@/shared/api/response";
import { requireUserId } from "@/shared/api/session";
import { getSupabaseServerClient } from "@/shared/lib/supabaseServer";

import { createNotificationSettingsRepository } from "@/features/notification/repositories/notificationSettingsRepository";

const patchBodySchema = z.object({
  monthlyEnabled: z.boolean().optional(),
  monthlyDay: z.number().int().min(1).max(31).optional(),
  inactivityEnabled: z.boolean().optional(),
  inactivityDays: z.number().int().min(1).max(90).optional(),
});

export async function GET(): Promise<Response> {
  try {
    const userId = await requireUserId();
    const repository = createNotificationSettingsRepository(getSupabaseServerClient());
    const settings = await repository.getOrCreateByUserId(userId);
    return jsonData(settings);
  } catch (error) {
    return handleApiError(error);
  }
}

export async function PATCH(request: Request): Promise<Response> {
  try {
    const userId = await requireUserId();
    const body = patchBodySchema.parse(await request.json());
    const repository = createNotificationSettingsRepository(getSupabaseServerClient());
    await repository.getOrCreateByUserId(userId);
    const settings = await repository.updateByUserId(userId, body);
    return jsonData(settings);
  } catch (error) {
    return handleApiError(error);
  }
}
