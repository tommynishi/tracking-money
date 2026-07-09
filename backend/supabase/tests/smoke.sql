-- スキーマ／RPC スモークテスト（schedule 1-1〜1-8 の DB 面の検証）。
--
-- 目的: `supabase db reset` 後に、7テーブル・RPC関数一式・RLS が揃い、主要 RPC が期待どおり
--       動くことを1回で確認する。何も残さないよう最後に ROLLBACK する。
--
-- 実行方法（いずれか）:
--   * Supabase Studio の SQL Editor に貼り付けて実行
--   * psql: psql "$(supabase status -o env | grep '^DB_URL=' | cut -d= -f2-)" -f supabase/tests/smoke.sql
--
-- 成功時は最後に「SMOKE OK」の NOTICE が出る。いずれかの検証が失敗すると exception で停止する。

begin;

-- =============================================================================
-- 1. 構造チェック（テーブル・RPC関数・RLS）
-- =============================================================================
do $$
declare
  v_missing text;
begin
  select string_agg(t, ', ') into v_missing
  from unnest(array[
    'users', 'ledgers', 'ledger_members', 'ledger_invitations',
    'categories', 'entries', 'notification_settings'
  ]) as t
  where not exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = t
  );
  if v_missing is not null then
    raise exception 'Missing tables: %', v_missing;
  end if;

  select string_agg(f, ', ') into v_missing
  from unnest(array[
    'set_updated_at', 'create_ledger_with_defaults', 'delete_ledger_cascade',
    'delete_category_with_reassign', 'reorder_categories', 'accept_family_invitation',
    'assert_no_family_membership'
  ]) as f
  where not exists (
    select 1 from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = f
  );
  if v_missing is not null then
    raise exception 'Missing functions: %', v_missing;
  end if;

  select string_agg(c.relname, ', ') into v_missing
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and c.relkind = 'r'
    and c.relname in (
      'users', 'ledgers', 'ledger_members', 'ledger_invitations',
      'categories', 'entries', 'notification_settings'
    )
    and c.relrowsecurity = false;
  if v_missing is not null then
    raise exception 'RLS disabled on: %', v_missing;
  end if;

  raise notice 'STRUCTURE OK';
end $$;

-- =============================================================================
-- 2. RPC スモーク（作成 → 招待・承諾 → カテゴリ付け替え削除 → cascade 削除）
-- =============================================================================
do $$
declare
  v_owner uuid;
  v_owner2 uuid;
  v_invitee uuid;
  v_categories jsonb;
  v_personal public.ledgers;
  v_family public.ledgers;
  v_family2 public.ledgers;
  v_count int;
  v_invitation_id uuid;
  v_invitation2_id uuid;
  v_system_cat uuid;
  v_target_cat uuid;
begin
  -- デフォルトカテゴリ（frontend の buildDefaultCategories と一致する14件）
  select jsonb_agg(
    jsonb_build_object('name', name, 'isFixedCost', is_fixed, 'isSystem', is_sys, 'sortOrder', ord)
  )
  into v_categories
  from (
    values
      ('食費', false, false, 0), ('日用品', false, false, 1), ('交通費', false, false, 2),
      ('住居', true, false, 3), ('水道光熱費', true, false, 4), ('通信費', true, false, 5),
      ('保険', true, false, 6), ('医療', false, false, 7), ('教育', false, false, 8),
      ('娯楽', false, false, 9), ('被服', false, false, 10), ('交際費', false, false, 11),
      ('サブスク', false, false, 12), ('その他', false, true, 13)
  ) as defs(name, is_fixed, is_sys, ord);

  insert into public.users (line_user_id, display_name)
    values ('U_smoke_owner', 'オーナー') returning id into v_owner;
  insert into public.users (line_user_id, display_name)
    values ('U_smoke_invitee', 'ゲスト') returning id into v_invitee;

  -- create_ledger_with_defaults: 14カテゴリ＋ownerメンバーが原子的に作られる
  v_personal := public.create_ledger_with_defaults(v_owner, 'personal', '個人', v_categories);

  select count(*) into v_count
    from public.categories where ledger_id = v_personal.id and deleted_at is null;
  assert v_count = 14, format('expected 14 categories, got %s', v_count);

  select count(*) into v_count
    from public.ledger_members where ledger_id = v_personal.id and deleted_at is null;
  assert v_count = 1, format('expected 1 owner member, got %s', v_count);

  -- accept_family_invitation: 招待→承諾でメンバーが2名になる
  v_family := public.create_ledger_with_defaults(v_owner, 'family', '家族', v_categories);
  insert into public.ledger_invitations (ledger_id, inviter_user_id, invitee_user_id, status)
    values (v_family.id, v_owner, v_invitee, 'pending') returning id into v_invitation_id;

  perform public.accept_family_invitation(v_invitation_id, v_invitee, null);

  select count(*) into v_count
    from public.ledger_members where ledger_id = v_family.id and deleted_at is null;
  assert v_count = 2, format('expected 2 members after accept, got %s', v_count);
  assert (select status from public.ledger_invitations where id = v_invitation_id) = 'accepted',
    'invitation should be accepted';

  -- FR-LEDGER-05 バックストップ: 既に家族家計簿へ所属していると FML01 で失敗する
  insert into public.users (line_user_id, display_name)
    values ('U_smoke_owner2', 'オーナー2') returning id into v_owner2;
  v_family2 := public.create_ledger_with_defaults(v_owner2, 'family', '家族2', v_categories);
  insert into public.ledger_invitations (ledger_id, inviter_user_id, invitee_user_id, status)
    values (v_family2.id, v_owner2, v_invitee, 'pending') returning id into v_invitation2_id;

  begin
    perform public.accept_family_invitation(v_invitation2_id, v_invitee, null);
    raise exception 'accept guard should reject a second family membership';
  exception
    when sqlstate 'FML01' then null; -- 期待どおり
  end;

  begin
    perform public.create_ledger_with_defaults(v_invitee, 'family', '家族3', v_categories);
    raise exception 'create guard should reject a family ledger while belonging to one';
  exception
    when sqlstate 'FML01' then null; -- 期待どおり
  end;

  -- delete_category_with_reassign: 使用中明細を「その他」へ付け替えてから論理削除
  select id into v_system_cat
    from public.categories where ledger_id = v_personal.id and is_system and deleted_at is null;
  select id into v_target_cat
    from public.categories where ledger_id = v_personal.id and name = '食費' and deleted_at is null;

  insert into public.entries
    (ledger_id, category_id, used_on, amount, description, normalized_description, source, created_by_user_id)
    values (v_personal.id, v_target_cat, '2026-07-01', 1000, 'テスト', 'てすと', 'manual', v_owner);

  perform public.delete_category_with_reassign(v_personal.id, v_target_cat, v_system_cat);

  assert (select category_id from public.entries where ledger_id = v_personal.id limit 1) = v_system_cat,
    'entry should be reassigned to system category';
  assert (select deleted_at from public.categories where id = v_target_cat) is not null,
    'category should be soft-deleted';

  -- reorder_categories: 現在の有効カテゴリを逆順で渡し、sort_order が振り直されることを確認
  perform public.reorder_categories(
    v_personal.id,
    array(
      select id from public.categories
      where ledger_id = v_personal.id and deleted_at is null
      order by sort_order desc
    )
  );
  -- 逆順投入により、元が最後尾だった「その他」が先頭（sort_order = 0）になる
  assert (select sort_order from public.categories where id = v_system_cat) = 0,
    'reorder should move system category to the front';

  -- delete_ledger_cascade: 家計簿と子データ（メンバー含む）を論理削除
  perform public.delete_ledger_cascade(v_family.id);
  assert (select deleted_at from public.ledgers where id = v_family.id) is not null,
    'family ledger should be soft-deleted';
  assert (select count(*) from public.ledger_members where ledger_id = v_family.id and deleted_at is null) = 0,
    'family members should be soft-deleted';

  raise notice 'RPC SMOKE OK';
end $$;

-- 検証のみ。データは残さない。
rollback;
-- 成功の判定は NOTICE「STRUCTURE OK」「RPC SMOKE OK」の両方が出ること。
-- いずれかの assert が失敗すると exception で停止する（psql は -v ON_ERROR_STOP=1 推奨）。
