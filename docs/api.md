# API仕様書（api.md）

Tracking Money のREST API仕様書です。

要件は docs/requirements.md、構成は docs/architecture.md、データ構造は docs/database.md を正とします。

**API仕様の変更は本書の更新・承認を先に行ってから実装します。**

---

# 1. 共通仕様

## 1.1 基本

| 項目 | 内容 |
| --- | --- |
| ベースパス | `/api` |
| 形式 | REST / JSON（`Content-Type: application/json`。ファイルアップロードのみ `multipart/form-data`） |
| 認証 | Auth.jsセッション（HttpOnly Cookie）。全エンドポイント認証必須（Cron用を除く） |
| 認可 | 帳簿配下のリソースは「その帳簿のメンバーであること」を全APIで検証する |
| JSONフィールド命名 | camelCase（DBのsnake_caseはAPI層で変換する） |
| 日付 | 日付：`YYYY-MM-DD`／月：`YYYY-MM`／日時：ISO 8601（UTC） |
| 金額 | 円・整数。返金はマイナス値 |

`/api/auth/*` は Auth.js が使用する予約パスであり、本書のリソースAPIでは使用しない。

## 1.2 HTTPステータス

| ステータス | 用途 |
| --- | --- |
| 200 | 取得・更新成功 |
| 201 | 作成成功 |
| 204 | 削除成功（レスポンスボディなし） |
| 400 | リクエスト不正（バリデーションエラー） |
| 401 | 未認証 |
| 403 | 認可エラー（他人の帳簿へのアクセス等） |
| 404 | リソースが存在しない（論理削除済みを含む） |
| 409 | 業務ルール衝突（帳簿の重複作成・招待の競合等） |
| 500 | サーバー内部エラー |
| 502 | 外部サービス（OpenAI / LINE / Drive）エラー |

## 1.3 レスポンス形式

成功時：

```json
{
  "data": { }
}
```

一覧（ページング）時：

```json
{
  "data": [ ],
  "meta": {
    "page": 1,
    "perPage": 20,
    "totalCount": 123,
    "totalPages": 7
  }
}
```

エラー時：

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "金額は整数で入力してください",
    "details": [
      { "field": "amount", "message": "整数で入力してください" }
    ]
  }
}
```

主なエラーコード：

| code | 意味 |
| --- | --- |
| UNAUTHENTICATED | 未認証（401） |
| FORBIDDEN | 権限なし（403） |
| NOT_FOUND | リソースなし（404） |
| VALIDATION_ERROR | 入力不正（400） |
| CONFLICT | 業務ルール衝突（409）。詳細コードを `details` に含める |
| FAMILY_LEDGER_EXISTS | 招待承諾時、自分が家族家計簿を**所有**している（409・FR-INVITE-03。`deleteOwnFamilyLedger=true` で自帳簿を論理削除して参加可能） |
| ALREADY_FAMILY_MEMBER | 招待承諾時、既に**別の家族家計簿へメンバーとして参加済み**（409・FR-LEDGER-05）。先に退出してから参加する必要がある |
| DUPLICATE_FILE | 同一ファイルの取込済み警告（409・FR-DUP-03。`force=true` で続行可能） |
| EXTERNAL_SERVICE_ERROR | 外部サービス障害（502） |
| AI_UNAVAILABLE | AI機能のみ利用不可（502。非AI機能は正常） |
| INTERNAL_ERROR | サーバー内部エラー（500）。原因はログのみに残し、レスポンスへ詳細を含めない |

## 1.4 ページング・フィルタ・ソート（一覧API共通）

| クエリパラメータ | 内容 |
| --- | --- |
| `page` | ページ番号（1始まり。既定 1） |
| `perPage` | 件数（既定 20・最大 100） |
| `sort` | ソートキー（各API定義を参照） |
| `order` | `asc` / `desc` |

---

# 2. アカウント（AUTH）

## 2.1 GET /api/me

ログイン中ユーザーの情報を取得する。

```json
{
  "data": {
    "id": "uuid",
    "displayName": "たろう",
    "avatarUrl": "https://...",
    "personalLedgerId": "uuid",
    "familyLedgerId": "uuid"
  }
}
```

## 2.2 PATCH /api/me

表示名を変更する（FR-AUTH-04）。

リクエスト：`{ "displayName": "新しい名前" }`

## 2.3 GET /api/users/search

家族招待用のユーザー検索（FR-INVITE-01）。

| パラメータ | 内容 |
| --- | --- |
| `q` | 表示名の部分一致（必須・2文字以上） |

レスポンスは `id` / `displayName` / `avatarUrl` のみ（LINE IDは返さない）。

* `display_name` は一意ではないため、同名ユーザーが並ぶ可能性がある。少人数（家族のみ・requirements 2章）の利用を前提とし、**アイコン（avatarUrl）で区別し、誤招待は招待の承諾制（FR-INVITE-02）で担保する**方針とする。一意な識別子（LINE ID等）は招待用途では公開しない。

---

# 3. 家計簿（LEDGER）

## 3.1 GET /api/ledgers

自分がアクセスできる家計簿の一覧（個人＋家族）。

## 3.2 POST /api/ledgers

家計簿を作成する（FR-LEDGER-01〜02）。作成時にデフォルトカテゴリを自動投入する。

リクエスト：`{ "type": "personal", "name": "わたしの家計簿" }`

| エラー | 条件 |
| --- | --- |
| 409 CONFLICT | 同typeの家計簿を既に所有している（個人1・家族1） |
| 409 CONFLICT | type=family で、他の家族家計簿へ参加済み（FR-INVITE-04） |

## 3.3 GET /api/ledgers/{ledgerId}

家計簿の詳細（名称・type・自分のrole・メンバー数）。

## 3.4 PATCH /api/ledgers/{ledgerId}

名称変更（FR-LEDGER-07）。オーナーのみ。

## 3.5 DELETE /api/ledgers/{ledgerId}

論理削除（FR-LEDGER-08）。オーナーのみ。

## 3.6 GET /api/ledgers/{ledgerId}/members

メンバー一覧（FR-INVITE-05）。家族家計簿では各メンバーの `weight`（既定按分比重・FR-SPLIT-01）を含む。個人家計簿では常に `1`。

```json
{
  "data": [
    { "userId": "uuid", "displayName": "たろう", "role": "owner", "weight": 60, "joinedAt": "2026-07-06T00:00:00.000Z" }
  ]
}
```

比重の変更は 12.1 `PUT /api/ledgers/{ledgerId}/split/weights` で行う（本エンドポイントはread-only）。

## 3.7 DELETE /api/ledgers/{ledgerId}/members/{userId}

* オーナーが他メンバーを指定：メンバー除外（FR-INVITE-05）
* メンバーが自分自身を指定：退出（FR-INVITE-06）
* オーナー自身の退出は不可（403。帳簿削除で対応）

---

# 4. 家族招待（INVITE）

## 4.1 POST /api/ledgers/{ledgerId}/invitations

家族家計簿へユーザーを招待する（FR-INVITE-01）。オーナーのみ。

リクエスト：`{ "inviteeUserId": "uuid" }`

| エラー | 条件 |
| --- | --- |
| 409 CONFLICT | 同一ユーザーへのpending招待が既に存在／相手が既にメンバー |

## 4.2 GET /api/invitations

自分宛（received）・自分発（sent）の招待一覧。

| パラメータ | 内容 |
| --- | --- |
| `direction` | `received`（既定） / `sent` |
| `status` | `pending`（既定） / `accepted` / `declined` / `canceled` |

## 4.3 POST /api/invitations/{invitationId}/accept

招待を承諾し、家族家計簿へ参加する（FR-INVITE-02〜03）。

リクエスト：`{ "deleteOwnFamilyLedger": false }`

| エラー | 条件 |
| --- | --- |
| 409 FAMILY_LEDGER_EXISTS | 自分が家族家計簿を**所有**しており `deleteOwnFamilyLedger` が false。true を指定して再実行すると自帳簿を論理削除して参加する |
| 409 ALREADY_FAMILY_MEMBER | 既に**別の家族家計簿へメンバーとして参加済み**（FR-LEDGER-05）。この場合は自動退出せず拒否する。先に現在の家族家計簿を退出（`DELETE …/members/{userId}` 自分指定・FR-INVITE-06）してから承諾する |

「所有（FAMILY_LEDGER_EXISTS）」は本人が作成したオーナーのみの自動削除を許すケース、「参加済み（ALREADY_FAMILY_MEMBER）」は他者帳簿への所属で意図しない離脱を避けるため拒否するケースとして区別する。いずれも Service で `ledger_members` を検証する（database.md 3.3）。

## 4.4 POST /api/invitations/{invitationId}/decline

招待を拒否する。

## 4.5 DELETE /api/invitations/{invitationId}

招待の取消（招待者のみ・pendingのみ）。

---

# 5. カテゴリ（CATEGORY）

## 5.1 GET /api/ledgers/{ledgerId}/categories

カテゴリ一覧（sort_order順）。

## 5.2 POST /api/ledgers/{ledgerId}/categories

カテゴリ追加。リクエスト：`{ "name": "ペット", "isFixedCost": false }`

## 5.3 PATCH /api/ledgers/{ledgerId}/categories/{categoryId}

名称・固定費フラグの変更（is_system カテゴリは名称変更不可）。

## 5.4 DELETE /api/ledgers/{ledgerId}/categories/{categoryId}

カテゴリ削除（FR-CATEGORY-03）。

| パラメータ | 内容 |
| --- | --- |
| `reassignToCategoryId` | 使用中明細の付け替え先。省略時は「その他」（is_system）へ付け替え |

is_system カテゴリは削除不可（403）。

## 5.5 PUT /api/ledgers/{ledgerId}/categories/order

並び替え（FR-CATEGORY-01）。リクエスト：`{ "categoryIds": ["uuid", "uuid", ...] }`（全件の順序を送る）

---

# 6. 明細（ENTRY）

## 6.1 GET /api/ledgers/{ledgerId}/entries

明細一覧（FR-ENTRY-04）。ページング必須。

| パラメータ | 内容 |
| --- | --- |
| `billingMonth` | 支払月 `YYYY-MM`（既定の絞り込み軸。billing_month の完全一致） |
| `from` / `to` | 利用日（used_on）の範囲指定 `YYYY-MM-DD`（`billingMonth` と併用可） |
| `categoryId` | カテゴリ絞り込み |
| `minAmount` / `maxAmount` | 金額範囲 |
| `q` | 摘要・メモのキーワード検索 |
| `source` | `manual` / `csv` / `pdf` |
| `sort` | `usedOn`（既定） / `amount` |
| `order` | `asc` / `desc`（既定 desc） |

レスポンス例：

```json
{
  "data": [
    {
      "id": "uuid",
      "usedOn": "2026-06-23",
      "billingMonth": "2026-07",
      "amount": 1280,
      "description": "スーパーマルエツ",
      "category": { "id": "uuid", "name": "食費" },
      "paymentMethod": "楽天カード",
      "memo": null,
      "source": "csv",
      "createdBy": { "id": "uuid", "displayName": "たろう" },
      "paidBy": { "id": "uuid", "displayName": "たろう" },
      "splitType": "default",
      "splitShares": null,
      "assignedTo": null
    }
  ],
  "meta": { "page": 1, "perPage": 20, "totalCount": 214, "totalPages": 11 }
}
```

`paidBy` / `splitType` / `splitShares` / `assignedTo` は家族家計簿の按分・精算（FR-SPLIT）用フィールド。個人家計簿では `paidBy` は常に本人・`splitType` は常に `default` で、UIは表示しない。

## 6.2 POST /api/ledgers/{ledgerId}/entries

明細を手入力で登録する（FR-ENTRY-01）。

リクエスト：

```json
{
  "usedOn": "2026-06-23",
  "billingMonth": "2026-07",
  "amount": 1280,
  "description": "スーパーマルエツ",
  "categoryId": "uuid",
  "paymentMethod": "現金",
  "memo": null,
  "paidByUserId": "uuid",
  "splitType": "default",
  "splitShares": null,
  "assignedUserId": null
}
```

`billingMonth` は省略可（省略時は `usedOn` と同じ月）。

`paidByUserId` / `splitType` / `splitShares` / `assignedUserId` は省略可（FR-SPLIT）。

| フィールド | 内容 |
| --- | --- |
| `paidByUserId` | 支払者。省略時は登録者本人（自分）。家族家計簿のメンバーである必要がある |
| `splitType` | `default`（既定値・省略時）／`custom`／`assigned` |
| `splitShares` | `splitType = "custom"` のとき必須。`[{ "userId": "uuid", "weight": 60 }, ...]`（正の整数・2件以上）。他のtypeでは指定不可（400） |
| `assignedUserId` | `splitType = "assigned"` のとき必須。他のtypeでは指定不可（400） |

個人家計簿では `splitType` は `default` 固定とし、`splitShares` / `assignedUserId` の指定は 400 とする。

## 6.3 GET /api/ledgers/{ledgerId}/entries/{entryId}

明細の詳細。

## 6.4 PATCH /api/ledgers/{ledgerId}/entries/{entryId}

明細の編集（FR-ENTRY-02）。カテゴリを変更した場合、Service層でカテゴリ学習ルール（category_rules）を更新する（FR-AICAT-03）。リクエストボディは 6.2 と同じ形式（送信したフィールドのみ更新）。

## 6.5 DELETE /api/ledgers/{ledgerId}/entries/{entryId}

論理削除（FR-ENTRY-03）。

---

# 7. インポート（IMPORT）

「解析（プレビュー）」と「確定（登録）」を分離した2段階API（architecture.md 7.1）。

## 7.1 POST /api/ledgers/{ledgerId}/imports/analyze

ファイルを解析しプレビューを返す。`multipart/form-data`。

| フィールド | 内容 |
| --- | --- |
| `file` | CSV または PDF（最大10MB） |
| `billingMonth` | 支払月 `YYYY-MM`（必須）。この取込ファイル（＝1回の請求書）全体の既定値として全行に適用する。プレビューで行ごとに上書き可能 |
| `format` | 省略時は自動判定。`rakuten` / `jcb` / `epos` / `saison` / `generic` |
| `mappingId` | format=generic 時の保存済みマッピングID |
| `mapping` | format=generic 時のインラインマッピング（JSON文字列） |
| `force` | `true` で同一ファイル警告（DUPLICATE_FILE）を無視して解析 |

DUPLICATE_FILE（FR-DUP-03）の判定対象：同一帳簿内で `file_hash` が一致する import_files のうち **status が `failed` 以外**（`analyzed` / `completed` / `partial`）。解析失敗したファイルの再取込は警告なしでやり直せる。

処理内容：フォーマット判定 → パース／OCR → カテゴリ判定（category_rules優先・なければAI）→ 重複候補検知 → 原本をDriveへ保存 → import_files を `analyzed` で作成。

レスポンス例：

```json
{
  "data": {
    "importFileId": "uuid",
    "format": "rakuten",
    "fileName": "meisai_202606.csv",
    "rows": [
      {
        "rowNo": 1,
        "usedOn": "2026-06-28",
        "billingMonth": "2026-07",
        "amount": 3980,
        "description": "アマゾン",
        "suggestedCategoryId": "uuid",
        "categorySource": "rule",
        "duplicate": { "entryId": "uuid", "usedOn": "2026-06-28", "amount": 3980 },
        "error": null
      }
    ],
    "errorRows": [
      { "rowNo": 14, "raw": "…", "message": "日付を解釈できません" }
    ]
  }
}
```

* `categorySource`：`rule`（学習ルール） / `ai` / `none`（未分類＝その他）
* フォーマット判定不能時：400 VALIDATION_ERROR（code details: `FORMAT_UNKNOWN`）。クライアントは format または mapping を指定して再実行する
* OCR失敗時：import_files を `failed` で記録し、502 AI_UNAVAILABLE を返す（FR-PDF-03）
* **PDFの場合**：`format` パラメータ（rakuten / jcb / epos / saison / generic）はCSV用でありPDFでは指定不要。ファイル種別がPDFのときサーバーは `import_files.format` に `pdf` を設定する（対応カード会社はFR-PDF-04だが、Phase 2ではPDFのカード会社別値は保持せず一律 `pdf` とする。会社別のPDFパースが必要になった時点で拡張する）

## 7.2 POST /api/ledgers/{ledgerId}/imports/{importFileId}/confirm

プレビューで確認・修正した明細を確定登録する（FR-CSV-04 / FR-PDF-02）。

リクエスト：

```json
{
  "rows": [
    {
      "usedOn": "2026-06-28",
      "billingMonth": "2026-07",
      "amount": 3980,
      "description": "アマゾン",
      "categoryId": "uuid",
      "memo": "特売",
      "skip": false,
      "paidByUserId": "uuid",
      "splitType": "default",
      "splitShares": null,
      "assignedUserId": null
    }
  ]
}
```

* `paidByUserId` / `splitType` / `splitShares` / `assignedUserId` は省略可（FR-SPLIT）。省略時は `paidByUserId` = アップロード実行者、`splitType` = `default`。バリデーションは 6.2 と同じ
* `skip: true` の行は登録しない（重複候補の既定値はskip・FR-DUP-02）
* サーバー側で重複を再チェックする（解析後に他の登録が入った場合に備える）
* 完了後 import_files を `completed`（全件成功）または `partial` へ更新し、件数を記録する（FR-CSV-05）
* status が `analyzed` 以外の import_files への確定は 409 CONFLICT

レスポンス：`{ "data": { "importedCount": 42, "skippedCount": 3, "errorCount": 0 } }`

## 7.3 GET /api/ledgers/{ledgerId}/imports

取込履歴一覧（ページング。`sort`: `createdAt` のみ）。Driveリンク（`driveWebViewLink`）・取込時に指定した支払月（`billingMonth`）を含む（FR-DRIVE-05）。

## 7.4 GET /api/ledgers/{ledgerId}/imports/{importFileId}

取込履歴の詳細（件数・エラー行・Drive保存状態・`billingMonth`）。

## 7.5 GET /api/ledgers/{ledgerId}/imports/{importFileId}/download

原本ファイルのダウンロード（FR-DRIVE-03）。APIがDriveから取得して返す（Driveへの直接アクセスはさせない）。Drive未保存（drive_status=failed）の場合は 404。

## 7.6 DELETE /api/ledgers/{ledgerId}/imports/{importFileId}/file

Drive上の原本ファイルのみ削除する（FR-DRIVE-04）。取込済み明細と履歴は残る。

* 削除後、import_files の `drive_file_id` / `drive_web_view_link` を NULL へクリアする（ファイル実体の有無は `drive_file_id` の NULL 判定で扱う。state.md 3章）

---

# 8. CSV列マッピング（MAPPING）

## 8.1 GET /api/ledgers/{ledgerId}/csv-mappings

保存済みマッピング一覧。

## 8.2 POST /api/ledgers/{ledgerId}/csv-mappings

マッピング保存（FR-CSV-02）。

リクエスト：

```json
{
  "name": "◯◯カード用",
  "mapping": {
    "headerRows": 1,
    "usedOnColumn": 0,
    "usedOnFormat": "YYYY/MM/DD",
    "descriptionColumn": 1,
    "amountColumn": 4
  }
}
```

## 8.3 PATCH /api/ledgers/{ledgerId}/csv-mappings/{mappingId}

## 8.4 DELETE /api/ledgers/{ledgerId}/csv-mappings/{mappingId}

---

# 9. 分析・ダッシュボード（ANALYSIS）

集計系（9.1〜9.5）はSQL集計のみでAIを使わない。AI所見（9.6）のみOpenAIを呼び、失敗しても集計系は影響を受けない（FR-AI-11）。
集計はすべて支払月（billing_month）基準（利用日ではなく、その月に実際に請求される金額として集計する）。以下の `month` パラメータはすべて支払月を指す。
`month` 省略時の既定値：毎月10日を締め日とし、10日を含めそれ以前なら当月、10日を超えたら翌月とする（`currentBillingMonth`）。

## 9.1 GET /api/ledgers/{ledgerId}/dashboard

ダッシュボード表示用の一括取得（FR-DASH-01）。

```json
{
  "data": {
    "month": "2026-07",
    "totalAmount": 182450,
    "prevMonthAmount": 195020,
    "prevYearSameMonthAmount": 170300,
    "byCategory": [
      { "categoryId": "uuid", "categoryName": "食費", "amount": 52300 }
    ],
    "recentEntries": [ ]
  }
}
```

## 9.2 GET /api/ledgers/{ledgerId}/analysis/summary

月次サマリー（FR-AI-01〜03の集計部分）。`month` 必須。カテゴリ別金額・前月比・前年同月比を返す。

## 9.3 GET /api/ledgers/{ledgerId}/analysis/trend

カテゴリ別推移（FR-AI-04）。

| パラメータ | 内容 |
| --- | --- |
| `months` | 遡る月数（既定 12・最大 36） |
| `categoryId` | 省略時は全カテゴリ |

## 9.4 GET /api/ledgers/{ledgerId}/analysis/ranking

支出ランキング（FR-AI-05）。`month`（支払月・省略時は今月）。`limit`（既定 20）。

## 9.5 GET /api/ledgers/{ledgerId}/analysis/subscriptions

サブスク検知（FR-AI-07）。毎月同額・同摘要の明細グループを返す。

## 9.6 GET /api/ledgers/{ledgerId}/analysis/insight

AI所見（FR-AI-01 所見 / FR-AI-06 固定費分析 / FR-AI-08 節約提案 / FR-AI-09 予測）。

| パラメータ | 内容 |
| --- | --- |
| `type` | `monthly_review` / `fixed_cost` / `saving_advice` / `forecast` |
| `month` | 対象月（必須） |
| `refresh` | `true` でキャッシュを破棄して再生成 |

* analysis_caches にキャッシュし、入力（集計結果）が変わらない限り再利用する（NFR-13）
* AI失敗時：502 AI_UNAVAILABLE

```json
{
  "data": {
    "type": "monthly_review",
    "month": "2026-07",
    "generatedAt": "2026-07-05T10:00:00Z",
    "insight": {
      "summary": "今月は食費が前月比+15%です。…",
      "points": [ "…" ]
    }
  }
}
```

---

# 10. 通知設定（NOTIFY）

## 10.1 GET /api/notification-settings

自分の通知設定（FR-NOTIFY-03）。

## 10.2 PATCH /api/notification-settings

```json
{
  "monthlyEnabled": true,
  "monthlyDay": 1,
  "inactivityEnabled": true,
  "inactivityDays": 7
}
```

---

# 11. 内部API（Cron）

## 11.1 GET /api/cron/notifications

Vercel Cronから日次で起動される通知バッチ（FR-NOTIFY-01〜02）。

* 認証：`Authorization: Bearer {CRON_SECRET}`（不一致は401）
* クライアントからは使用しない
* 月次定期（当日が通知設定日）と未登録検知（最終登録からN日経過）を処理し、送信済みを notification_settings に記録して重複送信を防ぐ

---

# 12. 按分・精算（SPLIT）

**家族家計簿限定**（FR-SPLIT）。個人家計簿に対する呼び出しは 400 VALIDATION_ERROR とする。

## 12.1 PUT /api/ledgers/{ledgerId}/split/weights

既定按分比重の一括更新（FR-SPLIT-01/02）。オーナーのみ（403）。

リクエスト：

```json
{
  "weights": [
    { "userId": "uuid-taro", "weight": 60 },
    { "userId": "uuid-hanako", "weight": 40 }
  ]
}
```

* `weights` は家計簿の現メンバー全員分を含むこと（過不足があれば400 VALIDATION_ERROR）
* `weight` は正の整数（0以下は400）

レスポンス：`GET /members`（3.6）と同じ形式で更新後の一覧を返す。

## 12.2 GET /api/ledgers/{ledgerId}/split/settlement

指定した支払月の精算計算（FR-SPLIT-05）。都度計算でありキャッシュは持たない。

| パラメータ | 内容 |
| --- | --- |
| `billingMonth` | 支払月 `YYYY-MM`（必須） |

レスポンス例：

```json
{
  "data": {
    "billingMonth": "2026-07",
    "members": [
      {
        "userId": "uuid-taro",
        "displayName": "たろう",
        "weight": 60,
        "fairShareAmount": 36000,
        "paidAmount": 50000,
        "balance": 14000
      },
      {
        "userId": "uuid-hanako",
        "displayName": "はなこ",
        "weight": 40,
        "fairShareAmount": 24000,
        "paidAmount": 10000,
        "balance": -14000
      }
    ],
    "transfers": [
      { "fromUserId": "uuid-hanako", "toUserId": "uuid-taro", "amount": 14000 }
    ],
    "excludedEntryCount": 0
  }
}
```

| フィールド | 内容 |
| --- | --- |
| `fairShareAmount` | 按分後の本来の負担額（`splitType` に応じて `default` は現在の `expense_weight`、`custom` は `splitShares`、`assigned` は該当者へ全額を按分した合計） |
| `paidAmount` | 実際に支払った額の合計（`paidByUserId` に基づく） |
| `balance` | `paidAmount - fairShareAmount`。正なら他メンバーから受け取るべき額、負なら支払うべき額 |
| `transfers` | `balance` を相殺する最小送金の一覧（貪欲法で計算。3名以上でも成立） |
| `excludedEntryCount` | 退出済みメンバーが関与し精算対象から除外した明細数（想定される失敗ケース。requirements.md 8参照） |

* メンバーが1名以下（招待前）の場合：200 で `members` に1件のみ・`transfers` は空配列を返す（画面側で空状態表示。requirements.md FR-SPLIT-08）

---

# 改訂履歴

| 日付 | 内容 |
| --- | --- |
| 2026-07-05 | 初版作成 |
| 2026-07-05 | レビュー指摘反映：招待承諾の ALREADY_FAMILY_MEMBER（409）を追加（FR-LEDGER-05）。ユーザー検索の同名区別方針を明記。PDF取込時の format 挙動を明記。analysis_type（9.6）を database.md と統一 |
| 2026-07-05 | 再レビュー反映：DUPLICATE_FILE の判定対象 status を明記（failed は対象外）。7.6 に drive_file_id / drive_web_view_link のクリアを明記 |
| 2026-07-10 | エラーコード表に INTERNAL_ERROR（500）を追記（1.2 の 500 に対応するコードが未定義だった欠落の補完） |
| 2026-07-21 | 明細に支払月（billingMonth）を追加。6.1 の絞り込み軸を `month`（used_on基準）から `billingMonth`（billing_month完全一致・from/toと併用可）へ変更。6.2 にbillingMonthを追加（省略時はusedOnと同じ月）。7.1 にbillingMonth（必須・取込全体の既定値）、7.2の各行にbillingMonth・memoを追加。9系の集計基準をused_onからbilling_monthへ変更し、9.4のfrom/to指定を廃止（monthのみ） |
| 2026-07-21 | import_files に billing_month を追加し 7.3/7.4 のレスポンスへ反映。9系の `month` 省略時デフォルトを「毎月10日締め」（`currentBillingMonth`）で明記 |
| 2026-07-21 | 按分・精算（FR-SPLIT・家族家計簿限定）を実装。3.6 メンバー一覧に weight を追加。6.1/6.2/6.4 の明細に paidBy/splitType/splitShares/assignedTo を追加。7.2 確定行に同フィールドを追加。新規 12章：`PUT /split/weights`（既定比重更新）・`GET /split/settlement`（精算計算） |
