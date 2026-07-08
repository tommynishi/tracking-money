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

### Phaseごとの予定（schedule.md）

- **Phase 2-1**: `import_files` / `csv_column_mappings` / `category_rules` を追加。`ledgers.drive_folder_id` 追加。`entries.import_file_id` に `import_files` への FK を付与
- **Phase 3-3**: `analysis_caches` を追加

## 設計上の注意

- 全テーブルで RLS を有効化し、anon ロールのポリシーは作らない（anonキーからの直接アクセスを全面拒否）。アプリは service role 経由でアクセスし、認可（帳簿メンバー判定）は API 層で行う（database.md §1.3 / architecture.md 3.2）
- デフォルトカテゴリはグローバル seed ではなく、家計簿作成時に Service 層が投入する（database.md §5）
