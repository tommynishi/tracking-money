-- カテゴリ管理の原子的操作 RPC（schedule 1-7 / api.md 5.4・5.5）。
-- 呼び出しは service role（RLSバイパス）経由のみ。認可・存在確認・業務ルール
-- （is_system 保護・付け替え先/全件一致の検証）は Service 層で事前に行う。
-- WHERE の ledger_id 一致により他帳簿への波及を防ぐ。

-- =============================================================================
-- カテゴリ削除（FR-CATEGORY-03）
-- 使用中明細を付け替え先へ移してからカテゴリを論理削除する（明細のカテゴリ欠損防止）。
-- =============================================================================
create or replace function public.delete_category_with_reassign(
  p_ledger_id uuid,
  p_category_id uuid,
  p_reassign_to uuid
)
returns void
language plpgsql
set search_path = ''
as $$
begin
  update public.entries
    set category_id = p_reassign_to
    where ledger_id = p_ledger_id
      and category_id = p_category_id
      and deleted_at is null;

  update public.categories
    set deleted_at = now()
    where id = p_category_id
      and ledger_id = p_ledger_id
      and deleted_at is null;
end;
$$;

-- =============================================================================
-- カテゴリ並び替え（FR-CATEGORY-01・api.md 5.5）
-- 送られた配列順に sort_order を 0 始まりで再設定する（全件の順序を受け取る前提）。
-- =============================================================================
create or replace function public.reorder_categories(
  p_ledger_id uuid,
  p_category_ids uuid[]
)
returns void
language plpgsql
set search_path = ''
as $$
begin
  for i in 1 .. array_length(p_category_ids, 1) loop
    update public.categories
      set sort_order = i - 1
      where id = p_category_ids[i]
        and ledger_id = p_ledger_id
        and deleted_at is null;
  end loop;
end;
$$;
