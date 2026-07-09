-- FR-LEDGER-05（家族家計簿は1ユーザー1つ）のDB側バックストップ（database.md §5）。
--
-- 背景: Service 層の事前検証は RPC 実行前の読み取りのため、同時実行（複数招待の同時承諾、
-- 家族家計簿の作成と招待承諾の同時実行）では二重所属を防げない。所属はテーブルを跨ぐため
-- （ledger_members × ledgers.type）宣言的な unique index では表現できず、対象ユーザー単位の
-- advisory lock で書き込みを直列化し、挿入直前に有効な家族所属が無いことを検証する。
--
-- 家族所属を書き込む経路は accept_family_invitation / create_ledger_with_defaults の2 RPC のみ。
-- 違反時は SQLSTATE 'FML01'（独自コード）で raise し、アプリ側で 409 Conflict へ変換する。

-- =============================================================================
-- 家族所属ガード（共通関数）
-- 呼び出し元トランザクション終了まで対象ユーザーの家族所属変更を直列化し、
-- 有効な家族家計簿への所属が既に存在すれば FML01 で失敗させる。
-- =============================================================================
create or replace function public.assert_no_family_membership(p_user_id uuid)
returns void
language plpgsql
set search_path = ''
as $$
begin
  perform pg_advisory_xact_lock(hashtext('family_membership'), hashtext(p_user_id::text));

  if exists (
    select 1
      from public.ledger_members m
      join public.ledgers l on l.id = m.ledger_id
      where m.user_id = p_user_id
        and m.deleted_at is null
        and l.deleted_at is null
        and l.type = 'family'
  ) then
    raise exception 'user already belongs to a family ledger'
      using errcode = 'FML01';
  end if;
end;
$$;

-- =============================================================================
-- 家族招待の承諾（20260706000500 の置き換え）
-- 招待行のロック後にユーザー単位の advisory lock を取り、（任意の）自帳簿削除の後・
-- メンバー挿入の前に家族所属が無いことを最終検証する。
-- =============================================================================
create or replace function public.accept_family_invitation(
  p_invitation_id uuid,
  p_invitee_user_id uuid,
  p_own_family_ledger_id uuid
)
returns void
language plpgsql
set search_path = ''
as $$
declare
  v_ledger_id uuid;
begin
  -- 対象招待（本人宛・pending）をロックして確定する（同一招待の二重承諾を防ぐ）
  select ledger_id
    into v_ledger_id
    from public.ledger_invitations
    where id = p_invitation_id
      and invitee_user_id = p_invitee_user_id
      and status = 'pending'
      and deleted_at is null
    for update;

  if v_ledger_id is null then
    raise exception 'invitation not acceptable' using errcode = 'P0001';
  end if;

  -- 自分が所有する家族家計簿を削除して参加する場合（FR-INVITE-03）
  if p_own_family_ledger_id is not null then
    perform public.delete_ledger_cascade(p_own_family_ledger_id);
  end if;

  -- 二重所属の最終防衛線（FR-LEDGER-05。自帳簿削除の後に検証する）
  perform public.assert_no_family_membership(p_invitee_user_id);

  insert into public.ledger_members (ledger_id, user_id, role)
    values (v_ledger_id, p_invitee_user_id, 'member');

  update public.ledger_invitations
    set status = 'accepted', responded_at = now()
    where id = p_invitation_id;
end;
$$;

-- =============================================================================
-- 家計簿作成（20260706000200 の置き換え）
-- 家族家計簿の作成時のみ家族所属ガードを通す（所有の重複は uq_ledgers_owner_type が防ぐが、
-- 他家への参加と自家の作成が同時に走るケースは advisory lock でしか防げない）。
-- =============================================================================
create or replace function public.create_ledger_with_defaults(
  p_owner_user_id uuid,
  p_type text,
  p_name text,
  p_categories jsonb
)
returns public.ledgers
language plpgsql
set search_path = ''
as $$
declare
  v_ledger public.ledgers;
  v_category jsonb;
begin
  if p_type = 'family' then
    perform public.assert_no_family_membership(p_owner_user_id);
  end if;

  insert into public.ledgers (owner_user_id, type, name)
  values (p_owner_user_id, p_type, p_name)
  returning * into v_ledger;

  insert into public.ledger_members (ledger_id, user_id, role)
  values (v_ledger.id, p_owner_user_id, 'owner');

  for v_category in select * from jsonb_array_elements(p_categories)
  loop
    insert into public.categories (ledger_id, name, is_fixed_cost, is_system, sort_order)
    values (
      v_ledger.id,
      v_category ->> 'name',
      (v_category ->> 'isFixedCost')::boolean,
      (v_category ->> 'isSystem')::boolean,
      (v_category ->> 'sortOrder')::integer
    );
  end loop;

  return v_ledger;
end;
$$;
