# Tracking Money

Tracking Money は、AIを活用した家計簿・資産管理Webアプリです。

カード会社から取得したCSV・PDF明細を取り込み、個人・家族単位で家計簿を管理できます。

将来的には銀行・証券会社との連携やAIによる家計分析・資産管理まで拡張することを目的としています。

---

# 主な機能

## 家計簿管理

* 明細登録・編集・削除
* CSVインポート
* PDF（OCR）インポート
* 明細の重複チェック
* カテゴリ管理
* 個人・家族単位での管理

## AI分析

* 今月支出分析
* 前月比較
* 前年同月比較
* カテゴリ別推移
* 支出ランキング
* 固定費分析
* サブスク検知
* 節約提案
* 来月支出予測
* AIカテゴリ自動分類

## Google Drive連携

* CSV・PDF保存
* ファイルダウンロード
* ファイル削除
* Driveリンク表示

## LINE連携

* LINE Login
* 明細登録リマインド通知

---

# 技術スタック

| 分類             | 技術                                  |
| -------------- | ----------------------------------- |
| Frontend       | Next.js / TypeScript / Tailwind CSS |
| Backend        | Supabase                            |
| Database       | PostgreSQL (Supabase)               |
| Authentication | LINE Login                          |
| Storage        | Google Drive API                    |
| AI             | OpenAI API                          |
| OCR            | OpenAI Vision                       |
| Deploy         | Vercel                              |

---

# 対応環境

* Windows
* macOS
* Android
* iPhone
* タブレット

本アプリはレスポンシブデザインを採用し、PC・スマートフォン・タブレットで利用できます。

将来的にはPWA対応を予定しています。

---

# セットアップ

## 必要環境

* Node.js 22以上
* npm または pnpm
* Git
* Docker Desktop
* Supabase CLI

## リポジトリ取得

```bash
git clone https://github.com/tommynishi/tracking-money.git
cd tracking-money
```

## パッケージインストール

Next.js アプリは `frontend/` 配下にあります。

```bash
cd frontend
npm install
```

## ローカルDB（Supabase）起動

Supabase プロジェクトは `backend/` 配下にあります。Docker Desktop を起動した上で実行してください。

```bash
cd backend
supabase start
```

スキーマは `backend/supabase/migrations/` のマイグレーションで適用されます（`supabase db reset` で再適用）。

## 環境変数

`frontend/.env.local` を作成し、以下の情報を設定してください。変数の一覧・用途・公開範囲は docs/architecture.md 9.2 を正とします。

```env
# Supabase
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=

# Auth.js（LINE Login）
AUTH_SECRET=
LINE_CHANNEL_ID=
LINE_CHANNEL_SECRET=

# LINE Messaging API（通知・Loginとは別チャネル）
LINE_MESSAGING_CHANNEL_ACCESS_TOKEN=

# OpenAI（AI分析 / Vision OCR）
OPENAI_API_KEY=

# Google Drive（アプリ管理の共通Drive・サービスアカウント）
GOOGLE_SERVICE_ACCOUNT_KEY=

# Vercel Cron 保護
CRON_SECRET=
```

* `NEXT_PUBLIC_` が付く変数のみクライアントへ公開される。それ以外はサーバー専用のため、絶対に `NEXT_PUBLIC_` を付けない
* Google Drive はユーザー個人の連携ではなく、**アプリ管理のサービスアカウント**で共通Driveへ接続する（docs/requirements.md CON-05）

## 開発サーバー起動

```bash
cd frontend
npm run dev
```

---

# ディレクトリ構成

```text
tracking-money/

├── frontend/
├── backend/
├── docs/
├── .github/
├── .vscode/
├── .env.example
├── .gitignore
├── CLAUDE.md
└── README.md
```

---

# ドキュメント

| ファイル                | 内容        |
| ------------------- | --------- |
| requirements.md     | 要件定義      |
| architecture.md     | システム構成図   |
| screen.md           | 画面設計・画面遷移 |
| er.md               | ER図       |
| state.md            | 状態遷移図     |
| database.md         | テーブル定義    |
| api.md              | API仕様書    |
| coding-rules.md     | コーディング規約  |
| ui-rules.md         | UI規約      |
| development-flow.md | 開発フロー     |
| schedule.md         | 開発スケジュール  |

---

# 開発方針

本プロジェクトは長期運用を前提としたプロダクトとして開発します。

以下の方針を重視します。

* 保守性
* 拡張性
* 可読性
* 疎結合設計
* コンポーネントの再利用
* Feature First Architecture

詳細な開発ルールは `CLAUDE.md` を参照してください。

---

# Roadmap

スコープの正は docs/requirements.md §4 です。

## Phase 1

* LINEログイン
* 家計簿CRUD（個人・家族・招待）
* カテゴリ管理
* 明細CRUD（ログイン後トップ＝明細一覧）

## Phase 2

* CSVインポート
* PDF OCR
* 重複チェック
* Google Drive連携
* AIカテゴリ自動分類

## Phase 3

* LINE通知
* AI分析
* ダッシュボード

## Phase 4

* 銀行API連携
* 証券会社API連携
* 資産管理
* 予算管理
* PWA対応

---

# License

本プロジェクトのライセンスは今後決定予定です。

---

# Author

Developed by **tommynishi**
