/**
 * SCR-01 ログイン（screen.md・FR-AUTH-01/02）。
 * 「LINEでログイン」から Auth.js のサインインを開始し、成功時はダッシュボードへ着地する
 * （Phase 3 でダッシュボード導入後のログイン後トップは /dashboard・screen.md 2）。
 */
import { redirect } from "next/navigation";

import { auth, signIn } from "@/auth";
import { buttonClassName } from "@/shared/components/buttonStyles";

const LOGIN_ERROR_MESSAGE = "LINEログインに失敗しました。もう一度お試しください。";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const session = await auth();
  if (session?.user) {
    redirect("/dashboard");
  }

  const { error } = await searchParams;

  return (
    <main className="flex min-h-full flex-1 items-center justify-center px-4">
      <section className="w-full max-w-sm rounded-lg border border-border bg-surface p-8 text-center">
        <h1 className="text-2xl font-bold text-foreground">Tracking Money</h1>
        <p className="mt-2 text-sm text-muted">AIを活用した家計簿・資産管理アプリ</p>

        {error !== undefined && (
          <p role="alert" className="mt-4 rounded-md bg-danger/10 px-3 py-2 text-sm text-danger">
            {LOGIN_ERROR_MESSAGE}
          </p>
        )}

        <form
          className="mt-6"
          action={async () => {
            "use server";
            await signIn("line", { redirectTo: "/entries" });
          }}
        >
          <button type="submit" className={buttonClassName({ fullWidth: true })}>
            LINEでログイン
          </button>
        </form>
      </section>
    </main>
  );
}
