-- entries へ billing_month（支払月）を追加する。
-- カード明細は利用日（used_on）と実際に請求される月（billing_month）がズレることがあるため
-- （例：6/23利用が7月請求）、両方を独立して保持し、一覧の絞り込み・集計は billing_month を基準とする。
-- 既存行は利用日の月を初期値として一括設定する。

alter table public.entries add column billing_month text;

update public.entries
  set billing_month = to_char(used_on, 'YYYY-MM')
  where billing_month is null;

alter table public.entries alter column billing_month set not null;

alter table public.entries
  add constraint chk_entries_billing_month check (billing_month ~ '^\d{4}-(0[1-9]|1[0-2])$');

-- 一覧の絞り込み・集計（月次サマリー等）で billing_month を条件にする（database.md 3.6）
create index idx_entries_ledger_billing_month
  on public.entries (ledger_id, billing_month)
  where deleted_at is null;
