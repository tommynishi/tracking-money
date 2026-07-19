-- reorder_categories の集合更新化（20260706000400 の置き換え・database.md §5）。
--
-- 旧実装の `for i in 1 .. array_length(p_category_ids, 1)` は空配列で array_length が
-- NULL を返し、FOR ループの上限 NULL で実行時エラーになっていた。unnest ... with ordinality
-- による単一 UPDATE に置き換え、空配列は自然に no-op となる（ループも不要になる）。

create or replace function public.reorder_categories(
  p_ledger_id uuid,
  p_category_ids uuid[]
)
returns void
language plpgsql
set search_path = ''
as $$
begin
  update public.categories c
    set sort_order = o.ord - 1
    from unnest(p_category_ids) with ordinality as o(category_id, ord)
    where c.id = o.category_id
      and c.ledger_id = p_ledger_id
      and c.deleted_at is null;
end;
$$;
