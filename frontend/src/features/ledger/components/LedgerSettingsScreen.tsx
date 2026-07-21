"use client";

/**
 * SCR-06 家計簿設定（screen.md・FR-LEDGER-07/08・FR-INVITE-01/05/06）。
 * 対象帳簿の選択・名称変更・メンバー管理・招待送信・帳簿削除。
 */
import { useCallback, useEffect, useState } from "react";

import { apiFetch, isApiError } from "@/shared/api/client";
import { Button } from "@/shared/components/Button";
import { Modal } from "@/shared/components/Modal";
import { useToast } from "@/shared/components/toast/ToastProvider";

import type { LedgerMember } from "../types";

type LedgerSummary = { id: string; type: "personal" | "family"; name: string; role: string };
type LedgerDetail = LedgerSummary & { role: "owner" | "member"; memberCount: number };
type SearchedUser = { id: string; displayName: string; avatarUrl: string | null };

const inputClass =
  "rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground";

export const LedgerSettingsScreen = () => {
  const { showToast } = useToast();
  const [ledgers, setLedgers] = useState<LedgerSummary[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<LedgerDetail | null>(null);
  const [members, setMembers] = useState<LedgerMember[]>([]);
  const [meId, setMeId] = useState<string | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");

  const [name, setName] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [keyword, setKeyword] = useState("");
  const [results, setResults] = useState<SearchedUser[] | null>(null);
  const [removing, setRemoving] = useState<LedgerMember | null>(null);
  const [isDeletingLedger, setIsDeletingLedger] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const [familyName, setFamilyName] = useState("");
  const [isCreatingFamily, setIsCreatingFamily] = useState(false);

  const [weightDrafts, setWeightDrafts] = useState<Record<string, number>>({});
  const [isSavingWeights, setIsSavingWeights] = useState(false);

  const loadLedgers = useCallback(
    (): Promise<void> =>
      Promise.all([apiFetch<LedgerSummary[]>("/api/ledgers"), apiFetch<{ id: string }>("/api/me")])
        .then(([ledgersResult, meResult]) => {
          setLedgers(ledgersResult.data);
          setMeId(meResult.data.id);
          setSelectedId((current) => current ?? ledgersResult.data[0]?.id ?? null);
          setState("ready");
        })
        .catch(() => setState("error")),
    [],
  );

  useEffect(() => {
    void loadLedgers();
  }, [loadLedgers]);

  const loadDetail = useCallback((): Promise<void> => {
    if (selectedId === null) return Promise.resolve();
    return Promise.all([
      apiFetch<LedgerDetail>(`/api/ledgers/${selectedId}`),
      apiFetch<LedgerMember[]>(`/api/ledgers/${selectedId}/members`),
    ])
      .then(([detailResult, membersResult]) => {
        setDetail(detailResult.data);
        setName(detailResult.data.name);
        setMembers(membersResult.data);
        setWeightDrafts(
          Object.fromEntries(membersResult.data.map((member) => [member.userId, member.weight])),
        );
      })
      .catch(() => setState("error"));
  }, [selectedId]);

  useEffect(() => {
    void loadDetail();
  }, [loadDetail]);

  const notifyError = (error: unknown, fallback: string) =>
    showToast({ type: "error", message: isApiError(error) ? error.message : fallback });

  const handleRename = async (event: React.FormEvent) => {
    event.preventDefault();
    if (selectedId === null) return;
    setIsSaving(true);
    try {
      await apiFetch(`/api/ledgers/${selectedId}`, {
        method: "PATCH",
        body: JSON.stringify({ name }),
      });
      showToast({ type: "success", message: "名称を変更しました" });
      await Promise.all([loadLedgers(), loadDetail()]);
    } catch (error) {
      notifyError(error, "名称の変更に失敗しました");
    } finally {
      setIsSaving(false);
    }
  };

  const handleSearch = async (event: React.FormEvent) => {
    event.preventDefault();
    try {
      const { data } = await apiFetch<SearchedUser[]>(
        `/api/users/search?q=${encodeURIComponent(keyword)}`,
      );
      setResults(data);
    } catch (error) {
      notifyError(error, "ユーザー検索に失敗しました");
    }
  };

  const handleInvite = async (user: SearchedUser) => {
    if (selectedId === null) return;
    try {
      await apiFetch(`/api/ledgers/${selectedId}/invitations`, {
        method: "POST",
        body: JSON.stringify({ inviteeUserId: user.id }),
      });
      showToast({ type: "success", message: `${user.displayName}さんを招待しました` });
    } catch (error) {
      notifyError(error, "招待に失敗しました");
    }
  };

  const handleRemove = async () => {
    if (selectedId === null || removing === null) return;
    try {
      await apiFetch(`/api/ledgers/${selectedId}/members/${removing.userId}`, {
        method: "DELETE",
      });
      showToast({
        type: "success",
        message: removing.userId === meId ? "家計簿から退出しました" : "メンバーを除外しました",
      });
      setRemoving(null);
      if (removing.userId === meId) {
        window.location.href = "/entries";
        return;
      }
      await loadDetail();
    } catch (error) {
      notifyError(error, "処理に失敗しました");
    }
  };

  const handleCreateFamily = async (event: React.FormEvent) => {
    event.preventDefault();
    setIsCreatingFamily(true);
    try {
      const { data } = await apiFetch<{ id: string }>("/api/ledgers", {
        method: "POST",
        body: JSON.stringify({ type: "family", name: familyName }),
      });
      showToast({ type: "success", message: "家族家計簿を作成しました" });
      setFamilyName("");
      setSelectedId(data.id);
      await loadLedgers();
    } catch (error) {
      notifyError(error, "家族家計簿の作成に失敗しました");
    } finally {
      setIsCreatingFamily(false);
    }
  };

  const handleSaveWeights = async (event: React.FormEvent) => {
    event.preventDefault();
    if (selectedId === null) return;
    setIsSavingWeights(true);
    try {
      await apiFetch(`/api/ledgers/${selectedId}/split/weights`, {
        method: "PUT",
        body: JSON.stringify({
          weights: Object.entries(weightDrafts).map(([userId, weight]) => ({ userId, weight })),
        }),
      });
      showToast({ type: "success", message: "按分比重を保存しました" });
      await loadDetail();
    } catch (error) {
      notifyError(error, "按分比重の保存に失敗しました");
    } finally {
      setIsSavingWeights(false);
    }
  };

  const handleDeleteLedger = async () => {
    if (selectedId === null) return;
    setIsDeletingLedger(true);
    try {
      await apiFetch(`/api/ledgers/${selectedId}`, { method: "DELETE" });
      showToast({ type: "success", message: "家計簿を削除しました" });
      window.location.href = "/entries";
    } catch (error) {
      notifyError(error, "家計簿の削除に失敗しました");
      setIsDeletingLedger(false);
      setConfirmDelete(false);
    }
  };

  if (state === "loading") {
    return <div className="h-40 animate-pulse rounded-lg border border-border bg-surface" />;
  }
  if (state === "error") {
    return (
      <section className="rounded-lg border border-border bg-surface p-6 text-center">
        <p className="text-sm text-danger">情報の取得に失敗しました。</p>
        <Button
          className="mt-4"
          variant="secondary"
          onClick={() => {
            setState("loading");
            void loadLedgers();
          }}
        >
          再試行
        </Button>
      </section>
    );
  }
  if (ledgers.length === 0) {
    return (
      <section className="rounded-lg border border-border bg-surface p-6 text-center">
        <p className="text-sm text-muted">家計簿がまだありません。明細画面から作成してください。</p>
      </section>
    );
  }

  const isOwner = detail?.role === "owner";

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-lg font-semibold text-foreground">家計簿設定</h1>
        <select
          aria-label="対象の家計簿"
          value={selectedId ?? ""}
          onChange={(event) => setSelectedId(event.target.value)}
          className={inputClass}
        >
          {ledgers.map((ledger) => (
            <option key={ledger.id} value={ledger.id}>
              {ledger.name}（{ledger.type === "personal" ? "個人" : "家族"}）
            </option>
          ))}
        </select>
      </div>

      {(() => {
        const familyLedger = ledgers.find((ledger) => ledger.type === "family");
        if (familyLedger !== undefined && familyLedger.role === "owner") {
          return null;
        }
        return (
          <div className="rounded-lg border border-border bg-surface p-4">
            <h2 className="text-sm font-semibold text-foreground">家族家計簿</h2>
            {familyLedger === undefined ? (
              <>
                <p className="mt-1 text-xs text-muted">
                  家族と共有できる家計簿を作成します。作成後、メンバーを検索して招待できます。
                </p>
                <form onSubmit={handleCreateFamily} className="mt-2 flex gap-2">
                  <input
                    aria-label="家族家計簿名"
                    placeholder="家族家計簿名"
                    required
                    maxLength={50}
                    value={familyName}
                    onChange={(event) => setFamilyName(event.target.value)}
                    className={`flex-1 ${inputClass}`}
                  />
                  <Button type="submit" isLoading={isCreatingFamily}>
                    家族家計簿を作成
                  </Button>
                </form>
              </>
            ) : (
              <p className="mt-1 text-xs text-muted">
                既に家族家計簿へ参加しているため、新たに作成することはできません（FR-INVITE-04）。
              </p>
            )}
          </div>
        );
      })()}

      {detail !== null && (
        <>
          <form onSubmit={handleRename} className="rounded-lg border border-border bg-surface p-4">
            <label htmlFor="ledger-name" className="block text-xs font-medium text-muted">
              家計簿名（変更はオーナーのみ）
            </label>
            <div className="mt-1 flex gap-2">
              <input
                id="ledger-name"
                required
                maxLength={50}
                value={name}
                disabled={!isOwner}
                onChange={(event) => setName(event.target.value)}
                className={`flex-1 ${inputClass}`}
              />
              <Button type="submit" disabled={!isOwner} isLoading={isSaving}>
                変更
              </Button>
            </div>
          </form>

          <div className="rounded-lg border border-border bg-surface p-4">
            <h2 className="text-sm font-semibold text-foreground">
              メンバー（{detail.memberCount}名）
            </h2>
            <ul className="mt-2 divide-y divide-border">
              {members.map((member) => (
                <li key={member.userId} className="flex items-center gap-3 py-2">
                  <span className="flex-1 text-sm text-foreground">
                    {member.displayName}
                    <span className="ml-2 text-xs text-muted">
                      {member.role === "owner" ? "オーナー" : "メンバー"}
                    </span>
                  </span>
                  {member.userId === meId && member.role !== "owner" && (
                    <Button variant="ghost" onClick={() => setRemoving(member)}>
                      退出
                    </Button>
                  )}
                  {isOwner && member.userId !== meId && (
                    <Button variant="ghost" onClick={() => setRemoving(member)}>
                      除外
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          </div>

          {detail.type === "family" && isOwner && members.length >= 2 && (
            <form
              onSubmit={handleSaveWeights}
              className="rounded-lg border border-border bg-surface p-4"
            >
              <h2 className="text-sm font-semibold text-foreground">既定按分比重</h2>
              <p className="mt-1 text-xs text-muted">
                精算（分析画面）で使う、メンバー間の負担割合の既定値です（正の整数・比率で計算）。
              </p>
              <ul className="mt-2 space-y-2">
                {members.map((member) => (
                  <li key={member.userId} className="flex items-center gap-3">
                    <span className="flex-1 text-sm text-foreground">{member.displayName}</span>
                    <input
                      aria-label={`${member.displayName}の比重`}
                      type="number"
                      min={1}
                      required
                      value={weightDrafts[member.userId] ?? 1}
                      onChange={(event) =>
                        setWeightDrafts((current) => ({
                          ...current,
                          [member.userId]: Number(event.target.value),
                        }))
                      }
                      className={`w-24 ${inputClass}`}
                    />
                  </li>
                ))}
              </ul>
              <Button type="submit" className="mt-3" isLoading={isSavingWeights}>
                保存
              </Button>
            </form>
          )}

          {detail.type === "family" && isOwner && (
            <div className="rounded-lg border border-border bg-surface p-4">
              <h2 className="text-sm font-semibold text-foreground">家族を招待</h2>
              <form onSubmit={handleSearch} className="mt-2 flex gap-2">
                <input
                  aria-label="表示名で検索"
                  placeholder="表示名（2文字以上）"
                  minLength={2}
                  required
                  value={keyword}
                  onChange={(event) => setKeyword(event.target.value)}
                  className={`flex-1 ${inputClass}`}
                />
                <Button type="submit" variant="secondary">
                  検索
                </Button>
              </form>
              {results !== null && (
                <ul className="mt-3 divide-y divide-border">
                  {results.length === 0 && (
                    <li className="py-2 text-sm text-muted">該当するユーザーがいません。</li>
                  )}
                  {results.map((user) => (
                    <li key={user.id} className="flex items-center gap-3 py-2">
                      {user.avatarUrl !== null && (
                        // eslint-disable-next-line @next/next/no-img-element -- 外部（LINE）画像の等倍表示のみ
                        <img
                          src={user.avatarUrl}
                          alt=""
                          className="size-8 rounded-full"
                          loading="lazy"
                        />
                      )}
                      <span className="flex-1 text-sm text-foreground">{user.displayName}</span>
                      <Button variant="secondary" onClick={() => void handleInvite(user)}>
                        招待
                      </Button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          {isOwner && (
            <div className="rounded-lg border border-danger/40 bg-surface p-4">
              <h2 className="text-sm font-semibold text-danger">家計簿の削除</h2>
              <p className="mt-1 text-xs text-muted">
                家計簿と明細・カテゴリ・メンバー・招待をすべて削除します（取り消せません）。
              </p>
              <Button className="mt-3" variant="danger" onClick={() => setConfirmDelete(true)}>
                この家計簿を削除
              </Button>
            </div>
          )}
        </>
      )}

      <Modal
        isOpen={removing !== null}
        onClose={() => setRemoving(null)}
        title={removing?.userId === meId ? "家計簿から退出しますか？" : "メンバーを除外しますか？"}
        closeOnBackdrop={false}
      >
        <p className="text-sm text-muted">
          {removing?.userId === meId
            ? "退出すると、この家計簿の明細を閲覧・編集できなくなります。"
            : `${removing?.displayName}さんをこの家計簿から除外します。`}
        </p>
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="secondary" onClick={() => setRemoving(null)}>
            キャンセル
          </Button>
          <Button variant="danger" onClick={() => void handleRemove()}>
            {removing?.userId === meId ? "退出する" : "除外する"}
          </Button>
        </div>
      </Modal>

      <Modal
        isOpen={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        title="家計簿を削除しますか？"
        closeOnBackdrop={false}
      >
        <p className="text-sm text-muted">
          「{detail?.name}」とその明細・カテゴリ・メンバー・招待をすべて削除します。
          この操作は取り消せません。
        </p>
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="secondary" onClick={() => setConfirmDelete(false)}>
            キャンセル
          </Button>
          <Button
            variant="danger"
            isLoading={isDeletingLedger}
            onClick={() => void handleDeleteLedger()}
          >
            削除する
          </Button>
        </div>
      </Modal>
    </section>
  );
};
