-- Phase 1-1 初期スキーマ（schedule.md 1-1 / database.md §3）。
-- 対象テーブル: users / ledgers / ledger_members / ledger_invitations / categories / entries / notification_settings
--
-- 設計方針（database.md §1）:
--   * 共通カラム: id(uuid) / created_at / updated_at / deleted_at（論理削除。NULL=有効）
--   * 区分値は enum 型ではなく text + CHECK 制約
--   * 一意制約は論理削除と両立させるため部分ユニークインデックス（WHERE deleted_at IS NULL）で実現
--   * FK は ON DELETE RESTRICT を基本（参照先の物理削除は行わない前提・§1.2）
--   * 全テーブルで RLS を有効化し anon ポリシーは作らない（service role 経由のみアクセス・§1.3）
--
-- Phase 境界（schedule.md 運用ルール「Phaseをまたぐ先行実装は行わない」）:
--   * ledgers.drive_folder_id は Phase 2-1 で追加する（本migrationには含めない）
--   * entries.import_file_id はカラムのみ用意し、import_files への FK は Phase 2-1 で付与する
--   * import_files / csv_column_mappings / category_rules(Phase 2) / analysis_caches(Phase 3) は作成しない

-- =============================================================================
-- 共通: updated_at 自動更新トリガー関数
-- =============================================================================
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- =============================================================================
-- users（ユーザー・database.md 3.1）
-- =============================================================================
create table public.users (
  id uuid primary key default gen_random_uuid(),
  line_user_id text not null,
  display_name text not null,
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create unique index uq_users_line_user_id
  on public.users (line_user_id)
  where deleted_at is null;

create trigger trg_users_updated_at
  before update on public.users
  for each row execute function public.set_updated_at();

alter table public.users enable row level security;

-- =============================================================================
-- ledgers（家計簿・database.md 3.2）
-- =============================================================================
create table public.ledgers (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references public.users (id) on delete restrict,
  type text not null,
  name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint chk_ledgers_type check (type in ('personal', 'family'))
);

-- 個人1つ・家族1つを保証（§3.2）
create unique index uq_ledgers_owner_type
  on public.ledgers (owner_user_id, type)
  where deleted_at is null;

create trigger trg_ledgers_updated_at
  before update on public.ledgers
  for each row execute function public.set_updated_at();

alter table public.ledgers enable row level security;

-- =============================================================================
-- ledger_members（家計簿メンバー・database.md 3.3）
-- =============================================================================
create table public.ledger_members (
  id uuid primary key default gen_random_uuid(),
  ledger_id uuid not null references public.ledgers (id) on delete restrict,
  user_id uuid not null references public.users (id) on delete restrict,
  role text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint chk_ledger_members_role check (role in ('owner', 'member'))
);

create unique index uq_ledger_members_ledger_user
  on public.ledger_members (ledger_id, user_id)
  where deleted_at is null;

-- 自分の所属帳簿の取得用（§3.3）
create index idx_ledger_members_user
  on public.ledger_members (user_id)
  where deleted_at is null;

create trigger trg_ledger_members_updated_at
  before update on public.ledger_members
  for each row execute function public.set_updated_at();

alter table public.ledger_members enable row level security;

-- =============================================================================
-- ledger_invitations（家族招待・database.md 3.4）
-- =============================================================================
create table public.ledger_invitations (
  id uuid primary key default gen_random_uuid(),
  ledger_id uuid not null references public.ledgers (id) on delete restrict,
  inviter_user_id uuid not null references public.users (id) on delete restrict,
  invitee_user_id uuid not null references public.users (id) on delete restrict,
  status text not null,
  responded_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint chk_ledger_invitations_status
    check (status in ('pending', 'accepted', 'declined', 'canceled'))
);

-- 同一相手への重複招待防止（pending のみ・§3.4）
create unique index uq_ledger_invitations_pending
  on public.ledger_invitations (ledger_id, invitee_user_id)
  where status = 'pending' and deleted_at is null;

-- 自分宛の招待一覧用（§3.4）
create index idx_ledger_invitations_invitee_status
  on public.ledger_invitations (invitee_user_id, status)
  where deleted_at is null;

create trigger trg_ledger_invitations_updated_at
  before update on public.ledger_invitations
  for each row execute function public.set_updated_at();

alter table public.ledger_invitations enable row level security;

-- =============================================================================
-- categories（カテゴリ・database.md 3.5）
-- デフォルトカテゴリは Service 層が家計簿作成時に投入する（§5。グローバル seed は作らない）
-- =============================================================================
create table public.categories (
  id uuid primary key default gen_random_uuid(),
  ledger_id uuid not null references public.ledgers (id) on delete restrict,
  name text not null,
  is_fixed_cost boolean not null default false,
  is_system boolean not null default false,
  sort_order integer not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create unique index uq_categories_ledger_name
  on public.categories (ledger_id, name)
  where deleted_at is null;

create index idx_categories_ledger_sort
  on public.categories (ledger_id, sort_order)
  where deleted_at is null;

create trigger trg_categories_updated_at
  before update on public.categories
  for each row execute function public.set_updated_at();

alter table public.categories enable row level security;

-- =============================================================================
-- entries（明細・database.md 3.6）
-- import_file_id は Phase 2 の import_files への FK を後付けする前提でカラムのみ用意
-- =============================================================================
create table public.entries (
  id uuid primary key default gen_random_uuid(),
  ledger_id uuid not null references public.ledgers (id) on delete restrict,
  category_id uuid not null references public.categories (id) on delete restrict,
  used_on date not null,
  amount integer not null,
  description text not null,
  normalized_description text not null,
  payment_method text,
  memo text,
  type text not null default 'expense',
  source text not null,
  import_file_id uuid, -- FK -> import_files.id は Phase 2-1 で付与
  created_by_user_id uuid not null references public.users (id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint chk_entries_type check (type in ('expense')),
  constraint chk_entries_source check (source in ('manual', 'csv', 'pdf'))
);

-- 月次一覧・期間絞込用（§3.6）
create index idx_entries_ledger_used_on
  on public.entries (ledger_id, used_on desc)
  where deleted_at is null;

-- カテゴリ別集計用（§3.6）
create index idx_entries_ledger_category_used_on
  on public.entries (ledger_id, category_id, used_on)
  where deleted_at is null;

-- 重複チェック用（FR-DUP-01・§3.6）
create index idx_entries_dup_check
  on public.entries (ledger_id, used_on, amount, normalized_description)
  where deleted_at is null;

create trigger trg_entries_updated_at
  before update on public.entries
  for each row execute function public.set_updated_at();

alter table public.entries enable row level security;

-- =============================================================================
-- notification_settings（通知設定・database.md 3.10）
-- ユーザー作成時に既定値で自動作成する（Service 層）
-- =============================================================================
create table public.notification_settings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete restrict,
  monthly_enabled boolean not null default true,
  monthly_day smallint not null default 1,
  monthly_last_sent_on date,
  inactivity_enabled boolean not null default true,
  inactivity_days smallint not null default 7,
  inactivity_last_sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint chk_notification_settings_monthly_day check (monthly_day between 1 and 31),
  constraint chk_notification_settings_inactivity_days check (inactivity_days between 1 and 90)
);

create unique index uq_notification_settings_user
  on public.notification_settings (user_id)
  where deleted_at is null;

create trigger trg_notification_settings_updated_at
  before update on public.notification_settings
  for each row execute function public.set_updated_at();

alter table public.notification_settings enable row level security;
