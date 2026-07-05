# コーディング規約（coding-rules.md）

Tracking Money のコーディング規約です。CLAUDE.md の最低限ルールを具体化します。

---

# 1. TypeScript

## 1.1 基本

* `strict: true` を維持する（変更禁止）
* `any` 禁止。型が不明な場合は `unknown` を使い、型ガードで絞り込む
* 型定義は `type` を優先する（`interface` は宣言マージが必要な場合のみ）
* `as` によるキャストは原則禁止。使用する場合は理由をコメントで残す
* `!`（non-null assertion）は原則禁止。Early Return や型ガードで担保する
* `enum` は使用しない。ユニオン型＋`as const` を使う

```ts
// Good
const ENTRY_SOURCES = ['manual', 'csv', 'pdf'] as const;
type EntrySource = (typeof ENTRY_SOURCES)[number];
```

## 1.2 外部入力の検証

* API リクエストボディ・クエリパラメータ・外部API（OpenAI等）のレスポンス・環境変数は、**必ず zod でパースしてから使用する**
* `JSON.parse` の結果をそのまま型アサーションしない

---

# 2. 命名

| 対象 | 規則 | 例 |
| --- | --- | --- |
| コンポーネント | PascalCase | `EntryList` |
| 型 | PascalCase | `Entry`, `CreateEntryInput` |
| 変数・関数 | camelCase | `fetchEntries` |
| 定数（不変のグローバル値） | UPPER_SNAKE_CASE | `MAX_FILE_SIZE_BYTES` |
| DBカラム | snake_case | `used_on` |
| ファイル（コンポーネント） | PascalCase.tsx | `EntryList.tsx` |
| ファイル（それ以外） | camelCase.ts | `entryService.ts` |
| ディレクトリ | kebab-case | `csv-mappings` |

* boolean は `is` / `has` / `can` で始める
* 関数は動詞で始める（`get` / `create` / `update` / `delete` / `assert` / `parse` 等）
* 略語を避け、意味の伝わる名前にする（`btn` ✕ → `button` ○）

---

# 3. 関数・ロジック

* **単一責務**：1関数1目的。長くなったら分割する（目安：50行）
* **Early Return**：ネストを深くしない（目安：3段まで）
* **Magic Number禁止**：意味のある数値・文字列は定数化する

```ts
// Bad
if (file.size > 10485760) { ... }

// Good
const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024;
if (file.size > MAX_FILE_SIZE_BYTES) { ... }
```

* 副作用を最小限にする：計算（純粋関数）と入出力（DB・API呼び出し）を分離する
* 引数が3つを超える場合はオブジェクト引数にする
* `let` より `const`。再代入が必要な設計を見直す
* 日付操作は素の `Date` 演算を避け、共通ユーティリティ（`shared/utils/date`）へ集約する（タイムゾーンは Asia/Tokyo・CON-03）

---

# 4. コメント

* コメントは必要最低限。**「何をしているか」はコードで表現し、「なぜそうしたか」だけをコメントに書く**
* TODOコメントを残さない（残作業はIssue化する）
* JSDocは共有ユーティリティ・Service の公開関数のみ（自明なものには不要）

---

# 5. アーキテクチャ規約（architecture.md の補足）

* feature間の直接importは禁止。共有するものは `shared/` へ昇格させる
* `app/` にはルーティング・レイアウトのみを置き、実装は `features/` へ委譲する
* ビジネスロジックをコンポーネント・フックへ書かない（Service層へ）
* Repository以外からDBクライアント（supabase）を直接使用しない
* 外部APIクライアント（OpenAI / LINE / Drive）は `shared/lib/` のラッパー経由でのみ使用する
* 環境変数は `shared/config/` の検証済みオブジェクト経由でのみ参照する（`process.env` の直接参照禁止）

## 5.1 依存の方向

```text
components / hooks → (fetch) → route handlers → services → repositories / external clients
```

逆方向のimport（例：serviceからcomponentを参照）は禁止。

---

# 6. React / Next.js

* Server Components を既定とし、`"use client"` は必要な末端コンポーネントのみに付ける
* `useEffect` でのデータ取得は避け、データ取得は Server Components または データ取得フックに統一する
* リストの `key` に index を使わない（IDを使う）
* 状態は最小限に。導出できる値を state に持たない
* 不要な再レンダリングを避ける（`memo` / `useMemo` / `useCallback` は計測・明確な根拠がある場合のみ使用し、機械的に付けない）
* props のバケツリレーが3階層を超える場合は構成を見直す

---

# 7. エラーハンドリング

* エラーを握りつぶさない（空の `catch` 禁止）
* Service層は `AppError`（業務エラーの基底クラス）のサブタイプを throw し、Route Handler が HTTP ステータスへ変換する（architecture.md 10.1）

```ts
// shared/errors
class AppError extends Error { readonly code: string; readonly status: number; }
class NotFoundError extends AppError { ... }      // 404
class ForbiddenError extends AppError { ... }     // 403
class ConflictError extends AppError { ... }      // 409
class ExternalServiceError extends AppError { ... } // 502
```

* 予期しないエラーは Route Handler 最上位で捕捉し、500＋ログ記録とする（スタックをクライアントへ返さない）
* ログへ個人情報（明細内容・LINE ID・表示名）を出力しない（NFR-05）

---

# 8. テスト

* テストファイルは対象と同じディレクトリに `*.test.ts(x)` で配置する
* テスト名は日本語可。「何を保証するか」が分かる名前にする
* AAA（Arrange / Act / Assert）構成を基本とする
* 外部サービス（OpenAI / LINE / Drive）は必ずモックする（課金・外部依存を発生させない）
* Unit：Service / Parser / Utils を網羅。Integration：Route Handler＋ローカルSupabase で認可・CRUD を検証（architecture.md 10.3）
* 認可のテスト（他人の帳簿へアクセスできないこと）を全リソースで必ず書く

---

# 9. Lint / Format

* ESLint エラー 0 を維持する（`eslint-disable` は理由コメント必須・最小範囲）
* Prettier で自動整形する（設定はリポジトリの `.prettierrc` を正とする）
* import 順序：外部パッケージ → `@/shared` → `@/features` → 相対パス（ESLintで強制）
* 未使用コード・未使用importは削除する（コメントアウトで残さない）

---

# 10. その他

* ライブラリ追加時は、目的・代替案・採用理由を PR に記載する（CLAUDE.md）
* `console.log` を残さない（ログは共通ロガー経由）
* 秘密情報（APIキー等）をコード・テスト・fixtureへ書かない

---

# 改訂履歴

| 日付 | 内容 |
| --- | --- |
| 2026-07-05 | 初版作成 |
