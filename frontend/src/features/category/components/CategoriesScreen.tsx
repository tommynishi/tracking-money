"use client";

/**
 * SCR-05 カテゴリ管理（screen.md・FR-CATEGORY-01〜04）。
 * 追加・名称/固定費の変更・削除（その他へ付け替え）・↑↓での並び替え（全件を PUT）。
 */
import { useCallback, useEffect, useState } from "react";

import { apiFetch, isApiError } from "@/shared/api/client";
import { Button } from "@/shared/components/Button";
import { Modal } from "@/shared/components/Modal";
import { useToast } from "@/shared/components/toast/ToastProvider";

import { useMe } from "@/features/auth/hooks/useMe";

import type { Category } from "../types";

const inputClass =
  "rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground";

export const CategoriesScreen = () => {
  const { showToast } = useToast();
  const { me, state: meState, retry } = useMe();
  const ledgerId = me === null ? null : (me.personalLedgerId ?? me.familyLedgerId);

  const [categories, setCategories] = useState<Category[]>([]);
  const [listState, setListState] = useState<"loading" | "ready" | "error">("loading");
  const [newName, setNewName] = useState("");
  const [newIsFixed, setNewIsFixed] = useState(false);
  const [isAdding, setIsAdding] = useState(false);
  const [editing, setEditing] = useState<Category | null>(null);
  const [deleting, setDeleting] = useState<Category | null>(null);
  const [isMutating, setIsMutating] = useState(false);

  const load = useCallback((): Promise<void> => {
    if (ledgerId === null) return Promise.resolve();
    return apiFetch<Category[]>(`/api/ledgers/${ledgerId}/categories`)
      .then(({ data }) => {
        setCategories(data);
        setListState("ready");
      })
      .catch(() => setListState("error"));
  }, [ledgerId]);

  useEffect(() => {
    void load();
  }, [load]);

  const notifyError = (error: unknown, fallback: string) =>
    showToast({ type: "error", message: isApiError(error) ? error.message : fallback });

  const handleAdd = async (event: React.FormEvent) => {
    event.preventDefault();
    if (ledgerId === null) return;
    setIsAdding(true);
    try {
      await apiFetch(`/api/ledgers/${ledgerId}/categories`, {
        method: "POST",
        body: JSON.stringify({ name: newName, isFixedCost: newIsFixed }),
      });
      showToast({ type: "success", message: "カテゴリを追加しました" });
      setNewName("");
      setNewIsFixed(false);
      await load();
    } catch (error) {
      notifyError(error, "カテゴリの追加に失敗しました");
    } finally {
      setIsAdding(false);
    }
  };

  const handleUpdate = async (
    category: Category,
    fields: { name?: string; isFixedCost?: boolean },
  ) => {
    if (ledgerId === null) return;
    setIsMutating(true);
    try {
      await apiFetch(`/api/ledgers/${ledgerId}/categories/${category.id}`, {
        method: "PATCH",
        body: JSON.stringify(fields),
      });
      showToast({ type: "success", message: "カテゴリを更新しました" });
      setEditing(null);
      await load();
    } catch (error) {
      notifyError(error, "カテゴリの更新に失敗しました");
    } finally {
      setIsMutating(false);
    }
  };

  const handleDelete = async () => {
    if (ledgerId === null || deleting === null) return;
    setIsMutating(true);
    try {
      await apiFetch(`/api/ledgers/${ledgerId}/categories/${deleting.id}`, { method: "DELETE" });
      showToast({ type: "success", message: "カテゴリを削除しました（明細は「その他」へ）" });
      setDeleting(null);
      await load();
    } catch (error) {
      notifyError(error, "カテゴリの削除に失敗しました");
    } finally {
      setIsMutating(false);
    }
  };

  const handleMove = async (index: number, direction: -1 | 1) => {
    if (ledgerId === null) return;
    const next = [...categories];
    const [moved] = next.splice(index, 1);
    next.splice(index + direction, 0, moved);
    setCategories(next);
    try {
      await apiFetch(`/api/ledgers/${ledgerId}/categories/order`, {
        method: "PUT",
        body: JSON.stringify({ categoryIds: next.map((category) => category.id) }),
      });
    } catch (error) {
      notifyError(error, "並び替えに失敗しました");
      await load();
    }
  };

  if (meState === "loading") {
    return <div className="h-40 animate-pulse rounded-lg border border-border bg-surface" />;
  }
  if (meState === "error" || ledgerId === null) {
    return (
      <section className="rounded-lg border border-border bg-surface p-6 text-center">
        <p className="text-sm text-danger">
          {meState === "error" ? "ユーザー情報の取得に失敗しました。" : "家計簿がまだありません。"}
        </p>
        {meState === "error" && (
          <Button className="mt-4" variant="secondary" onClick={retry}>
            再試行
          </Button>
        )}
      </section>
    );
  }

  return (
    <section className="space-y-4">
      <h1 className="text-lg font-semibold text-foreground">カテゴリ管理</h1>

      <form
        onSubmit={handleAdd}
        className="flex flex-wrap items-end gap-3 rounded-lg border border-border bg-surface p-4"
      >
        <div className="min-w-40 flex-1">
          <label htmlFor="new-category-name" className="block text-xs font-medium text-muted">
            カテゴリ名
          </label>
          <input
            id="new-category-name"
            required
            maxLength={30}
            value={newName}
            onChange={(event) => setNewName(event.target.value)}
            className={`mt-1 w-full ${inputClass}`}
          />
        </div>
        <label className="flex min-h-11 items-center gap-2 text-sm text-foreground">
          <input
            type="checkbox"
            checked={newIsFixed}
            onChange={(event) => setNewIsFixed(event.target.checked)}
          />
          固定費
        </label>
        <Button type="submit" isLoading={isAdding}>
          追加
        </Button>
      </form>

      {listState === "error" ? (
        <div className="rounded-lg border border-border bg-surface p-6 text-center">
          <p className="text-sm text-danger">カテゴリの取得に失敗しました。</p>
          <Button
            className="mt-4"
            variant="secondary"
            onClick={() => {
              setListState("loading");
              void load();
            }}
          >
            再試行
          </Button>
        </div>
      ) : listState === "loading" ? (
        <div className="h-64 animate-pulse rounded-lg border border-border bg-surface" />
      ) : (
        <ul className="divide-y divide-border rounded-lg border border-border bg-surface">
          {categories.map((category, index) => (
            <li key={category.id} className="flex flex-wrap items-center gap-2 px-4 py-2">
              <div className="flex flex-col">
                <Button
                  variant="ghost"
                  aria-label={`${category.name}を上へ`}
                  className="min-h-6 px-2 py-0"
                  disabled={index === 0}
                  onClick={() => void handleMove(index, -1)}
                >
                  ↑
                </Button>
                <Button
                  variant="ghost"
                  aria-label={`${category.name}を下へ`}
                  className="min-h-6 px-2 py-0"
                  disabled={index === categories.length - 1}
                  onClick={() => void handleMove(index, 1)}
                >
                  ↓
                </Button>
              </div>
              <span className="flex-1 text-sm text-foreground">
                {category.name}
                {category.isSystem && <span className="ml-2 text-xs text-muted">（システム）</span>}
                {category.isFixedCost && <span className="ml-2 text-xs text-muted">固定費</span>}
              </span>
              <Button
                variant="ghost"
                onClick={() => void handleUpdate(category, { isFixedCost: !category.isFixedCost })}
              >
                固定費{category.isFixedCost ? "解除" : "に設定"}
              </Button>
              {!category.isSystem && (
                <>
                  <Button variant="ghost" onClick={() => setEditing(category)}>
                    名称変更
                  </Button>
                  <Button variant="ghost" onClick={() => setDeleting(category)}>
                    削除
                  </Button>
                </>
              )}
            </li>
          ))}
        </ul>
      )}

      <Modal isOpen={editing !== null} onClose={() => setEditing(null)} title="カテゴリ名を変更">
        {editing !== null && (
          <form
            onSubmit={(event) => {
              event.preventDefault();
              const name = new FormData(event.currentTarget).get("name");
              if (typeof name === "string") void handleUpdate(editing, { name });
            }}
            className="space-y-4"
          >
            <input
              name="name"
              defaultValue={editing.name}
              required
              maxLength={30}
              className={`w-full ${inputClass}`}
            />
            <div className="flex justify-end gap-2">
              <Button type="button" variant="secondary" onClick={() => setEditing(null)}>
                キャンセル
              </Button>
              <Button type="submit" isLoading={isMutating}>
                変更する
              </Button>
            </div>
          </form>
        )}
      </Modal>

      <Modal
        isOpen={deleting !== null}
        onClose={() => setDeleting(null)}
        title="カテゴリを削除しますか？"
        closeOnBackdrop={false}
      >
        <p className="text-sm text-muted">
          「{deleting?.name}」を削除します。このカテゴリの明細は「その他」へ付け替えられます。
        </p>
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="secondary" onClick={() => setDeleting(null)}>
            キャンセル
          </Button>
          <Button variant="danger" isLoading={isMutating} onClick={() => void handleDelete()}>
            削除する
          </Button>
        </div>
      </Modal>
    </section>
  );
};
