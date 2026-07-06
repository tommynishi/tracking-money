# 開発スケジュール（schedule.md）

Tracking Money の開発計画です。Phase構成は README.md の Roadmap に準拠します。

日付は未確定のため、各Phaseの想定工数（目安）とマイルストーンで管理します。着手時に開始日を記入してください。

---

# 全体の流れ

```text
Phase 0（準備） → Phase 1（基盤＋家計簿CRUD） → Phase 2（インポート） → Phase 3（通知・AI分析） → Phase 4（将来機能）
```

各Phaseは「完了条件を満たし、本番環境で動作確認できた時点」で完了とします。

---

# Phase 0：開発準備

想定規模：小

| # | タスク | 状態 |
| --- | --- | --- |
| 0-1 | 設計ドキュメント一式の作成・承認 | 完了（2026-07-05） |
| 0-2 | Next.js プロジェクト初期化（frontend/。TypeScript strict / Tailwind / ESLint / Prettier） | 完了（2026-07-06） |
| 0-3 | Supabase プロジェクト初期化（backend/。ローカル環境・CLI） | 未着手 |
| 0-4 | GitHub Actions CI 構築（lint / typecheck / test / build） | 未着手 |
| 0-5 | Vercel 接続・デプロイ確認（Hello World） | 未着手 |
| 0-6 | LINE Login チャネル作成（外部準備・ユーザー作業） | 未着手 |

**完了条件**：mainへのマージでCIが通り、Vercel上でプレースホルダー画面が表示される。

---

# Phase 1：認証・家計簿の基盤

想定規模：大（本プロジェクトの土台。認可設計を含むため最も慎重に進める）

| # | タスク | 依存 |
| --- | --- | --- |
| 1-1 | マイグレーション：users / ledgers / ledger_members / ledger_invitations / categories / entries / notification_settings | 0-3 |
| 1-2 | Auth.js＋LINE Login（ログイン・初回ユーザー作成・SCR-01） | 0-6 |
| 1-3 | 認可基盤（assertLedgerAccess・AppError・共通レスポンス） | 1-1 |
| 1-4 | 共通UI（レイアウト・ナビ・帳簿切替・Button/Modal/Toast等・ダークモード） | 0-2 |
| 1-5 | 家計簿API＋設定画面（作成・名称変更・削除・SCR-06） | 1-3 |
| 1-6 | 家族招待（検索・招待・承諾/拒否・メンバー管理・SCR-07） | 1-5 |
| 1-7 | カテゴリ管理（デフォルト投入・CRUD・並び替え・SCR-05） | 1-5 |
| 1-8 | 明細CRUD（一覧・登録・編集・削除・SCR-03/04）。**ログイン後トップは明細一覧（SCR-03）** | 1-7 |
| 1-9 | アカウント設定（SCR-08） | 1-2 |

**完了条件**：LINEログイン〜家族招待〜明細手入力〜明細一覧表示までが本番環境で動作し、認可のIntegration Testが全リソースで通る。

> ダッシュボード（SCR-02）はPhase 3へ移動（AI分析と同時に導入）。Phase 1〜2のログイン後トップは明細一覧を使用する。

---

# Phase 2：インポート

想定規模：大（カード会社ごとのパーサー実装とプレビューUIが中心）

| # | タスク | 依存 |
| --- | --- | --- |
| 2-1 | マイグレーション：import_files / csv_column_mappings / category_rules ＋ ledgers へ drive_folder_id 追加（FR-DRIVE-02） | Phase 1 |
| 2-2 | パーサー基盤（StatementParser インターフェース・文字コード判定・正規化処理） | 2-1 |
| 2-3 | カード会社別CSVパーサー（楽天 → JCB → Epos → セゾンの順。実CSVサンプル入手が前提） | 2-2 |
| 2-4 | 汎用CSV（列マッピングUI・保存・SCR-09 Step1分岐） | 2-2 |
| 2-5 | 重複チェック（明細単位・ファイル単位） | 2-2 |
| 2-6 | Google Drive連携（サービスアカウント準備・保存・ダウンロード・削除） | 2-1 |
| 2-7 | AIカテゴリ自動分類＋学習ルール（category_rules） | 2-2 |
| 2-8 | インポートウィザードUI（analyze / confirm・SCR-09） | 2-3〜2-7 |
| 2-9 | PDF OCR（OpenAI Vision・カード明細PDF） | 2-8 |
| 2-10 | 取込履歴（SCR-10） | 2-8 |

**完了条件**：対応4社のCSVと明細PDFを実ファイルで取込でき、重複がスキップされ、原本がDriveへ保存される。

**リスク**：各社CSV・PDFの実サンプル入手（requirements.md 未確定事項）。入手できるカードから順に対応する。

---

# Phase 3：通知・AI分析

想定規模：中

| # | タスク | 依存 |
| --- | --- | --- |
| 3-1 | LINE Messaging API チャネル作成（外部準備・ユーザー作業） | − |
| 3-2 | 通知バッチ（Vercel Cron・月次/未登録検知）＋通知設定画面（SCR-12） | 3-1 |
| 3-3 | マイグレーション：analysis_caches | Phase 1 |
| 3-4 | 集計API（summary / trend / ranking / subscriptions）＋グラフUI | 3-3 |
| 3-5 | AI所見（insight・キャッシュ・再生成） | 3-4 |
| 3-6 | ダッシュボード（SCR-02。今月合計・内訳・直近明細・前月比・前年同月比・AI所見）。導入後ログイン後トップを `/dashboard` へ切替 | 3-4, 3-5 |
| 3-7 | 分析画面（SCR-11。全タブ） | 3-5 |

**完了条件**：LINE通知が設定どおり届き、ダッシュボードと分析画面の全タブが動作する。AI障害時も集計・グラフが表示される。

---

# Phase 4：将来機能（未計画）

銀行API連携／証券API連携／資産管理／予算管理／PWA対応／電子マネー連携／レシート撮影／AI家計診断

着手時に requirements.md へ要件を追記してから計画する。

---

# 運用ルール

* 各タスクの完了は development-flow.md の Definition of Done に従う
* Phaseをまたぐ先行実装は行わない（Scope Control）
* 本表の状態は着手・完了のたびに更新する

---

# 改訂履歴

| 日付 | 内容 |
| --- | --- |
| 2026-07-05 | 初版作成 |
| 2026-07-05 | レビュー指摘反映：ダッシュボードをPhase 1（1-9）からPhase 3（3-6）へ移動。Phase 1トップを明細一覧に変更し、完了条件を更新 |
| 2026-07-05 | 再レビュー反映：2-1 に ledgers への drive_folder_id 追加を明記 |
| 2026-07-06 | 0-2（Next.js初期化）完了。1-1（初期マイグレーション7テーブル）SQL作成（ローカル未適用） |
