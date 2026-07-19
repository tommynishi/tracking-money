"use client";

/** SCR-08 アカウント設定（screen.md・FR-AUTH-04/05）。表示名変更。ログアウトはヘッダーから。 */
import { useState } from "react";

import { apiFetch, isApiError } from "@/shared/api/client";
import { Button } from "@/shared/components/Button";
import { useToast } from "@/shared/components/toast/ToastProvider";

import { useMe } from "../hooks/useMe";

export const ProfileScreen = () => {
  const { showToast } = useToast();
  const { me, state, retry, reload } = useMe();
  const [name, setName] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (name === null) return;
    setIsSaving(true);
    try {
      await apiFetch("/api/me", { method: "PATCH", body: JSON.stringify({ displayName: name }) });
      showToast({ type: "success", message: "表示名を変更しました" });
      await reload();
    } catch (error) {
      showToast({
        type: "error",
        message: isApiError(error) ? error.message : "表示名の変更に失敗しました",
      });
    } finally {
      setIsSaving(false);
    }
  };

  if (state === "loading") {
    return <div className="h-40 animate-pulse rounded-lg border border-border bg-surface" />;
  }
  if (state === "error" || me === null) {
    return (
      <section className="rounded-lg border border-border bg-surface p-6 text-center">
        <p className="text-sm text-danger">ユーザー情報の取得に失敗しました。</p>
        <Button className="mt-4" variant="secondary" onClick={retry}>
          再試行
        </Button>
      </section>
    );
  }

  return (
    <section className="mx-auto max-w-md space-y-4">
      <h1 className="text-lg font-semibold text-foreground">アカウント設定</h1>
      <div className="rounded-lg border border-border bg-surface p-6">
        <div className="flex items-center gap-4">
          {me.avatarUrl !== null && (
            // eslint-disable-next-line @next/next/no-img-element -- 外部（LINE）画像の等倍表示のみ
            <img src={me.avatarUrl} alt="" className="size-12 rounded-full" loading="lazy" />
          )}
          <p className="text-sm text-muted">LINEアカウントでログイン中</p>
        </div>
        <form onSubmit={handleSubmit} className="mt-4 space-y-4">
          <div>
            <label htmlFor="display-name" className="block text-sm font-medium text-foreground">
              表示名
            </label>
            <input
              id="display-name"
              required
              maxLength={50}
              value={name ?? me.displayName}
              onChange={(event) => setName(event.target.value)}
              className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground"
            />
          </div>
          <Button type="submit" isLoading={isSaving}>
            変更を保存
          </Button>
        </form>
      </div>
      <p className="text-xs text-muted">ログアウトは画面右上の「ログアウト」から行えます。</p>
    </section>
  );
};
