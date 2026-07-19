-- アクセス権限の明示化（database.md §1.3 / architecture.md 3.2）
-- アプリは service role 経由でのみ DB へアクセスし、認可は API 層で行う。
-- 新しい Supabase CLI のローカル既定では public スキーマのテーブルに対する DML が
-- 各ロールへ付与されないため、service_role へ明示的に付与する。
-- あわせて anon / authenticated の直接アクセスを全面拒否する（残存privilege の除去）。

-- service_role: 全テーブルへの DML（今後のテーブルにも既定で付与）
grant usage on schema public to service_role;
grant select, insert, update, delete on all tables in schema public to service_role;
alter default privileges in schema public
  grant select, insert, update, delete on tables to service_role;

-- anon / authenticated: 直接アクセスを全面拒否（今後のテーブルにも適用）
revoke all on all tables in schema public from anon, authenticated;
alter default privileges in schema public
  revoke all on tables from anon, authenticated;
