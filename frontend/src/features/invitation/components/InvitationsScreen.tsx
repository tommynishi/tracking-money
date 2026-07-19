"use client";

/**
 * SCR-07 招待一覧（screen.md・FR-INVITE-02〜04）。
 * 自分宛（承諾/拒否）と自分発（取消）の pending 招待を扱う。
 * 承諾時に自分の家族家計簿を所有している場合（FAMILY_LEDGER_EXISTS）は
 * 削除して参加するかを確認して再実行する。
 */
import { useCallback, useEffect, useState } from "react";

import { apiFetch, isApiError } from "@/shared/api/client";
import { Button } from "@/shared/components/Button";
import { Modal } from "@/shared/components/Modal";
import { useToast } from "@/shared/components/toast/ToastProvider";
import { formatDateFull } from "@/shared/utils/format";

import type { Invitation, InvitationDirection } from "../types";

export const InvitationsScreen = () => {
  const { showToast } = useToast();
  const [direction, setDirection] = useState<InvitationDirection>("received");
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [confirmingDeleteOwn, setConfirmingDeleteOwn] = useState<Invitation | null>(null);
  const [isMutating, setIsMutating] = useState(false);

  const load = useCallback(
    (): Promise<void> =>
      apiFetch<Invitation[]>(`/api/invitations?direction=${direction}&status=pending`)
        .then(({ data }) => {
          setInvitations(data);
          setState("ready");
        })
        .catch(() => setState("error")),
    [direction],
  );

  useEffect(() => {
    void load();
  }, [load]);

  const notifyError = (error: unknown, fallback: string) =>
    showToast({ type: "error", message: isApiError(error) ? error.message : fallback });

  const accept = async (invitation: Invitation, deleteOwnFamilyLedger: boolean) => {
    setIsMutating(true);
    try {
      await apiFetch(`/api/invitations/${invitation.id}/accept`, {
        method: "POST",
        body: JSON.stringify({ deleteOwnFamilyLedger }),
      });
      showToast({ type: "success", message: "招待を承諾し、家族家計簿に参加しました" });
      setConfirmingDeleteOwn(null);
      await load();
    } catch (error) {
      if (isApiError(error) && error.details?.some((d) => d.code === "FAMILY_LEDGER_EXISTS")) {
        // 自分の家族家計簿を所有している：削除して参加するか確認する（FR-INVITE-03）
        setConfirmingDeleteOwn(invitation);
      } else {
        notifyError(error, "承諾に失敗しました");
      }
    } finally {
      setIsMutating(false);
    }
  };

  const decline = async (invitation: Invitation) => {
    setIsMutating(true);
    try {
      await apiFetch(`/api/invitations/${invitation.id}/decline`, { method: "POST" });
      showToast({ type: "success", message: "招待を拒否しました" });
      await load();
    } catch (error) {
      notifyError(error, "拒否に失敗しました");
    } finally {
      setIsMutating(false);
    }
  };

  const cancel = async (invitation: Invitation) => {
    setIsMutating(true);
    try {
      await apiFetch(`/api/invitations/${invitation.id}`, { method: "DELETE" });
      showToast({ type: "success", message: "招待を取り消しました" });
      await load();
    } catch (error) {
      notifyError(error, "取消に失敗しました");
    } finally {
      setIsMutating(false);
    }
  };

  return (
    <section className="space-y-4">
      <h1 className="text-lg font-semibold text-foreground">招待一覧</h1>

      <div role="tablist" aria-label="招待の向き" className="flex gap-1">
        {(
          [
            { value: "received", label: "自分宛" },
            { value: "sent", label: "自分発" },
          ] as const
        ).map((tab) => (
          <button
            key={tab.value}
            role="tab"
            aria-selected={direction === tab.value}
            onClick={() => {
              setState("loading");
              setDirection(tab.value);
            }}
            className={`min-h-11 rounded-md px-4 text-sm ${
              direction === tab.value
                ? "bg-primary text-primary-foreground"
                : "text-foreground hover:bg-background"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {state === "error" ? (
        <div className="rounded-lg border border-border bg-surface p-6 text-center">
          <p className="text-sm text-danger">招待の取得に失敗しました。</p>
          <Button
            className="mt-4"
            variant="secondary"
            onClick={() => {
              setState("loading");
              void load();
            }}
          >
            再試行
          </Button>
        </div>
      ) : state === "loading" ? (
        <div className="h-40 animate-pulse rounded-lg border border-border bg-surface" />
      ) : invitations.length === 0 ? (
        <div className="rounded-lg border border-border bg-surface p-10 text-center">
          <p className="text-sm text-muted">保留中の招待はありません。</p>
        </div>
      ) : (
        <ul className="space-y-3">
          {invitations.map((invitation) => (
            <li
              key={invitation.id}
              className="flex flex-wrap items-center gap-3 rounded-lg border border-border bg-surface p-4"
            >
              <div className="flex-1">
                <p className="text-sm text-foreground">
                  {direction === "received"
                    ? "家族家計簿への招待が届いています"
                    : "家族家計簿への招待を送信済みです"}
                </p>
                <p className="mt-1 text-xs text-muted">
                  {formatDateFull(invitation.createdAt)} 作成
                </p>
              </div>
              {direction === "received" ? (
                <div className="flex gap-2">
                  <Button isLoading={isMutating} onClick={() => void accept(invitation, false)}>
                    承諾
                  </Button>
                  <Button
                    variant="secondary"
                    isLoading={isMutating}
                    onClick={() => void decline(invitation)}
                  >
                    拒否
                  </Button>
                </div>
              ) : (
                <Button
                  variant="secondary"
                  isLoading={isMutating}
                  onClick={() => void cancel(invitation)}
                >
                  取消
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}

      <Modal
        isOpen={confirmingDeleteOwn !== null}
        onClose={() => setConfirmingDeleteOwn(null)}
        title="自分の家族家計簿を削除して参加しますか？"
        closeOnBackdrop={false}
      >
        <p className="text-sm text-muted">
          あなたが所有する家族家計簿とその明細をすべて削除し、招待された家族家計簿へ参加します。
          この操作は取り消せません。
        </p>
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="secondary" onClick={() => setConfirmingDeleteOwn(null)}>
            キャンセル
          </Button>
          <Button
            variant="danger"
            isLoading={isMutating}
            onClick={() => {
              if (confirmingDeleteOwn !== null) void accept(confirmingDeleteOwn, true);
            }}
          >
            削除して参加する
          </Button>
        </div>
      </Modal>
    </section>
  );
};
