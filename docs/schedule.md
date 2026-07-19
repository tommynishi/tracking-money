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
| 0-3 | Supabase プロジェクト初期化（backend/。ローカル環境・CLI） | 完了（2026-07-19） |
| 0-4 | GitHub Actions CI 構築（lint / typecheck / test / build） | 完了（2026-07-11。Integration用Supabase起動は0-3後に追加） |
| 0-5 | Vercel 接続・デプロイ確認（Hello World） | 完了（2026-07-19） |
| 0-6 | LINE Login チャネル作成（外部準備・ユーザー作業） | 完了（2026-07-19） |

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
| 2026-07-06 | 1-3（認可基盤 assertLedgerAccess / assertLedgerOwner・AppError）と 1-5 の家計簿ドメイン層（作成・名称変更・論理削除の Service/Repository/RPC）を実装。Route Handler・設定画面（SCR-06）は 1-2/1-4 後に着手 |
| 2026-07-06 | 1-4 共通UI基盤に着手：セマンティックトークン・ダークモード（data-theme戦略）・ThemeProvider/Toggle・format ユーティリティ・Button/Modal/Toast・AppShell を実装（Vitest に jsdom＋Testing Library 導入）。残り（Input/Badge/Skeleton/EmptyState/Table・CardList・帳簿切替）は消費画面と同時に実装。帳簿切替は ledgers API（1-2依存）待ち |
| 2026-07-06 | 1-7 カテゴリ管理ドメイン層（一覧・追加・更新・削除・並び替え）の Service/Repository/RPC を実装。削除の明細付け替えと並び替えは RPC（20260706000400）。UI（SCR-05）・Route Handler は 1-2/1-4 後に着手 |
| 2026-07-06 | 1-6 家族招待ドメイン層（作成・一覧・拒否・取消・承諾）とメンバー管理（一覧・除外・退出）を実装。承諾は自帳簿削除→参加を原子的に行う RPC（20260706000500）。UI（SCR-07）・Route Handler は 1-2/1-4 後に着手 |
| 2026-07-06 | 1-8 明細ドメイン層（手入力の登録・詳細・編集・削除、一覧の絞り込み/ソート/ページング）を実装。摘要正規化（FR-DUP-01）は純粋関数。カテゴリ学習（FR-AICAT-03）・インポート由来（csv/pdf）は Phase 2。UI（SCR-03/04）・Route Handler は 1-2/1-4 後に着手 |
| 2026-07-10 | ドメイン層総点検（コードレビュー）の指摘対応：家族二重所属（FR-LEDGER-05）のDBバックストップを追加（マイグレーション 20260710000100・FML01→409変換・smoke.sql へ否定テスト追加） |
| 2026-07-10 | 総点検の残指摘対応：month 値域検証（不正は400）、認可コメント修正、reorder_categories の集合更新化（20260710000200）、accept RPC の行返却化（20260710000300）、DBエラーコード判定の共通化（shared/lib/dbErrorCodes）、埋め込み参照の deleted_at 方針統一 |
| 2026-07-10 | 1-2 認証基盤を実装：Auth.js v5（next-auth@5.0.0-beta.31）＋LINE Provider・JWTセッション、初回ユーザー作成（ensureUser・FR-AUTH-03）、SCR-01 ログイン画面、(main) レイアウトの認証ガード（FR-AUTH-02）・ログアウト（FR-AUTH-05）、共通レスポンスヘルパー（shared/api）と GET/PATCH /api/me（FR-AUTH-04）。動作確認は LINE チャネル（0-6）とローカルDB（0-3）の準備後 |
| 2026-07-10 | Phase 1 の Route Handler を全配線（api.md 2〜6）：ledgers（一覧/作成/詳細/名称変更/削除）・members（一覧/除外・退出）・invitations（作成/一覧/承諾/拒否/取消）・categories（一覧/追加/変更/削除/並び替え）・entries（一覧/登録/詳細/編集/削除）・users/search。認可は各 Handler で assertLedgerAccess を経由。listUserLedgers / getLedgerDetail / searchUsers を追加。DB 込みの Integration Test はローカル Supabase 準備（0-3）後に追加 |
| 2026-07-10 | SCR-03/04（明細一覧・登録編集モーダル）と初期セットアップ（個人家計簿の作成促し）を実装。クライアント fetch ラッパー（shared/api/client・ApiError）、月/カテゴリ絞り込み・ページング・削除確認・Toast 通知。PCは表・スマホはカード（ui-rules）。残り画面は SCR-05/06/07/08 |
| 2026-07-10 | SCR-05（カテゴリ管理：追加・名称/固定費変更・付け替え削除・↑↓並び替え）、SCR-06（家計簿設定：帳簿選択・名称変更・メンバー管理・ユーザー検索＋招待・帳簿削除）、SCR-07（招待一覧：承諾/拒否/取消・FAMILY_LEDGER_EXISTS の削除確認フロー）、SCR-08（アカウント設定：表示名変更）と共通ナビゲーションを実装。Phase 1 の画面実装完了（動作確認は 0-3/0-6 後） |
| 2026-07-11 | 0-4 GitHub Actions CI を構築（.github/workflows/ci.yml。PR/main push で lint / typecheck / test / build。ローカルで4コマンドすべて成功を確認。Integration テスト用のローカル Supabase 起動は 0-3 完了後に追加） |
| 2026-07-19 | 0-3 完了：Docker Desktop / Supabase CLI 2.109.1 導入（ユーザー作業）後、supabase init・start・db reset で全8マイグレーションを適用し、smoke.sql が STRUCTURE OK / RPC SMOKE OK。frontend/.env.local をローカル値で作成（LINE_* は 0-6 後に記入） |
| 2026-07-19 | 認可の Integration Test を全リソースで追加（frontend/src/tests/integration/・27件。auth のみモックし Route Handler→Service→実DB を検証）。マイグレーション 20260719000100 でアクセス権限を明示化（新CLI既定で service_role に DML が付与されないため。anon/authenticated は全面拒否）。CI へ Supabase 起動＋test:integration を追加。Phase 1 の残タスクは本番環境での動作確認（0-5/0-6 依存）のみ |
| 2026-07-19 | 0-5 完了：Vercel プロジェクト tracking-money を作成（Root Directory=frontend）し本番デプロイ。https://tracking-money-theta.vercel.app で SCR-01 表示を確認（/ → /login リダイレクト）。本番環境変数10件を暫定値で設定（Supabase 本番値・LINE_* は本番環境構築/0-6 後に差し替え）。Git 自動デプロイは Vercel GitHub App の導入（ユーザー作業）後に `vercel git connect` で接続 |
| 2026-07-19 | Vercel と GitHub の連携完了（tommynishi/tracking-money・Production Branch=main・Root Directory=frontend）。以後 main への push で本番、その他ブランチへの push でプレビューが自動デプロイされる。Phase 0 の残りは 0-6（LINE Login チャネル作成・ユーザー作業）のみ |
| 2026-07-19 | 0-6 完了：LINE Login チャネル作成（ユーザー作業）・コールバックURL（ローカル/本番）登録。LINE 提供の email スコープ既定要求は未申請チャネルで invalid_scope になるため authorization scope を openid profile へ明示。ローカルで LINEログイン→初回ユーザー作成→明細一覧まで動作確認済み。本番の LINE_CHANNEL_ID/SECRET も実値へ差し替え。**Phase 0 完了**。残る本番作業は Supabase 本番プロジェクト作成と本番環境変数（Supabase）差し替え（Phase 1 完了条件の本番動作確認で実施） |
| 2026-07-19 | Supabase 本番プロジェクト TrackingMoney（xfqddwkykosswtymzwqq・ap-southeast-1）を作成（ユーザー作業）し、CLI で link・全9マイグレーションを db push で適用（migration list で一致確認）。Vercel の Supabase 3変数を本番実値へ差し替え再デプロイ。本番の全環境変数が実値になり、残るは本番での LINE ログイン通し確認（Phase 1 完了条件） |
