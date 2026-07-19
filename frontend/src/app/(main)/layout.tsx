/**
 * 認証後画面の共通レイアウト（FR-AUTH-02・architecture.md 5）。
 * 未認証はログイン画面へリダイレクトし、認証済みは AppShell（ヘッダー＋本文）で包む。
 */
import { redirect } from "next/navigation";

import { auth, signOut } from "@/auth";
import { AppShell } from "@/shared/components/AppShell";
import { buttonClassName } from "@/shared/components/buttonStyles";
import { ToastProvider } from "@/shared/components/toast/ToastProvider";

const LogoutButton = () => (
  <form
    action={async () => {
      "use server";
      await signOut({ redirectTo: "/login" });
    }}
  >
    <button type="submit" className={buttonClassName({ variant: "ghost" })}>
      ログアウト
    </button>
  </form>
);

export default async function MainLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session?.user) {
    redirect("/login");
  }

  return (
    <ToastProvider>
      <AppShell actions={<LogoutButton />}>{children}</AppShell>
    </ToastProvider>
  );
}
