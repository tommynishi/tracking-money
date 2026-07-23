"use client";

/**
 * ヘッダーに常時表示する家計簿切替（screen.md 3.1）。
 * 家計簿が1件も無い場合は表示しない（各画面が初期セットアップを促す）。
 */
import { useActiveLedger } from "../context/ActiveLedgerProvider";

const TYPE_LABELS = { personal: "個人", family: "家族" } as const;

export const LedgerSwitcher = () => {
  const { ledgers, activeLedgerId, state, selectLedger } = useActiveLedger();

  if (state !== "ready" || ledgers.length === 0) return null;

  return (
    <select
      aria-label="表示中の家計簿"
      value={activeLedgerId ?? ""}
      onChange={(event) => selectLedger(event.target.value)}
      className="max-w-40 rounded-md border border-border bg-background px-2 py-1.5 text-sm text-foreground"
    >
      {ledgers.map((ledger) => (
        <option key={ledger.id} value={ledger.id}>
          {TYPE_LABELS[ledger.type]}：{ledger.name}
        </option>
      ))}
    </select>
  );
};
