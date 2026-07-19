-- accept_family_invitation の戻り値を更新後の招待行に変更（20260710000100 の置き換え・database.md §5）。
--
-- 旧実装は returns void のため、アプリが承諾後に同じ招待を再取得（1往復追加）していた。
-- 更新後の行を返すことで再取得を不要にする。戻り値型の変更は create or replace でできないため
-- 一度 drop する。ロジック（招待行ロック → 任意の自帳簿削除 → 家族所属ガード → メンバー追加 →
-- accepted 更新）は 20260710000100 と同一。

drop function public.accept_family_invitation(uuid, uuid, uuid);

create function public.accept_family_invitation(
  p_invitation_id uuid,
  p_invitee_user_id uuid,
  p_own_family_ledger_id uuid
)
returns public.ledger_invitations
language plpgsql
set search_path = ''
as $$
declare
  v_invitation public.ledger_invitations;
begin
  -- 対象招待（本人宛・pending）をロックして確定する（同一招待の二重承諾を防ぐ）
  select *
    into v_invitation
    from public.ledger_invitations
    where id = p_invitation_id
      and invitee_user_id = p_invitee_user_id
      and status = 'pending'
      and deleted_at is null
    for update;

  if v_invitation.id is null then
    raise exception 'invitation not acceptable' using errcode = 'P0001';
  end if;

  -- 自分が所有する家族家計簿を削除して参加する場合（FR-INVITE-03）
  if p_own_family_ledger_id is not null then
    perform public.delete_ledger_cascade(p_own_family_ledger_id);
  end if;

  -- 二重所属の最終防衛線（FR-LEDGER-05。自帳簿削除の後に検証する）
  perform public.assert_no_family_membership(p_invitee_user_id);

  insert into public.ledger_members (ledger_id, user_id, role)
    values (v_invitation.ledger_id, p_invitee_user_id, 'member');

  update public.ledger_invitations
    set status = 'accepted', responded_at = now()
    where id = p_invitation_id
    returning * into v_invitation;

  return v_invitation;
end;
$$;
