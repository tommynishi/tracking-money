-- Phase 3-3 マイグレーション（schedule.md 3-3 / database.md 3.11）。
-- analysis_caches：AI分析結果のキャッシュ（NFR-13）。派生データのため論理削除せず物理削除を許可する。

create table public.analysis_caches (
  id uuid primary key default gen_random_uuid(),
  ledger_id uuid not null references public.ledgers (id) on delete restrict,
  analysis_type text not null,
  period_key text not null,
  input_hash text not null,
  result jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint chk_analysis_caches_type
    check (analysis_type in ('monthly_review', 'fixed_cost', 'saving_advice', 'forecast'))
);

create unique index uq_analysis_caches_ledger_type_period
  on public.analysis_caches (ledger_id, analysis_type, period_key);

create trigger trg_analysis_caches_updated_at
  before update on public.analysis_caches
  for each row execute function public.set_updated_at();

alter table public.analysis_caches enable row level security;
