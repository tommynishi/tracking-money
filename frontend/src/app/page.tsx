import { redirect } from "next/navigation";

/** ルートはログイン後トップ（ダッシュボード）へ委譲する（Phase 3 導入後・screen.md 2）。 */
export default function Home() {
  redirect("/dashboard");
}
