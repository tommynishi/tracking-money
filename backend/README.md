# backend（Supabase）

Tracking Money のデータベース（PostgreSQL / Supabase）を管理します。
スキーマ定義の正は `docs/database.md`、変更は必ず `supabase/migrations/` のマイグレーションで適用します（DBへの手動変更は禁止）。

## 前提

- Docker Desktop
- Supabase CLI
- Node.js 22+

## 初期化（Phase 0-3・未実施の場合）

```bash
cd backend
supabase init   # config.toml を生成（既存の migrations は保持される）
```

## ローカルDBの起動・適用

```bash
cd backend
supabase start        # ローカルの Postgres を起動
supabase db reset     # migrations/ を順に再適用（クリーンな状態から再構築）
```

## 適用後の検証（スモークテスト）

`supabase db reset` の後、7テーブル・RPC関数一式・RLS が揃い、主要 RPC が期待どおり動くことを
`supabase/tests/smoke.sql` で確認できる（トランザクション内で実行し最後に ROLLBACK するため
データは残らない）。

```bash
# psql で実行（URL は supabase start の既定ローカルDB。異なる場合は supabase status で確認）
psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" \
  -v ON_ERROR_STOP=1 -f supabase/tests/smoke.sql
```

- 成功時は `STRUCTURE OK` と `RPC SMOKE OK` の NOTICE が出る
- いずれかの検証が失敗すると exception で停止する（`ON_ERROR_STOP=1` 推奨）
- Supabase Studio の SQL Editor に貼り付けて実行してもよい（失敗はエラーとして表示される）

検証内容：テーブル/関数/RLS の存在、`create_ledger_with_defaults`（14カテゴリ＋owner）、
`accept_family_invitation`（招待→承諾でメンバー2名）、家族二重所属ガード（FML01・FR-LEDGER-05）、
`delete_category_with_reassign`（明細の付け替え＋論理削除）、`reorder_categories`、
`delete_ledger_cascade`。

## Integration Test（DB込み）

Route Handler の認可を実DBで検証するテストが `frontend/src/tests/integration/` にある。
ローカル Supabase を起動した状態で実行する（CI でも同様に起動して実行される）。

```bash
cd frontend
npm run test:integration
```

テストデータは実行ごとに一意な値で作成される。DBを初期状態へ戻すには `supabase db reset` を実行する。

## マイグレーション

- 追加は `supabase migration new <name>` で作成し、SQL を記述する
- ファイル名は `<timestamp>_<name>.sql`（時系列順に適用される）
- 破壊的変更（カラム削除等）は「使用停止 → 削除」の2段階で行う（database.md §6）

### 適用済みマイグレーション

| ファイル | 内容 | 対象Phase |
| --- | --- | --- |
| `20260706000100_phase1_init.sql` | users / ledgers / ledger_members / ledger_invitations / categories / entries / notification_settings。updated_at トリガー、RLS有効化、Index一式 | Phase 1-1 |
| `20260706000200_create_ledger_with_defaults.sql` | RPC 関数 `create_ledger_with_defaults`。家計簿＋オーナーmember＋デフォルトカテゴリを原子的に作成（database.md §5） | Phase 1-5 |
| `20260706000300_delete_ledger_cascade.sql` | RPC 関数 `delete_ledger_cascade`。家計簿と子データ（member/category/entry/invitation）を原子的に論理削除（database.md §5・FR-LEDGER-08） | Phase 1-5 |
| `20260706000400_category_management.sql` | RPC 関数 `delete_category_with_reassign`（明細付け替え→論理削除）/ `reorder_categories`（表示順再設定）（database.md §5・FR-CATEGORY-01/03） | Phase 1-7 |
| `20260706000500_accept_family_invitation.sql` | RPC 関数 `accept_family_invitation`。自帳簿削除→メンバー追加→招待更新を原子的に実行（database.md §5・FR-INVITE-02/03） | Phase 1-6 |
| `20260710000100_family_membership_guard.sql` | 家族二重所属のDBバックストップ（FR-LEDGER-05）。ガード関数 `assert_no_family_membership`（advisory lock＋検証・違反は FML01）を追加し、`accept_family_invitation` / `create_ledger_with_defaults` を置き換え | Phase 1-6 |
| `20260710000200_reorder_categories_set_based.sql` | `reorder_categories` を unnest による単一 UPDATE へ変更（空配列で失敗しない） | Phase 1-7 |
| `20260710000300_accept_family_invitation_returns_row.sql` | `accept_family_invitation` の戻り値を更新後の招待行へ変更（承諾後の再取得を不要に） | Phase 1-6 |
| `20260719000100_service_role_grants.sql` | アクセス権限の明示化：service_role へ全テーブルの DML を付与し、anon / authenticated の直接アクセスを全面拒否（default privileges 含む）。新しい CLI のローカル既定では DML が付与されないため必須 | Phase 0-3 |

### Phaseごとの予定（schedule.md）

- **Phase 2-1**: `import_files` / `csv_column_mappings` / `category_rules` を追加。`ledgers.drive_folder_id` 追加。`entries.import_file_id` に `import_files` への FK を付与
- **Phase 3-3**: `analysis_caches` を追加

## 設計上の注意

- 全テーブルで RLS を有効化し、anon ロールのポリシーは作らない（anonキーからの直接アクセスを全面拒否）。アプリは service role 経由でアクセスし、認可（帳簿メンバー判定）は API 層で行う（database.md §1.3 / architecture.md 3.2）
- デフォルトカテゴリはグローバル seed ではなく、家計簿作成時に Service 層が投入する（database.md §5）
