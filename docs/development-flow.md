# 開発フロー（development-flow.md）

Tracking Money の開発の進め方を定義します。

---

# 1. 基本原則：Design First

実装は必ず設計ドキュメントに基づいて行います。

1. 着手前に該当ドキュメント（requirements / architecture / database / api / screen）を確認する
2. 設計が未確定・未記載の機能は実装を開始しない。先にドキュメントを更新し、承認を得る
3. 仕様が競合する場合は requirements.md を最優先とする

## 変更種別ごとの手順

| 変更内容 | 先に更新するドキュメント |
| --- | --- |
| 要件の追加・変更 | requirements.md（承認必須） |
| DBスキーマ変更 | database.md（**変更前に必ず提案・承認**）→ マイグレーション作成 |
| API追加・変更 | api.md（API仕様を勝手に変更しない） |
| 画面追加・変更 | screen.md |
| アーキテクチャ・ライブラリ追加 | architecture.md（3案比較・採用理由を記載） |

---

# 2. 開発サイクル

```text
① 対象機能の設計確認（docs）
② ブランチ作成
③ 実装（テスト含む）
④ セルフチェック（DoD）
⑤ コミット・push・PR作成
⑥ CIパス確認 → レビュー → mainへマージ
⑦ Vercelへ自動デプロイ → 動作確認
```

---

# 3. ブランチ・コミット規則

## 3.1 ブランチ

`main` から作成し、`main` へマージする（開発者が少ないため develop ブランチは置かない）。

| 種別 | 命名 | 例 |
| --- | --- | --- |
| 機能追加 | `feature/*` | `feature/entry-crud` |
| バグ修正 | `fix/*` | `fix/import-date-parse` |
| リファクタリング | `refactor/*` | `refactor/entry-service` |
| ドキュメント | `docs/*` | `docs/update-api-spec` |

* `main` への直接コミットは禁止（PR経由のみ）

## 3.2 コミット

| プレフィックス | 用途 |
| --- | --- |
| `feat:` | 機能追加 |
| `fix:` | バグ修正 |
| `refactor:` | 挙動を変えない改善 |
| `docs:` | ドキュメント |
| `test:` | テストのみの追加・修正 |

* **1機能につき1コミットを基本**とする（レビュー・revertの単位を明確にする）
* メッセージは日本語可。「何を・なぜ」が分かるように書く

---

# 4. Definition of Done（完了条件）

PR作成前に以下をすべて満たすこと（CLAUDE.md準拠）。

- [ ] ビルド成功（`next build`）
- [ ] 型エラー 0（`tsc --noEmit`）
- [ ] ESLintエラー 0
- [ ] テスト成功（Unit / Integration）
- [ ] 関連ドキュメント更新済み
- [ ] 未使用コード・未使用Import削除済み
- [ ] 実機確認（PC表示・スマホ表示・ダークモード）

---

# 5. CI / CD

## 5.1 CI（GitHub Actions）

PRおよびmainへのpushで以下を実行する。

1. 依存インストール
2. Lint（ESLint）
3. 型チェック（tsc）
4. Unit / Integration テスト（Integrationはローカル Supabase をCI上で起動）
5. ビルド

CIが失敗しているPRはマージしない。

## 5.2 デプロイ

* `main` マージで Vercel が自動デプロイする
* 環境変数の追加・変更は README の一覧と Vercel の設定を同時に更新する

---

# 6. DBマイグレーション運用

1. database.md を更新し、承認を得る
2. `supabase migration new <name>` でSQLを作成する
3. ローカル（`supabase start` / `supabase db reset`）で適用・テストする
4. PRマージ後、本番Supabaseへ適用する
5. 破壊的変更（カラム削除・型変更）は「使用停止 → 次リリースで削除」の2段階で行う

---

# 7. 実装順序（Phase内）

各機能は以下の順で実装する（下層から上層へ）。

1. マイグレーション（DB）
2. Repository
3. Service（＋Unit Test）
4. Route Handler（＋Integration Test）
5. UIコンポーネント・画面
6. 実機確認・ドキュメント更新

Phase間の順序は README.md の Roadmap / docs/schedule.md に従う。

---

# 8. 障害・不具合対応

1. 再現手順と原因をIssueへ記録する
2. `fix/*` ブランチで修正し、**再発防止のテストを必ず追加**する
3. 原因がドキュメントの不備による場合はドキュメントも修正する

---

# 改訂履歴

| 日付 | 内容 |
| --- | --- |
| 2026-07-05 | 初版作成 |
