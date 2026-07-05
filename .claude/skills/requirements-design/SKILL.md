---
name: requirements-design
description: アプリ・新機能の要件定義と設計を行うときに使用。Design First の手順で docs/（requirements.md / architecture.md / database.md / api.md / screen.md 等）を作成・更新する。「要件定義」「設計」「仕様策定」「新機能を追加したい」「設計書を書いて」などの依頼で起動。実装タスクそのものでは起動しない。
---

# 要件定義・設計 Skill

アプリ・機能の要件定義から設計までを、CLAUDE.md の Design First 原則に従って進める。
このSkillの成果物は **docs/ 配下の設計ドキュメント** であり、実装コードではない。
設計がユーザーに承認されるまで実装を開始しない。

## 前提

- 仕様の優先順位: requirements.md > architecture.md > database.md > api.md > screen.md > coding-rules.md > ui-rules.md > development-flow.md
- 既存ドキュメントと矛盾する設計を勝手に書かない。矛盾がある場合は指摘し、ユーザーに判断を仰ぐ
- 不明点は推測せず AskUserQuestion で質問する
- ドキュメントの節構成・記法は `templates.md`（同ディレクトリ）に従う

## ワークフロー

### Phase 0: 現状把握

1. 対象領域に関係する既存ドキュメントを docs/ から読む（最低限 requirements.md の該当節、影響があれば architecture.md / database.md / api.md / screen.md）
2. 既存の機能ID（FR-XXX-nn）、画面ID（SCR-nn）、テーブル、APIエンドポイントを把握し、採番の重複を防ぐ
3. 依頼内容が既存要件と重複・競合しないか確認する。競合する場合はこの時点で報告する

### Phase 1: 要件定義

Design First の手順で以下を整理し、**先にユーザーへ提示して合意を取る**。

1. **ユーザーの最初の成功体験**を1行で定義する
2. 対象ユーザー・利用シーン・スコープ（含むもの／含まないもの）を明確にする
3. 機能要件を FR-<領域>-<連番> 形式で列挙する（既存の領域コード: AUTH / LEDGER / INVITE / ENTRY / CATEGORY / CSV / PDF / DUP / DRIVE / NOTIFY / AI / AICAT / DASH。新領域は提案して承認を得る）
4. 非機能要件（性能・セキュリティ・可用性）への影響を確認する
5. **想定される失敗ケース**を洗い出し、設計での回避方針を書く
6. 未確定事項をリスト化する。未確定のまま設計に進まない（AskUserQuestionで確定させる）
7. どのPhase（1〜4）に属するかを明示する

合意後、requirements.md の該当節を追記・更新する。

### Phase 2: 設計

要件が確定してから着手する。対象機能に応じて必要なドキュメントのみ更新する。

| 観点 | 更新先 | 主な内容 |
| --- | --- | --- |
| システム構成・データフロー | architecture.md | レイヤー配置、外部サービス連携、データフロー図（Mermaid） |
| DB | database.md | ER図、テーブル定義、Index、RLSポリシー |
| API | api.md | エンドポイント、リクエスト/レスポンス、HTTPステータス、ページング・フィルタ・ソート |
| 画面 | screen.md | 画面一覧（SCR-nn）、画面遷移、画面詳細、レスポンシブ（PC=表、SP=カード） |

設計時の必須ルール:

- **重要な設計判断は3案比較する**（採用理由・不採用理由を明記し、architecture.md「主要な設計判断」に残す）
- **DBスキーマ変更は必ず提案し、承認を得てから database.md に反映する**
- API仕様は既存の共通仕様（レスポンス形式・HTTPステータス・ページング）に従う。共通仕様自体の変更は勝手に行わない
- テーブルは共通カラム（id UUID / created_at / updated_at / deleted_at 論理削除）・外部キー制約・snake_case を守る
- 画面は既存の共通レイアウト・アクセシビリティ指針に従う
- 各要素は要件ID（FR-XXX-nn）と紐付け、トレーサビリティを保つ

### Phase 3: 整合性チェックと完成

1. **横断チェック**を行い、結果を報告する:
   - requirements.md の全FRが、API・画面・DBのいずれかで実現されているか
   - api.md のエンドポイントが参照するテーブルが database.md に存在するか
   - screen.md の画面が呼ぶAPIが api.md に存在するか
   - 用語が docs/requirements.md「用語定義」と一致しているか
2. **完成条件（Definition of Done）**を定義し requirements.md に記載する
3. 更新した各ドキュメントの**改訂履歴**に日付・変更内容を追記する
4. 変更ドキュメントの一覧と要点をユーザーへ報告し、承認を求める
5. 必要なら開発スケジュールへの影響を schedule.md に反映する

## 禁止事項

- 設計未確定・未承認のままの実装着手
- 要求されていない機能の要件追加（スコープ外は「スコープ外」節に明記する）
- 既存API仕様・既存DBスキーマの無断変更
- 採番済みID（FR/SCR）の意味変更・再利用
