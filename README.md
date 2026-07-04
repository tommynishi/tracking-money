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

```bash
npm install
```

## 環境変数

`.env.local` を作成し、以下の情報を設定してください。

```env
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=

OPENAI_API_KEY=

LINE_CHANNEL_ID=
LINE_CHANNEL_SECRET=

GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
```

## 開発サーバー起動

```bash
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
| database.md         | テーブル定義    |
| api.md              | API仕様書    |
| coding-rules.md     | コーディング規約  |
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

## Phase 1

* LINEログイン
* 家計簿CRUD
* カテゴリ管理

## Phase 2

* CSVインポート
* PDF OCR
* Google Drive連携

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
