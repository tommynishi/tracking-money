-- 家計簿の論理削除を原子的に行う RPC 関数（FR-LEDGER-08・architecture.md 4）。
-- 家計簿本体と Phase 1 の子データ（メンバー・カテゴリ・明細・招待）を
-- 単一トランザクションで論理削除する。
--
-- なぜ子データも論理削除するか:
--   認可判定 hasActiveMembership は ledger_members.deleted_at のみを見る（ledgers は見ない）。
--   ledgers だけ論理削除するとメンバーがアクセス権を保持し続けるため、ledger_members を
--   必ず同時に論理削除する。categories/entries/ledger_invitations も有効行を残さずデータ整合性を保つ。
--
-- Phase 境界（schedule.md 運用ルール）:
--   import_files 等 Phase 2/3 のテーブルは対象外。追加時にこの関数へ加える。
--
-- 呼び出しは service role（RLSバイパス）経由のみ。存在確認・オーナー認可は Service 層で
-- 事前検証してから呼ぶ（この関数はデータ操作に専念する）。

create or replace function public.delete_ledger_cascade(p_ledger_id uuid)
returns void
language plpgsql
set search_path = ''
as $$
begin
  update public.ledgers
    set deleted_at = now()
    where id = p_ledger_id and deleted_at is null;

  update public.ledger_members
    set deleted_at = now()
    where ledger_id = p_ledger_id and deleted_at is null;

  update public.categories
    set deleted_at = now()
    where ledger_id = p_ledger_id and deleted_at is null;

  update public.entries
    set deleted_at = now()
    where ledger_id = p_ledger_id and deleted_at is null;

  update public.ledger_invitations
    set deleted_at = now()
    where ledger_id = p_ledger_id and deleted_at is null;
end;
$$;
