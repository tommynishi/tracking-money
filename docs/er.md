# ER図（er.md）

Tracking Money のER図です。

カラムの完全な定義・制約・Indexは docs/database.md を正とします。本書はリレーション把握用の全体図です。

---

# ER図（全体）

```mermaid
erDiagram
    users ||--o{ ledgers : "所有する（owner_user_id）"
    users ||--o{ ledger_members : "参加する"
    ledgers ||--o{ ledger_members : "メンバーを持つ"
    ledgers ||--o{ ledger_invitations : "招待を持つ"
    users ||--o{ ledger_invitations : "招待する（inviter）"
    users ||--o{ ledger_invitations : "招待される（invitee）"
    ledgers ||--o{ categories : "カテゴリを持つ"
    ledgers ||--o{ entries : "明細を持つ"
    categories ||--o{ entries : "分類する"
    users ||--o{ entries : "登録する（created_by）"
    import_files ||--o{ entries : "取込元（NULL可）"
    ledgers ||--o{ import_files : "取込履歴を持つ"
    users ||--o{ import_files : "アップロードする"
    ledgers ||--o{ csv_column_mappings : "マッピングを持つ"
    ledgers ||--o{ category_rules : "学習ルールを持つ"
    categories ||--o{ category_rules : "対応先"
    users ||--o| notification_settings : "通知設定を持つ"
    ledgers ||--o{ analysis_caches : "分析キャッシュを持つ"

    users {
        uuid id PK
        text line_user_id UK "LINE OIDC sub"
        text display_name
        text avatar_url
        timestamptz created_at
        timestamptz updated_at
        timestamptz deleted_at
    }

    ledgers {
        uuid id PK
        uuid owner_user_id FK
        text type "personal / family"
        text name
        text drive_folder_id "DriveフォルダID・NULL可"
        timestamptz created_at
        timestamptz updated_at
        timestamptz deleted_at
    }

    ledger_members {
        uuid id PK
        uuid ledger_id FK
        uuid user_id FK
        text role "owner / member"
        timestamptz created_at
        timestamptz updated_at
        timestamptz deleted_at
    }

    ledger_invitations {
        uuid id PK
        uuid ledger_id FK
        uuid inviter_user_id FK
        uuid invitee_user_id FK
        text status "pending / accepted / declined / canceled"
        timestamptz responded_at
        timestamptz created_at
        timestamptz updated_at
        timestamptz deleted_at
    }

    categories {
        uuid id PK
        uuid ledger_id FK
        text name
        boolean is_fixed_cost
        boolean is_system "その他=true"
        integer sort_order
        timestamptz created_at
        timestamptz updated_at
        timestamptz deleted_at
    }

    entries {
        uuid id PK
        uuid ledger_id FK
        uuid category_id FK
        date used_on "利用日"
        integer amount "円・返金は負値"
        text description "摘要"
        text normalized_description "正規化済み摘要"
        text payment_method
        text memo
        text type "expense（将来拡張用）"
        text source "manual / csv / pdf"
        uuid import_file_id FK "NULL可"
        uuid created_by_user_id FK
        timestamptz created_at
        timestamptz updated_at
        timestamptz deleted_at
    }

    import_files {
        uuid id PK
        uuid ledger_id FK
        uuid uploaded_by_user_id FK
        text file_name
        text file_type "csv / pdf"
        text file_hash "SHA-256"
        text format "rakuten / jcb / epos / saison / generic / pdf"
        text status "analyzed / completed / partial / failed"
        integer imported_count
        integer skipped_count
        integer error_count
        jsonb error_detail
        text drive_file_id
        text drive_web_view_link
        text drive_status "uploaded / failed"
        timestamptz created_at
        timestamptz updated_at
        timestamptz deleted_at
    }

    csv_column_mappings {
        uuid id PK
        uuid ledger_id FK
        text name
        jsonb mapping
        timestamptz created_at
        timestamptz updated_at
        timestamptz deleted_at
    }

    category_rules {
        uuid id PK
        uuid ledger_id FK
        text normalized_description
        uuid category_id FK
        timestamptz created_at
        timestamptz updated_at
        timestamptz deleted_at
    }

    notification_settings {
        uuid id PK
        uuid user_id FK "UNIQUE"
        boolean monthly_enabled
        smallint monthly_day "1-31"
        date monthly_last_sent_on
        boolean inactivity_enabled
        smallint inactivity_days "1-90"
        timestamptz inactivity_last_sent_at
        timestamptz created_at
        timestamptz updated_at
        timestamptz deleted_at
    }

    analysis_caches {
        uuid id PK
        uuid ledger_id FK
        text analysis_type
        text period_key "例: 2026-07"
        text input_hash
        jsonb result
        timestamptz created_at
        timestamptz updated_at
    }
```

---

# 補足

* `analysis_caches` のみ論理削除（deleted_at）を持たない（派生データのため物理削除可・database.md 3.11）
* 「1ユーザーが所属できる家族家計簿は最大1つ」等、DB制約で表現しないルールは database.md 3.3 を参照

---

# 改訂履歴

| 日付 | 内容 |
| --- | --- |
| 2026-07-05 | 初版作成 |
| 2026-07-05 | レビュー指摘反映：ledgers に drive_folder_id を追加（FR-DRIVE-02） |
