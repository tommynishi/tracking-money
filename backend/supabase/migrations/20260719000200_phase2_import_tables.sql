-- Phase 2-1：インポート関連テーブル（database.md 3.7〜3.9・§1.2 共通カラム）
--   * import_files（取込履歴・FR-CSV-05 / FR-DRIVE-01〜06 / FR-DUP-03）
--   * csv_column_mappings（汎用CSV列マッピング・FR-CSV-02）
--   * category_rules（カテゴリ学習ルール・FR-AICAT-03）
--   * ledgers.drive_folder_id 追加（FR-DRIVE-02）
--   * entries.import_file_id へ FK 付与（Phase 1 でカラムのみ用意済み）
-- 権限は 20260719000100 の default privileges により service_role のみ DML 可。

-- =============================================================================
-- import_files（取込履歴・database.md 3.7）
-- =============================================================================
create table public.import_files (
  id uuid primary key default gen_random_uuid(),
  ledger_id uuid not null references public.ledgers (id) on delete restrict,
  uploaded_by_user_id uuid not null references public.users (id) on delete restrict,
  file_name text not null,
  file_type text not null,
  file_hash text not null,
  format text not null,
  status text not null,
  imported_count integer not null default 0,
  skipped_count integer not null default 0,
  error_count integer not null default 0,
  error_detail jsonb,
  drive_file_id text,
  drive_web_view_link text,
  drive_status text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint chk_import_files_file_type check (file_type in ('csv', 'pdf')),
  constraint chk_import_files_format
    check (format in ('rakuten', 'jcb', 'epos', 'saison', 'generic', 'pdf')),
  constraint chk_import_files_status
    check (status in ('analyzed', 'completed', 'partial', 'failed')),
  constraint chk_import_files_drive_status check (drive_status in ('uploaded', 'failed'))
);

-- 同一ファイル警告用（強制取込を許すため UNIQUE にしない・FR-DUP-03）
create index idx_import_files_ledger_hash
  on public.import_files (ledger_id, file_hash)
  where deleted_at is null;

-- 取込履歴一覧用（SCR-10）
create index idx_import_files_ledger_created
  on public.import_files (ledger_id, created_at desc)
  where deleted_at is null;

create trigger trg_import_files_updated_at
  before update on public.import_files
  for each row execute function public.set_updated_at();

alter table public.import_files enable row level security;

-- =============================================================================
-- csv_column_mappings（汎用CSV列マッピング・database.md 3.8）
-- mapping の中身は zod でアプリ側検証（headerRows / usedOnColumn / 等）
-- =============================================================================
create table public.csv_column_mappings (
  id uuid primary key default gen_random_uuid(),
  ledger_id uuid not null references public.ledgers (id) on delete restrict,
  name text not null,
  mapping jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create unique index uq_csv_column_mappings_ledger_name
  on public.csv_column_mappings (ledger_id, name)
  where deleted_at is null;

create trigger trg_csv_column_mappings_updated_at
  before update on public.csv_column_mappings
  for each row execute function public.set_updated_at();

alter table public.csv_column_mappings enable row level security;

-- =============================================================================
-- category_rules（カテゴリ学習ルール・database.md 3.9）
-- 取込時に AI 判定より優先する（FR-AICAT-03）
-- =============================================================================
create table public.category_rules (
  id uuid primary key default gen_random_uuid(),
  ledger_id uuid not null references public.ledgers (id) on delete restrict,
  normalized_description text not null,
  category_id uuid not null references public.categories (id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create unique index uq_category_rules_ledger_description
  on public.category_rules (ledger_id, normalized_description)
  where deleted_at is null;

create trigger trg_category_rules_updated_at
  before update on public.category_rules
  for each row execute function public.set_updated_at();

alter table public.category_rules enable row level security;

-- =============================================================================
-- ledgers.drive_folder_id（database.md 3.2・FR-DRIVE-02）
-- 初回インポート時に作成して保存する（Drive 未使用の間は NULL）
-- =============================================================================
alter table public.ledgers add column drive_folder_id text;

-- =============================================================================
-- entries.import_file_id へ FK 付与（database.md 3.6・Phase 1 で予約済み）
-- =============================================================================
alter table public.entries
  add constraint fk_entries_import_file
  foreign key (import_file_id) references public.import_files (id) on delete restrict;
