"use client";

/**
 * 全画面共通の対象家計簿（個人／家族）を保持する Context（screen.md 3.1）。
 * ヘッダーの切替（LedgerSwitcher）と各画面が同じ選択を参照し、選択は localStorage に永続化する。
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

import { apiFetch } from "@/shared/api/client";

import type { LedgerType, MemberRole } from "../types";

/** GET /api/ledgers の1件（api.md 3.2）。 */
export type LedgerSummary = {
  readonly id: string;
  readonly type: LedgerType;
  readonly name: string;
  readonly role: MemberRole;
};

export type ActiveLedgerState = "loading" | "ready" | "error";

type ActiveLedgerContextValue = {
  readonly ledgers: readonly LedgerSummary[];
  readonly activeLedger: LedgerSummary | null;
  readonly activeLedgerId: string | null;
  readonly state: ActiveLedgerState;
  /** ヘッダー等から対象家計簿を切り替える（選択は永続化される）。 */
  readonly selectLedger: (ledgerId: string) => void;
  /** 家計簿の作成・削除・改名後に一覧を取り直す。 */
  readonly reload: () => Promise<void>;
};

const STORAGE_KEY = "tracking-money.active-ledger-id";

const ActiveLedgerContext = createContext<ActiveLedgerContextValue | null>(null);

const readStoredId = (): string | null => {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(STORAGE_KEY);
};

/** 保存済み／現在の選択が一覧に存在すればそれを、無ければ先頭の家計簿を対象にする。 */
const resolveActiveId = (
  ledgers: readonly LedgerSummary[],
  candidate: string | null,
): string | null => {
  if (candidate !== null && ledgers.some((ledger) => ledger.id === candidate)) {
    return candidate;
  }
  return ledgers[0]?.id ?? null;
};

export const ActiveLedgerProvider = ({ children }: { children: React.ReactNode }) => {
  const [ledgers, setLedgers] = useState<readonly LedgerSummary[]>([]);
  const [activeLedgerId, setActiveLedgerId] = useState<string | null>(null);
  const [state, setState] = useState<ActiveLedgerState>("loading");

  const reload = useCallback(
    (): Promise<void> =>
      apiFetch<LedgerSummary[]>("/api/ledgers")
        .then(({ data }) => {
          setLedgers(data);
          setActiveLedgerId((current) => resolveActiveId(data, current ?? readStoredId()));
          setState("ready");
        })
        .catch(() => setState("error")),
    [],
  );

  useEffect(() => {
    void reload();
  }, [reload]);

  const selectLedger = useCallback((ledgerId: string) => {
    setActiveLedgerId(ledgerId);
    window.localStorage.setItem(STORAGE_KEY, ledgerId);
  }, []);

  const value = useMemo<ActiveLedgerContextValue>(
    () => ({
      ledgers,
      activeLedger: ledgers.find((ledger) => ledger.id === activeLedgerId) ?? null,
      activeLedgerId,
      state,
      selectLedger,
      reload,
    }),
    [ledgers, activeLedgerId, state, selectLedger, reload],
  );

  return <ActiveLedgerContext.Provider value={value}>{children}</ActiveLedgerContext.Provider>;
};

export const useActiveLedger = (): ActiveLedgerContextValue => {
  const value = useContext(ActiveLedgerContext);
  if (value === null) {
    throw new Error("useActiveLedger must be used within ActiveLedgerProvider");
  }
  return value;
};
