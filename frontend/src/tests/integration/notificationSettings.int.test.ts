/** 通知設定API（api.md 10.1 / 10.2・FR-NOTIFY-03）の Integration Test。 */
import { describe, expect, it, vi } from "vitest";

vi.mock("@/auth", () => ({ auth: vi.fn() }));

import { GET as getSettings, PATCH as patchSettings } from "@/app/api/notification-settings/route";

import { createTestUser, expectErrorCode, jsonRequest, readData, signInAs, signOutSession } from "./helpers";

describe("通知設定API", () => {
  it("未認証は 401", async () => {
    signOutSession();
    const response = await getSettings();
    await expectErrorCode(response, 401, "UNAUTHENTICATED");
  });

  it("初回アクセスで既定値が作成され、PATCHで更新できる", async () => {
    const user = await createTestUser("通知設定ユーザー");
    signInAs(user.id);

    const initial = await readData<{ monthlyEnabled: boolean; monthlyDay: number; inactivityDays: number }>(
      await getSettings(),
    );
    expect(initial).toMatchObject({ monthlyEnabled: true, monthlyDay: 1, inactivityDays: 7 });

    const updated = await readData<{ monthlyDay: number; inactivityDays: number }>(
      await patchSettings(
        jsonRequest("/api/notification-settings", "PATCH", { monthlyDay: 15, inactivityDays: 14 }),
      ),
    );
    expect(updated).toMatchObject({ monthlyDay: 15, inactivityDays: 14 });

    const refetched = await readData<{ monthlyDay: number }>(await getSettings());
    expect(refetched.monthlyDay).toBe(15);
  });

  it("不正な値は 400", async () => {
    const user = await createTestUser("通知設定不正値ユーザー");
    signInAs(user.id);
    const response = await patchSettings(
      jsonRequest("/api/notification-settings", "PATCH", { monthlyDay: 32 }),
    );
    await expectErrorCode(response, 400, "VALIDATION_ERROR");
  });
});
