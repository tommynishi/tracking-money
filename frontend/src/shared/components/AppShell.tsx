/**
 * 認証後画面の共通レイアウト（ヘッダー＋本文・ui-rules §1）。
 * ヘッダーには全画面共通の家計簿切替（LedgerSwitcher）を常時表示する。
 */
import Link from "next/link";

import { ThemeToggle } from "@/shared/theme/ThemeToggle";

import { LedgerSwitcher } from "@/features/ledger/components/LedgerSwitcher";

/** グローバルナビゲーション（screen.md 3.1）。取込履歴は取込画面から遷移する。 */
const NAV_ITEMS = [
  { href: "/dashboard", label: "ダッシュボード" },
  { href: "/entries", label: "明細" },
  { href: "/import", label: "取込" },
  { href: "/analysis", label: "分析" },
  { href: "/categories", label: "カテゴリ" },
  { href: "/ledger", label: "家計簿" },
  { href: "/invitations", label: "招待" },
  { href: "/settings/notifications", label: "通知設定" },
  { href: "/settings/profile", label: "アカウント" },
] as const;

export const AppShell = ({
  children,
  actions,
}: {
  children: React.ReactNode;
  /** ヘッダー右側に追加する操作（ログアウト等）。 */
  actions?: React.ReactNode;
}) => {
  return (
    <div className="flex min-h-full flex-col">
      <header className="border-b border-border bg-surface">
        <div className="mx-auto flex w-full max-w-5xl items-center justify-between gap-4 px-4 py-3">
          <span className="text-base font-semibold text-foreground">Tracking Money</span>
          <div className="flex items-center gap-2">
            <LedgerSwitcher />
            {actions}
            <ThemeToggle />
          </div>
        </div>
        <nav aria-label="グローバルナビゲーション" className="mx-auto w-full max-w-5xl px-4">
          <ul className="flex gap-1 overflow-x-auto pb-2 text-sm">
            {NAV_ITEMS.map((item) => (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className="inline-block rounded-md px-3 py-1.5 whitespace-nowrap text-foreground hover:bg-background"
                >
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      </header>
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-6">{children}</main>
    </div>
  );
};
