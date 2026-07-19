import { redirect } from "next/navigation";

/** ルートは Phase 1〜2 のログイン後トップ（明細一覧）へ委譲する（screen.md 2）。 */
export default function Home() {
  redirect("/entries");
}
