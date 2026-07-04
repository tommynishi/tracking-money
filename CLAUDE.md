# Claude Code Instructions

## Project

Project Name: **Tracking Money**

Tracking Money は、AIを活用した家計簿・資産管理Webアプリです。

本プロジェクトは MVP ではなく、長期運用を前提としたプロダクトとして開発します。

品質・保守性・拡張性・可読性を最優先としてください。

---

# Goal

本プロジェクトでは以下を実現します。

* 家計簿管理
* CSV/PDF取込
* OCR解析
* Google Drive連携
* LINE通知
* AI分析
* 将来的な銀行・証券会社連携
* PWA対応

---

# Documentation

実装時は必ず以下のドキュメントを参照してください。

優先順位

1. docs/requirements.md
2. docs/architecture.md
3. docs/database.md
4. docs/api.md
5. docs/screen.md
6. docs/coding-rules.md
7. docs/ui-rules.md
8. docs/development-flow.md

仕様が競合する場合は requirements.md を最優先としてください。

---

# Tech Stack

Frontend

* Next.js
* TypeScript
* Tailwind CSS

Backend

* Supabase

Database

* PostgreSQL (Supabase)

Authentication

* LINE Login

Storage

* Google Drive API

AI

* OpenAI API

OCR

* OpenAI Vision

Deploy

* Vercel

---

# Architecture

以下の設計思想を維持してください。

* Feature First Architecture
* Clean Architecture を意識する
* UI・API・DBを疎結合にする
* 共通処理は Shared に配置する
* ビジネスロジックをUIへ書かない

---

# Directory

プロジェクト構成は README.md を参照してください。

新しいディレクトリを追加する場合は既存構成との整合性を維持してください。

---

# Coding Rules

詳細は docs/coding-rules.md を参照してください。

最低限守ること

* TypeScript strict
* any禁止
* unknownを優先
* typeを優先
* 単一責務
* DRY
* KISS
* SOLID
* Early Return
* Magic Number禁止
* コメントは必要最低限
* 副作用を最小限にする

---

# Naming

* Component：PascalCase
* Type：PascalCase
* Variable：camelCase
* Function：camelCase
* Database：snake_case
* API：REST

---

# UI Rules

詳細は docs/ui-rules.md を参照してください。

* Tailwind CSSを利用
* レスポンシブ対応
* ダークモード対応
* アクセシビリティを考慮
* PCは表形式、スマートフォンはカード形式を基本とする

---

# API Rules

詳細は docs/api.md を参照してください。

* REST API
* JSON形式
* 適切なHTTP Statusを返す
* ページング対応
* フィルタ対応
* ソート対応

API仕様を勝手に変更しないでください。

---

# Database Rules

詳細は docs/database.md を参照してください。

* UUID利用
* created_at
* updated_at
* 論理削除
* 外部キー制約
* 適切なIndex

DBスキーマ変更前には必ず提案してください。

---

# Security

以下を必ず守ってください。

* 認証必須
* 認可チェック
* SQL Injection対策
* XSS対策
* CSRF対策
* 個人情報をログへ出力しない

---

# Performance

以下を考慮してください。

* 不要な再レンダリングを避ける
* 不要なAPI通信を避ける
* N+1問題を避ける
* 大量データを考慮する
* 画像は遅延読み込み

---

# Error Handling

エラーは握りつぶさない。

* ユーザーへ分かりやすく表示する
* ログへ原因を残す
* 個人情報はログへ出力しない

---

# Testing

必ず以下を作成してください。

* Unit Test
* Integration Test
* 必要に応じてE2E Test

---

# Git Rules

ブランチ

* feature/*
* fix/*
* refactor/*
* docs/*

コミット

* feat:
* fix:
* refactor:
* docs:
* test:

1機能につき1コミットを基本としてください。

---

# Development Flow

実装前に以下を確認してください。

* 要件定義
* システム構成
* 画面設計
* ER図
* テーブル定義
* API仕様

設計が未確定の場合は実装を開始しないでください。

---

# Scope Control

要求されていない機能は実装しないでください。

仕様変更が必要な場合は提案し、承認後に実装してください。

大規模なリファクタリングは勝手に実施しないでください。

既存機能へ影響する変更は事前に説明してください。

---

# Definition of Done

以下を満たした場合のみ実装完了とします。

* ビルド成功
* 型エラー0
* ESLintエラー0
* テスト成功
* ドキュメント更新
* 未使用コード削除
* 未使用Import削除

---

# Claude Behavior

Claudeは以下を守ってください。

* 必要以上にコードを書かない
* 必要以上のリファクタリングを行わない
* 既存コードを壊さない
* 既存設計を尊重する
* 不明点は推測せず質問する
* 型安全を維持する
* 可読性を優先する
* エラー原因を説明する
* 実装後に改善案を提案する
* ライブラリ追加前に理由を説明する
* TODOコメントを残さない

---

# AI Rules

AI機能については以下を守ってください。

* AI出力は構造化データを意識する
* AI失敗時でもアプリは正常動作させる
* AIカテゴリ判定はユーザーが編集可能とする

---

# Design First

成果物を作成するタスクでは、軽微な修正を除き、実装前に以下を実施してください。

1. ユーザーの最初の成功体験を1行で定義する
2. 想定される失敗ケースを洗い出し、設計で回避する
3. 複数案がある場合は3案比較し、採用理由・不採用理由を明記する
4. 完成条件（Definition of Done）を定義する
5. 必要に応じて設計変更案を提案する
6. 実装後の検証と、ユーザが受け取れる形での配布までを完成条件に含める

---

# Future Features

将来的に以下を追加予定です。

* 銀行API連携
* 証券会社API連携
* 電子マネー連携
* レシート撮影
* 資産管理
* 予算管理
* 家族招待
* AI家計診断

将来の機能追加を考慮し、拡張しやすい設計を維持してください。
