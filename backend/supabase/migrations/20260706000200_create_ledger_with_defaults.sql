-- 家計簿作成を原子的に行う RPC 関数（architecture.md 4「Service＝トランザクション制御」）。
-- ledgers（1行）＋オーナーの ledger_members（1行）＋デフォルトカテゴリ（複数行）を
-- 単一トランザクションで登録する。カテゴリ内容はアプリ（buildDefaultCategories）が生成し
-- p_categories(jsonb 配列) で渡す（database.md §5。DBはグローバル seed を持たない）。
--
-- 呼び出しは service role（RLSバイパス）経由のみ。作成可否（個人1・家族1・FR-LEDGER-05）は
-- Service 層で事前検証し、同時実行の競合は ledgers の部分ユニークIndexが最終防壁となる。

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
