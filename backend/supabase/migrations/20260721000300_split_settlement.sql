-- 家族家計簿限定の按分・精算機能（FR-SPLIT・database.md 3.3 / 3.6・architecture.md 3.4）。
-- ledger_members に既定按分比重（expense_weight）、entries に支払者・按分方法を追加する。
-- 精算計算はキャッシュを持たず都度JS集計するため、新規テーブルは作らない。

alter table public.ledger_members
  add column expense_weight integer not null default 1;

alter table public.ledger_members
  add constraint chk_ledger_members_expense_weight check (expense_weight > 0);

alter table public.entries
  add column paid_by_user_id uuid references public.users (id) on delete restrict;

update public.entries
  set paid_by_user_id = created_by_user_id
  where paid_by_user_id is null;

alter table public.entries
  alter column paid_by_user_id set not null;

alter table public.entries
  add column split_type text not null default 'default',
  add column split_shares jsonb,
  add column assigned_user_id uuid references public.users (id) on delete restrict;

alter table public.entries
  add constraint chk_entries_split_type check (split_type in ('default', 'custom', 'assigned')),
  add constraint chk_entries_split_assigned
    check ((split_type = 'assigned') = (assigned_user_id is not null)),
  add constraint chk_entries_split_custom
    check ((split_type = 'custom') = (split_shares is not null));
