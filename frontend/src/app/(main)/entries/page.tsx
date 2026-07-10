/**
 * SCR-03 明細一覧（ログイン後トップ・screen.md 2）。
 * 一覧UI（テーブル/カード・絞り込み・SCR-04 モーダル）は 1-8 の画面実装で追加する。
 */
export default function EntriesPage() {
  return (
    <section className="rounded-lg border border-border bg-surface p-6">
      <h1 className="text-lg font-semibold text-foreground">明細一覧</h1>
      <p className="mt-2 text-sm text-muted">
        ログインに成功しました。明細一覧のUIは後続タスクで実装します。
      </p>
    </section>
  );
}
