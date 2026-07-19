-- 家族招待の承諾を原子的に行う RPC（schedule 1-6 / api.md 4.3・FR-INVITE-02/03）。
-- （任意）承諾者が所有する家族家計簿の論理削除 → 招待先へのメンバー追加 → 招待の accepted 更新を
-- 単一トランザクションで実行する。
--
-- 呼び出しは service role（RLSバイパス）経由のみ。承諾可否（本人・pending・家族家計簿の
-- 所属制約 FR-LEDGER-05）は Service 層で事前検証し、削除対象の自帳簿 id を p_own_family_ledger_id
-- で渡す（所有していない/削除しない場合は NULL）。

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
  -- 対象招待（本人宛・pending）をロックして確定する（同時実行での二重承諾を防ぐ）
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

  insert into public.ledger_members (ledger_id, user_id, role)
    values (v_ledger_id, p_invitee_user_id, 'member');

  update public.ledger_invitations
    set status = 'accepted', responded_at = now()
    where id = p_invitation_id;
end;
$$;
