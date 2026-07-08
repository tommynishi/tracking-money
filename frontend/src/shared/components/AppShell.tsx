/**
 * 認証後画面の共通レイアウト（ヘッダー＋本文・ui-rules §1）。
 * Auth・route group 導入（schedule 1-2）後、認証済みレイアウトから利用する。
 * 帳簿切替（ledger switcher）は ledgers API（1-2/1-5）に依存するため後続スライスで追加する。
 */
import { ThemeToggle } from "@/shared/theme/ThemeToggle";

export const AppShell = ({ children }: { children: React.ReactNode }) => {
  return (
    <div className="flex min-h-full flex-col">
      <header className="border-b border-border bg-surface">
        <div className="mx-auto flex w-full max-w-5xl items-center justify-between gap-4 px-4 py-3">
          <span className="text-base font-semibold text-foreground">Tracking Money</span>
          <ThemeToggle />
        </div>
      </header>
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-6">{children}</main>
    </div>
  );
};
