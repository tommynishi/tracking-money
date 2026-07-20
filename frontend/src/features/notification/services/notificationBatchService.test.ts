import { describe, expect, it, vi } from "vitest";

import type { NotificationSettings } from "../types";
import { runNotificationBatch } from "./notificationBatchService";

const NOW = new Date("2026-07-20T01:00:00Z"); // JST 2026-07-20 10:00

const baseTarget = (overrides: Partial<NotificationSettings> = {}): NotificationSettings & { lineUserId: string } => ({
  userId: "user-1",
  lineUserId: "line-user-1",
  monthlyEnabled: true,
  monthlyDay: 20,
  monthlyLastSentOn: null,
  inactivityEnabled: true,
  inactivityDays: 7,
  inactivityLastSentAt: null,
  ...overrides,
});

const createDeps = (target: ReturnType<typeof baseTarget>, lastActivityAt: string | null) => ({
  settingsRepository: {
    listBatchTargets: vi.fn().mockResolvedValue([target]),
    markMonthlySent: vi.fn().mockResolvedValue(undefined),
    markInactivitySent: vi.fn().mockResolvedValue(undefined),
  },
  entryRepository: { getLastCreatedAtByUser: vi.fn().mockResolvedValue(lastActivityAt) },
  lineClient: { pushText: vi.fn().mockResolvedValue(undefined) },
});

describe("runNotificationBatch", () => {
  it("monthly_day 一致・未送信なら月次通知を送る", async () => {
    const target = baseTarget({ inactivityEnabled: false });
    const deps = createDeps(target, null);

    const result = await runNotificationBatch(deps, NOW);
    expect(result.monthlySent).toBe(1);
    expect(deps.lineClient.pushText).toHaveBeenCalledWith("line-user-1", expect.any(String));
    expect(deps.settingsRepository.markMonthlySent).toHaveBeenCalledWith("user-1", "2026-07-20");
  });

  it("今月すでに送信済みなら送らない", async () => {
    const target = baseTarget({ inactivityEnabled: false, monthlyLastSentOn: "2026-07-20" });
    const deps = createDeps(target, null);

    const result = await runNotificationBatch(deps, NOW);
    expect(result.monthlySent).toBe(0);
    expect(deps.lineClient.pushText).not.toHaveBeenCalled();
  });

  it("monthly_day と異なる日は送らない", async () => {
    const target = baseTarget({ inactivityEnabled: false, monthlyDay: 1 });
    const deps = createDeps(target, null);

    const result = await runNotificationBatch(deps, NOW);
    expect(result.monthlySent).toBe(0);
  });

  it("月末繰上げ：monthly_day が月の日数を超える場合は月末に送る", async () => {
    const shortMonthNow = new Date("2026-02-28T01:00:00Z"); // JST 2026-02-28
    const target = baseTarget({ inactivityEnabled: false, monthlyDay: 31 });
    const deps = createDeps(target, null);

    const result = await runNotificationBatch(deps, shortMonthNow);
    expect(result.monthlySent).toBe(1);
  });

  it("未登録が inactivityDays 以上なら通知する", async () => {
    const target = baseTarget({ monthlyEnabled: false });
    const deps = createDeps(target, "2026-07-10T00:00:00Z"); // 10日経過

    const result = await runNotificationBatch(deps, NOW);
    expect(result.inactivitySent).toBe(1);
    expect(deps.settingsRepository.markInactivitySent).toHaveBeenCalled();
  });

  it("直近の活動から既に通知済みなら再送しない", async () => {
    const target = baseTarget({
      monthlyEnabled: false,
      inactivityLastSentAt: "2026-07-11T00:00:00Z",
    });
    const deps = createDeps(target, "2026-07-10T00:00:00Z");

    const result = await runNotificationBatch(deps, NOW);
    expect(result.inactivitySent).toBe(0);
  });

  it("明細登録が一度もない場合は未登録通知をスキップする", async () => {
    const target = baseTarget({ monthlyEnabled: false });
    const deps = createDeps(target, null);

    const result = await runNotificationBatch(deps, NOW);
    expect(result.inactivitySent).toBe(0);
  });

  it("送信失敗はログのみで処理を継続する", async () => {
    const target = baseTarget({ inactivityEnabled: false });
    const deps = createDeps(target, null);
    deps.lineClient.pushText.mockRejectedValue(new Error("LINE down"));
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);

    const result = await runNotificationBatch(deps, NOW);
    expect(result.monthlySent).toBe(0);
    expect(result.failedCount).toBe(1);
    errorSpy.mockRestore();
  });
});
