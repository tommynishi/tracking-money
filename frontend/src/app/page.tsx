import { AppShell } from "@/shared/components/AppShell";

export default function Home() {
  return (
    <AppShell>
      <section className="rounded-lg border border-border bg-surface p-6">
        <h1 className="text-lg font-semibold text-foreground">Tracking Money</h1>
        <p className="mt-2 text-sm text-muted">
          共通レイアウト・テーマ基盤の準備が整いました。ログイン（LINE）と家計簿画面は後続の Phase 1
          タスクで追加します。
        </p>
      </section>
    </AppShell>
  );
}
