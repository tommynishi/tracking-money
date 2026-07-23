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

**完了（2026-07-19）**：全タスク（1-1〜1-9）実装済み。完了条件（LINEログイン〜家族招待〜明細手入力〜明細一覧の本番動作・認可 Integration Test 全リソース通過）を満たし、PR #1 で main へマージ済み。

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

**完了条件**：対応カード（楽天・JCB・汎用CSV・PDF明細）を実ファイルで取込でき、重複がスキップされる。

**リスク**：各社CSV・PDFの実サンプル入手（requirements.md 未確定事項）。入手できるカードから順に対応する。Epos・セゾンは実CSV未入手のため未対応（Eposは PDF OCR で代替可）。

**Google Drive 保存（2-6）は見送り**：サービスアカウントは Drive の保存容量を持たず、人間のフォルダを共有しても書き込みが拒否される（storageQuotaExceeded、2026-07-20 実機検証）。回避には Google Workspace 契約（有料）かユーザーOAuth連携（実装変更を伴う）が必要でどちらも見送り。未設定のままアプリは動作し、取込自体は成功、drive_status は常に failed となる（FR-DRIVE-06 のフォールバック設計どおり）。

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
| 2026-07-19 | 本番 LINE ログインが 400 になる問題を修正：(1) CLI パイプ登録で環境変数先頭に BOM が混入していたため Vercel REST API で全変数を登録し直し (2) Root Directory 設定後の CLI デプロイはリポジトリルートから実行が必要（frontend/ からの前回デプロイは失敗していた）。あわせて Supabase 本番をユーザー作り直しの新プロジェクト（uxbdatziyghatuvrihnd）へ切替（link・全9マイグレーション適用・Vercel 3変数差し替え）。**本番で LINE ログイン成功を確認**。残りは main への PR 作成・CI 初回実行・マージ（本番は Git 連携により自動デプロイへ移行） |
| 2026-07-19 | PR #1（feature/project-init → main）をマージ。CI 通過・main の本番自動デプロイ完了を確認。**Phase 0 / Phase 1 完了**。次は Phase 2（インポート）— 着手前に各カード会社の実CSVサンプル入手が必要 |
| 2026-07-19 | Phase 2 着手（feature/phase2-import）。実サンプル入手：楽天CSV（UTF-8 BOM）・JCB CSV（Shift_JIS・サマリー行付き）・Epos PDF。個人情報を含むため samples/ へ隔離し .gitignore 追加。2-1 マイグレーション 20260719000200（import_files / csv_column_mappings / category_rules / drive_folder_id / entries FK）をローカル適用済み |
| 2026-07-20 | 2-2 パーサー基盤（decodeCsv：UTF-8/Shift_JIS 自動判定・parseCsv：RFC4180・StatementParser IF・フォーマット自動判定）と 2-3 楽天・JCB パーサーを実装（features/import）。実サンプルで検証：楽天24行・JCB全行がエラー0でパース（海外利用補足行・キャンセル区切り行はスキップ扱い）。Unit テスト18件追加。Epos/セゾンのCSVは実サンプル未入手のため未対応（Epos は PDF のみ入手済み→2-9） |
| 2026-07-20 | 2-5 重複チェックを実装：明細単位（markDuplicateRows・正規化摘要で照合・entryRepository.listDuplicateKeys 追加・FR-DUP-01）とファイル単位（computeFileHash SHA-256・isFileAlreadyImported・FR-DUP-03）。スキップ/取込の選択（FR-DUP-02）はプレビューUI（2-8）で実装 |
| 2026-07-20 | 2-4 汎用CSVのドメイン層を実装：columnMappingSchema（zod・日付形式3種）・parseGenericCsv（マッピング指定パース）・csvColumnMappingRepository（一覧/取得/保存/変更/削除・名前重複は409）。列マッピングUI（SCR-09 Step1分岐）と Route Handler（api.md 8）は 2-8 と同時に実装 |
| 2026-07-20 | 2-7 カテゴリ自動分類を実装：categoryRuleRepository（一括照会・upsert）・categorizeRows（ルール優先→AI→「その他」フォールバック・AI障害時も継続 FR-AICAT-04・同一摘要は1回だけ問合せ）・createOpenAiClassifier（gpt-4o-mini・Structured Outputs・50件バッチ・SDK不使用で fetch 直叩き）。ルール学習の書き込みは confirm API（2-8）で配線 |
| 2026-07-20 | 2-6 Google Drive 連携を実装：googleAuth（サービスアカウントJWT RS256・トークンキャッシュ）・driveClient（フォルダ作成/multipartアップロード/ダウンロード/削除・fetch直・SDK不使用）・saveOriginalToDrive（家計簿フォルダ自動作成→原本保存・失敗時は drive_status=failed で取込継続 FR-DRIVE-06）・ledgerDriveFolderRepository。**動作にはサービスアカウント作成（ユーザー作業）と GOOGLE_SERVICE_ACCOUNT_KEY 設定が必要** |
| 2026-07-20 | 2-8（API側）：analyzeImport / confirmImport サービスと Route Handler 8本（api.md 7.1〜7.6・8.1〜8.4）を実装。重複情報を API 形式（entryId付き）へ拡張、entries へ一括登録 createMany 追加、確定時にカテゴリ選択を学習ルールへ保存。Integration Test 4件追加（認可全対象・解析→確定→履歴→再解析の重複検知・マッピングCRUD。外部APIスタブで AI/Drive 障害時フォールバックも実DB検証）。残りは SCR-09/10 の UI と 2-9 PDF OCR |
| 2026-07-20 | 2-8（UI）・2-10 完了：SCR-09 インポートウィザード（3ステップ・フォーマット選択/汎用列マッピング＋保存・DUPLICATE_FILE の force 再実行・FORMAT_UNKNOWN 誘導・重複候補は既定スキップ＋一括ON/OFF・カテゴリ編集と判定元表示・エラー行別枠・結果表示）と SCR-10 取込履歴（一覧・詳細モーダル・原本ダウンロード・Drive原本削除確認）。ナビへ取込/取込履歴を追加、apiFetch を FormData 対応、formatDateTime 追加。残りは 2-9 PDF OCR と Epos/セゾンCSV（実サンプル待ち） |
| 2026-07-20 | 2-9 PDF OCR を実装：createPdfStatementOcr（OpenAI へ PDF を直接添付・Structured Outputs で明細行抽出・依存追加なし）。analyzeImport の PDF 分岐（format=pdf・OCR失敗は import_files を failed で記録し 502 AI_UNAVAILABLE・FR-PDF-03）。**Phase 2 のコード実装は Epos/セゾンCSVパーサー（実サンプル未入手）を除き完了**。実動作確認には OPENAI_API_KEY（実値）と Google サービスアカウント（ユーザー作業）が必要 |
| 2026-07-20 | 方針決定：**OpenAI は課金しない**（AI分類は「その他」フォールバック＋確定時カテゴリの学習ルールで運用）。Google サービスアカウントを作成・Drive API 有効化まで実施したが、**サービスアカウントは保存容量を持たず、人間のフォルダを共有しても書き込み拒否**（storageQuotaExceeded）と実機検証で判明。回避には Google Workspace 契約かユーザーOAuth連携が必要でどちらも見送り、**2-6 Google Drive保存は見送り**。GOOGLE_SERVICE_ACCOUNT_KEY / GOOGLE_DRIVE_ROOT_FOLDER_ID を env.ts で任意化し未設定でも動作するよう変更（テスト追加・184件）。ローカルで楽天CSV実ファイルの取込→確定→履歴を実ブラウザ確認済み（Drive保存は想定通り failed）。**Phase 2 は Epos/セゾンCSVパーサー（実サンプル未入手）を除き完了** |
| 2026-07-20 | PR #2（feature/phase2-import → main）マージ・本番マイグレーション適用・本番デプロイ確認。**Phase 2 完了**。Phase 3（通知・AI分析）着手（feature/phase3-analysis）。3-1 LINE Messaging API チャネル作成の手順をユーザーへ案内（作業中） |
| 2026-07-21 | エポスカードの実CSVサンプル入手（samples/20260721_UseDetailReference.csv・Shift_JIS）を受け、保留していた eposParser を実装。日付は「YYYY年MM月DD日」形式で他社（YYYY/MM/DD）と異なるため専用の変換関数を追加。末尾の「お支払合計額」行はご利用金額欄が空のため既存の isAnnotationRow でスキップ。パーサー登録（statementParsers）・自動判定・インポートウィザードの形式選択（「エポスカード」）に追加。Unit テスト追加、既存テスト含め全通過 |
| 2026-07-21 | SCR-06 家計簿設定画面に「家族家計簿を作成」導線を追加（screen.md 仕様済みだが未実装だった箇所）。家族家計簿が0件のときは作成フォームを表示、既に他の家族家計簿へ参加（オーナーでない）場合は作成不可の理由を表示（FR-INVITE-04）。作成APIは既存の POST /api/ledgers（type=family）をそのまま利用。tsc/eslint/vitest/next build すべて成功を確認 |
| 2026-07-20 | 3-3 マイグレーション：analysis_caches（20260720000100）。3-4 集計API：dashboard / analysis/summary・trend・ranking・subscriptions。AIを使わずJS純粋関数で集計（byCategory/monthlyTotals/buildTrend/buildRanking/detectSubscriptions・aggregation.ts）しRepositoryはDBアクセスのみ担う設計。サブスク検知は直近6ヶ月で同一（正規化摘要・金額）が3ヶ月以上出現したものを候補とする簡易ヒューリスティック |
| 2026-07-20 | 3-5 AI所見：aiInsightClient（OpenAI・4種の所見 monthly_review/fixed_cost/saving_advice/forecast）。insightService は集計済み数値のみをAIへ渡し明細個別の内容は渡さない（NFR-05）。analysis_caches へ入力ハッシュ（SHA-256）付きでキャッシュしrefresh時のみ再生成（NFR-13）。3-2 通知：notification_settings は初回アクセス時に既定値で遅延作成、lineMessagingClient（Push API・fetch直）、notificationBatchService（月次はmonthly_day一致・月内未送信で送信、月末繰上げ対応／未登録検知は最終活動からの経過日数で判定し活動再開まで再送しない）、/api/cron/notifications（CRON_SECRET認証）、Vercel Cron設定（frontend/vercel.json・日次）。送信失敗は個別ログのみで処理継続（FR-NOTIFY-04） |
| 2026-07-20 | 3-6 ダッシュボード（SCR-02）・3-7 分析画面（SCR-11：月次サマリー/推移/ランキング/固定費/サブスク/提案・予測タブ、AI所見は遅延ロード＋再生成ボタン）・SCR-12 通知設定画面を実装。ログイン後トップとルート直下を `/dashboard` へ切替（screen.md方針）。チャートはライブラリを追加せずCSSバーで実装。Unit/Integration Test 追加（216 unit・40 integration）、lint・typecheck・build 全て green。**Phase 3 のコード実装は 3-1（LINE Messaging チャネル・ユーザー作業待ち）を除き完了** |
| 2026-07-20 | 3-1 完了：ユーザーが LINE Messaging API チャネル（Bot名「家計簿アプリ 通知」）を作成しチャネルアクセストークンを取得。実際にプッシュ通知を送信しユーザーのLINEへ着信することを確認。OPENAI_API_KEY も GOOGLE_* と同様に env.ts で任意化し、未設定時は即座に「利用できません」を返すよう統一（無駄な外部APIリクエストを避ける）。AI所見カードの文言も「取得できませんでした」から「現在ご利用いただけません（OpenAI未設定）」へ変更。Unit Test 221件・Integration Test 40件、lint・typecheck・build 全て green |
| 2026-07-21 | PR #3（feature/phase3-analysis → main）マージ。本番マイグレーション20260720000100（analysis_caches）適用。本番環境変数を実値へ更新（LINE_MESSAGING_CHANNEL_ACCESS_TOKEN・OPENAI_API_KEY空・GOOGLE_SERVICE_ACCOUNT_KEY空）し再デプロイ、`/dashboard` `/analysis` `/settings/notifications` の応答確認済み。**Phase 3 完了**（Epos/セゾンCSVパーサーのみ実サンプル未入手で保留） |
| 2026-07-21 | 按分・精算（FR-SPLIT・家族家計簿限定）を実装。マイグレーション 20260721000300（ledger_members.expense_weight／entries.paid_by_user_id・split_type・split_shares・assigned_user_id）をローカル適用。バックエンド：ledgerMemberRepository/memberService に既定比重更新、entryService に splitInput 解決ロジック（default/custom/assigned・支払者検証）、features/split（純粋計算 settlementCalc・repository・service）、新規API `PUT /split/weights`・`GET /split/settlement`、CSV確定行（confirmImport）にも按分フィールドを配線。フロント：LedgerSettingsScreen に比重編集、EntryFormModal に支払者・按分方法入力（家族帳簿のみ）、EntriesScreen 一覧に支払者・按分バッジ、AnalysisScreen に「精算」タブ（家族帳簿のみ表示）を追加。Unit テスト追加（splitInput・settlementCalc・settlementService・memberService 等）、既存含め全257件成功、tsc/eslint/next build すべてgreen |
| 2026-07-21 | ImportWizardScreen（SCR-09 Step2）に行ごとの支払者・按分方法編集UIを追加（家族帳簿のみ・PC表／スマホカード両対応）し、FR-SPLIT関連のUI実装を完了。既定値は支払者=取込実行者・按分方法=既定比重で、confirm時に反映。全257テスト・tsc/eslint/next build すべてgreen。**残タスク**：本番マイグレーション未適用（20260721000300はローカルのみ）・git未コミット |
| 2026-07-23 | UI改善3件：(1) グローバルナビから「取込履歴」を削除しSCR-09の「取込履歴を見る」リンクへ導線を集約（/imports ルートは維持）、(2) 支払月の既定値を暦月ベースへ変更（currentBillingMonth の10日締めを廃止・ダッシュボード/分析/取込/明細フィルタに反映）、(3) 帳簿切替を ActiveLedgerProvider＋ヘッダー常時表示の LedgerSwitcher として共通化し全画面へ適用（localStorage 永続化）。各画面の GET /api/me による帳簿解決とSCR-06の帳簿選択UIを廃止。tsc/eslint/vitest(257件)/next build すべてgreen |
