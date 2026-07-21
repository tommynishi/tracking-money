"use client";

/**
 * SCR-03 明細一覧（screen.md・FR-ENTRY-04）。PCは表形式・スマホはカード形式（ui-rules）。
 * 家計簿未作成時は初期セットアップ（LedgerSetup）を表示する。
 */
import { useCallback, useEffect, useState } from "react";

import { apiFetch, isApiError } from "@/shared/api/client";
import type { ListMeta } from "@/shared/api/response";
import { Button } from "@/shared/components/Button";
import { Modal } from "@/shared/components/Modal";
import { useToast } from "@/shared/components/toast/ToastProvider";
import { formatAmount, formatDateList } from "@/shared/utils/format";
import { currentBillingMonth } from "@/shared/utils/month";

import type { Category } from "@/features/category/types";
import { LedgerSetup } from "@/features/ledger/components/LedgerSetup";
import type { LedgerMember, LedgerType } from "@/features/ledger/types";

import type { EntryListItem } from "../types";
import { EntryFormModal } from "./EntryFormModal";

type Me = {
  readonly id: string;
  readonly personalLedgerId: string | null;
  readonly familyLedgerId: string | null;
};

type LedgerDetail = { readonly type: LedgerType };

/** 支払者・按分方法の要約バッジ文言（家族家計簿限定・FR-SPLIT）。 */
const splitBadgeText = (entry: EntryListItem): string => {
  const paidBy = `${entry.paidBy.displayName}が支払`;
  if (entry.splitType === "assigned" && entry.assignedTo !== null) {
    return `${paidBy}・${entry.assignedTo.displayName}に全額計上`;
  }
  if (entry.splitType === "custom") {
    return `${paidBy}・独自比重`;
  }
  return `${paidBy}・既定比重`;
};

type LoadState = "loading" | "ready" | "error";

export const EntriesScreen = () => {
  const { showToast } = useToast();
  const [ledgerId, setLedgerId] = useState<string | null>(null);
  const [meId, setMeId] = useState<string | null>(null);
  const [meState, setMeState] = useState<LoadState>("loading");
  const [needsSetup, setNeedsSetup] = useState(false);

  const [categories, setCategories] = useState<Category[]>([]);
  const [ledgerType, setLedgerType] = useState<LedgerType>("personal");
  const [members, setMembers] = useState<LedgerMember[]>([]);
  const [entries, setEntries] = useState<EntryListItem[]>([]);
  const [meta, setMeta] = useState<ListMeta | null>(null);
  const [listState, setListState] = useState<LoadState>("loading");

  const [billingMonth, setBillingMonth] = useState(currentBillingMonth());
  const [categoryId, setCategoryId] = useState("");
  const [page, setPage] = useState(1);

  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingEntry, setEditingEntry] = useState<EntryListItem | undefined>(undefined);
  const [deletingEntry, setDeletingEntry] = useState<EntryListItem | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // effect 内での同期 setState を避けるため、"loading" への遷移は呼び出し側（イベントハンドラ）で行い、
  // 結果の反映はレスポンス到着後のコールバックで行う
  const loadMe = useCallback(
    (): Promise<void> =>
      apiFetch<Me>("/api/me")
        .then(({ data }) => {
          setMeId(data.id);
          const resolved = data.personalLedgerId ?? data.familyLedgerId;
          if (resolved === null) {
            setNeedsSetup(true);
          } else {
            setLedgerId(resolved);
          }
          setMeState("ready");
        })
        .catch(() => setMeState("error")),
    [],
  );

  useEffect(() => {
    void loadMe();
  }, [loadMe]);

  useEffect(() => {
    if (ledgerId === null) return;
    void apiFetch<Category[]>(`/api/ledgers/${ledgerId}/categories`)
      .then(({ data }) => setCategories(data))
      .catch(() => showToast({ type: "error", message: "カテゴリの取得に失敗しました" }));
  }, [ledgerId, showToast]);

  // 按分・精算（FR-SPLIT）は家族家計簿限定。type とメンバー一覧は明細フォームの支払者選択に使う
  useEffect(() => {
    if (ledgerId === null) return;
    void apiFetch<LedgerDetail>(`/api/ledgers/${ledgerId}`)
      .then(({ data }) => {
        setLedgerType(data.type);
        if (data.type === "family") {
          return apiFetch<LedgerMember[]>(`/api/ledgers/${ledgerId}/members`).then(({ data: m }) =>
            setMembers(m),
          );
        }
        setMembers([]);
        return undefined;
      })
      .catch(() => showToast({ type: "error", message: "家計簿情報の取得に失敗しました" }));
  }, [ledgerId, showToast]);

  const loadEntries = useCallback((): Promise<void> => {
    if (ledgerId === null) return Promise.resolve();
    const params = new URLSearchParams({ billingMonth, page: String(page) });
    if (categoryId !== "") params.set("categoryId", categoryId);
    return apiFetch<EntryListItem[]>(`/api/ledgers/${ledgerId}/entries?${params.toString()}`)
      .then(({ data, meta: listMeta }) => {
        setEntries(data);
        setMeta(listMeta ?? null);
        setListState("ready");
      })
      .catch(() => setListState("error"));
  }, [ledgerId, billingMonth, categoryId, page]);

  useEffect(() => {
    void loadEntries();
  }, [loadEntries]);

  const handleDelete = async () => {
    if (deletingEntry === null || ledgerId === null) return;
    setIsDeleting(true);
    try {
      await apiFetch(`/api/ledgers/${ledgerId}/entries/${deletingEntry.id}`, { method: "DELETE" });
      showToast({ type: "success", message: "明細を削除しました" });
      setDeletingEntry(null);
      await loadEntries();
    } catch (error) {
      showToast({
        type: "error",
        message: isApiError(error) ? error.message : "削除に失敗しました",
      });
    } finally {
      setIsDeleting(false);
    }
  };

  if (meState === "loading") {
    return <div className="h-40 animate-pulse rounded-lg border border-border bg-surface" />;
  }
  if (meState === "error") {
    return (
      <section className="rounded-lg border border-border bg-surface p-6 text-center">
        <p className="text-sm text-danger">ユーザー情報の取得に失敗しました。</p>
        <Button
          className="mt-4"
          variant="secondary"
          onClick={() => {
            setMeState("loading");
            void loadMe();
          }}
        >
          再試行
        </Button>
      </section>
    );
  }
  if (needsSetup) {
    return (
      <LedgerSetup
        onCreated={(createdLedgerId) => {
          setNeedsSetup(false);
          setLedgerId(createdLedgerId);
        }}
      />
    );
  }
  if (ledgerId === null) return null;

  const openCreate = () => {
    setEditingEntry(undefined);
    setIsFormOpen(true);
  };
  const openEdit = (entry: EntryListItem) => {
    setEditingEntry(entry);
    setIsFormOpen(true);
  };

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-lg font-semibold text-foreground">明細一覧</h1>
        <Button onClick={openCreate}>明細を登録</Button>
      </div>

      <div className="flex flex-wrap items-end gap-3 rounded-lg border border-border bg-surface p-4">
        <div>
          <label htmlFor="filter-month" className="block text-xs font-medium text-muted">
            支払月
          </label>
          <input
            id="filter-month"
            type="month"
            value={billingMonth}
            onChange={(event) => {
              setListState("loading");
              setBillingMonth(event.target.value);
              setPage(1);
            }}
            className="mt-1 rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground"
          />
        </div>
        <div>
          <label htmlFor="filter-category" className="block text-xs font-medium text-muted">
            カテゴリ
          </label>
          <select
            id="filter-category"
            value={categoryId}
            onChange={(event) => {
              setListState("loading");
              setCategoryId(event.target.value);
              setPage(1);
            }}
            className="mt-1 rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground"
          >
            <option value="">すべて</option>
            {categories.map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {listState === "error" ? (
        <div className="rounded-lg border border-border bg-surface p-6 text-center">
          <p className="text-sm text-danger">明細の取得に失敗しました。</p>
          <Button
            className="mt-4"
            variant="secondary"
            onClick={() => {
              setListState("loading");
              void loadEntries();
            }}
          >
            再試行
          </Button>
        </div>
      ) : listState === "loading" ? (
        <div className="h-64 animate-pulse rounded-lg border border-border bg-surface" />
      ) : entries.length === 0 ? (
        <div className="rounded-lg border border-border bg-surface p-10 text-center">
          <p className="text-sm text-muted">この条件の明細はまだありません。</p>
          <Button className="mt-4" onClick={openCreate}>
            明細を登録する
          </Button>
        </div>
      ) : (
        <>
          {/* PC: 表形式（ui-rules） */}
          <div className="hidden overflow-x-auto rounded-lg border border-border bg-surface sm:block">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs text-muted">
                  <th className="px-4 py-3 font-medium">利用日</th>
                  <th className="px-4 py-3 font-medium">支払月</th>
                  <th className="px-4 py-3 font-medium">摘要</th>
                  <th className="px-4 py-3 font-medium">カテゴリ</th>
                  <th className="px-4 py-3 text-right font-medium">金額</th>
                  <th className="px-4 py-3 font-medium">登録者</th>
                  {ledgerType === "family" && (
                    <th className="px-4 py-3 font-medium">支払者・按分</th>
                  )}
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody>
                {entries.map((entry) => (
                  <tr key={entry.id} className="border-b border-border last:border-b-0">
                    <td className="px-4 py-3 whitespace-nowrap text-foreground">
                      {formatDateList(entry.usedOn)}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-muted">{entry.billingMonth}</td>
                    <td className="px-4 py-3 text-foreground">{entry.description}</td>
                    <td className="px-4 py-3 text-muted">{entry.category.name}</td>
                    <td className="px-4 py-3 text-right font-medium whitespace-nowrap text-foreground">
                      {formatAmount(entry.amount)}
                    </td>
                    <td className="px-4 py-3 text-muted">{entry.createdBy.displayName}</td>
                    {ledgerType === "family" && (
                      <td className="px-4 py-3 text-xs whitespace-nowrap text-muted">
                        {splitBadgeText(entry)}
                      </td>
                    )}
                    <td className="px-4 py-3 text-right whitespace-nowrap">
                      <Button variant="ghost" onClick={() => openEdit(entry)}>
                        編集
                      </Button>
                      <Button variant="ghost" onClick={() => setDeletingEntry(entry)}>
                        削除
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* スマホ: カード形式（ui-rules） */}
          <ul className="space-y-3 sm:hidden">
            {entries.map((entry) => (
              <li key={entry.id} className="rounded-lg border border-border bg-surface p-4">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs text-muted">{formatDateList(entry.usedOn)}</span>
                  <span className="font-medium text-foreground">{formatAmount(entry.amount)}</span>
                </div>
                <p className="mt-1 text-sm text-foreground">{entry.description}</p>
                <p className="mt-1 text-xs text-muted">
                  {entry.category.name} ・ {entry.createdBy.displayName}
                  {entry.billingMonth !== entry.usedOn.slice(0, 7) && ` ・ 支払月 ${entry.billingMonth}`}
                  {ledgerType === "family" && ` ・ ${splitBadgeText(entry)}`}
                </p>
                <div className="mt-2 flex justify-end gap-2">
                  <Button variant="ghost" onClick={() => openEdit(entry)}>
                    編集
                  </Button>
                  <Button variant="ghost" onClick={() => setDeletingEntry(entry)}>
                    削除
                  </Button>
                </div>
              </li>
            ))}
          </ul>

          {meta !== null && meta.totalPages > 1 && (
            <nav aria-label="ページ送り" className="flex items-center justify-center gap-3">
              <Button
                variant="secondary"
                disabled={page <= 1}
                onClick={() => setPage((current) => current - 1)}
              >
                前へ
              </Button>
              <span className="text-sm text-muted">
                {meta.page} / {meta.totalPages}
              </span>
              <Button
                variant="secondary"
                disabled={page >= meta.totalPages}
                onClick={() => setPage((current) => current + 1)}
              >
                次へ
              </Button>
            </nav>
          )}
        </>
      )}

      <EntryFormModal
        isOpen={isFormOpen}
        onClose={() => setIsFormOpen(false)}
        onSaved={() => void loadEntries()}
        ledgerId={ledgerId}
        categories={categories}
        ledgerType={ledgerType}
        members={members}
        selfUserId={meId}
        entry={editingEntry}
      />

      <Modal
        isOpen={deletingEntry !== null}
        onClose={() => setDeletingEntry(null)}
        title="明細を削除しますか？"
        closeOnBackdrop={false}
      >
        <p className="text-sm text-muted">
          「{deletingEntry?.description}」（{formatAmount(deletingEntry?.amount ?? 0)}
          ）を削除します。この操作は取り消せません。
        </p>
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="secondary" onClick={() => setDeletingEntry(null)}>
            キャンセル
          </Button>
          <Button variant="danger" isLoading={isDeleting} onClick={() => void handleDelete()}>
            削除する
          </Button>
        </div>
      </Modal>
    </section>
  );
};
