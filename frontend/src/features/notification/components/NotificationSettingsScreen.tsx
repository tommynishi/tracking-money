"use client";

/** SCR-12 通知設定（screen.md・FR-NOTIFY-01〜03）。 */
import { useEffect, useState } from "react";

import { apiFetch, isApiError } from "@/shared/api/client";
import { useToast } from "@/shared/components/toast/ToastProvider";

type Settings = {
  readonly monthlyEnabled: boolean;
  readonly monthlyDay: number;
  readonly inactivityEnabled: boolean;
  readonly inactivityDays: number;
};

type LoadState = "loading" | "ready" | "error";

export const NotificationSettingsScreen = () => {
  const { showToast } = useToast();
  const [state, setState] = useState<LoadState>("loading");
  const [settings, setSettings] = useState<Settings | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    apiFetch<Settings>("/api/notification-settings")
      .then(({ data }) => {
        setSettings(data);
        setState("ready");
      })
      .catch(() => setState("error"));
  }, []);

  const save = async (patch: Partial<Settings>) => {
    if (settings === null) return;
    const next = { ...settings, ...patch };
    setSettings(next);
    setIsSaving(true);
    try {
      await apiFetch<Settings>("/api/notification-settings", {
        method: "PATCH",
        body: JSON.stringify(patch),
      });
      showToast({ type: "success", message: "通知設定を更新しました" });
    } catch (error) {
      showToast({ type: "error", message: isApiError(error) ? error.message : "更新に失敗しました" });
    } finally {
      setIsSaving(false);
    }
  };

  if (state === "loading" || settings === null) {
    return <div className="h-40 animate-pulse rounded-lg border border-border bg-surface" />;
  }
  if (state === "error") {
    return (
      <section className="rounded-lg border border-border bg-surface p-6 text-center">
        <p className="text-sm text-danger">通知設定の取得に失敗しました。</p>
      </section>
    );
  }

  return (
    <section className="space-y-4">
      <h1 className="text-lg font-semibold text-foreground">通知設定</h1>
      <p className="text-sm text-muted">通知はLINEへ送信されます。</p>

      <div className="space-y-4 rounded-lg border border-border bg-surface p-4">
        <div className="flex items-center justify-between gap-4">
          <div>
            <label htmlFor="monthly-enabled" className="text-sm font-medium text-foreground">
              月次リマインド
            </label>
            <p className="text-xs text-muted">毎月指定した日に明細取込を促す通知を送ります。</p>
          </div>
          <input
            id="monthly-enabled"
            type="checkbox"
            checked={settings.monthlyEnabled}
            disabled={isSaving}
            onChange={(event) => void save({ monthlyEnabled: event.target.checked })}
            className="size-5"
          />
        </div>
        <div className="flex items-center gap-3">
          <label htmlFor="monthly-day" className="text-sm text-foreground">
            通知日
          </label>
          <select
            id="monthly-day"
            value={settings.monthlyDay}
            disabled={isSaving || !settings.monthlyEnabled}
            onChange={(event) => void save({ monthlyDay: Number(event.target.value) })}
            className="rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground"
          >
            {Array.from({ length: 31 }, (_, i) => i + 1).map((day) => (
              <option key={day} value={day}>
                {day}日
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="space-y-4 rounded-lg border border-border bg-surface p-4">
        <div className="flex items-center justify-between gap-4">
          <div>
            <label htmlFor="inactivity-enabled" className="text-sm font-medium text-foreground">
              未登録リマインド
            </label>
            <p className="text-xs text-muted">一定期間、明細の登録がない場合に通知します。</p>
          </div>
          <input
            id="inactivity-enabled"
            type="checkbox"
            checked={settings.inactivityEnabled}
            disabled={isSaving}
            onChange={(event) => void save({ inactivityEnabled: event.target.checked })}
            className="size-5"
          />
        </div>
        <div className="flex items-center gap-3">
          <label htmlFor="inactivity-days" className="text-sm text-foreground">
            未登録とみなす日数
          </label>
          <select
            id="inactivity-days"
            value={settings.inactivityDays}
            disabled={isSaving || !settings.inactivityEnabled}
            onChange={(event) => void save({ inactivityDays: Number(event.target.value) })}
            className="rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground"
          >
            {[3, 5, 7, 10, 14, 21, 30].map((days) => (
              <option key={days} value={days}>
                {days}日
              </option>
            ))}
          </select>
        </div>
      </div>
    </section>
  );
};
