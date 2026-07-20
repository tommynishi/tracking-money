-- import_files へ billing_month（取込時に指定した支払月）を追加する。
-- 取込履歴一覧で「この取込がどの支払月として登録されたか」を確認できるようにする。
-- 既存行（Phase 2 で作成された行）は entries.billing_month の実績から復元できないため、
-- 便宜上 created_at の月を初期値とする（取込確定前に破棄された analyzed/failed 行が主）。

alter table public.import_files add column billing_month text;

update public.import_files
  set billing_month = to_char(created_at, 'YYYY-MM')
  where billing_month is null;

alter table public.import_files alter column billing_month set not null;

alter table public.import_files
  add constraint chk_import_files_billing_month check (billing_month ~ '^\d{4}-(0[1-9]|1[0-2])$');
