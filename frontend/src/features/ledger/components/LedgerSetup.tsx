"use client";

/**
 * 初回セットアップ（screen.md 2「家計簿未作成の場合は個人家計簿の作成を促す」・FR-LEDGER-01）。
 */
import { useState } from "react";

import { apiFetch, isApiError } from "@/shared/api/client";
import { Button } from "@/shared/components/Button";
import { useToast } from "@/shared/components/toast/ToastProvider";

const DEFAULT_NAME = "わたしの家計簿";

export const LedgerSetup = ({ onCreated }: { onCreated: (ledgerId: string) => void }) => {
  const { showToast } = useToast();
  const [name, setName] = useState(DEFAULT_NAME);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setIsSubmitting(true);
    try {
      const { data } = await apiFetch<{ id: string }>("/api/ledgers", {
        method: "POST",
        body: JSON.stringify({ type: "personal", name }),
      });
      showToast({ type: "success", message: "家計簿を作成しました" });
      onCreated(data.id);
    } catch (error) {
      showToast({
        type: "error",
        message: isApiError(error) ? error.message : "家計簿の作成に失敗しました",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <section className="mx-auto max-w-md rounded-lg border border-border bg-surface p-6">
      <h1 className="text-lg font-semibold text-foreground">はじめに家計簿を作成しましょう</h1>
      <p className="mt-2 text-sm text-muted">
        個人の家計簿を作成すると、明細の記録を始められます（デフォルトカテゴリ付き）。
      </p>
      <form onSubmit={handleSubmit} className="mt-4 space-y-4">
        <div>
          <label htmlFor="ledger-name" className="block text-sm font-medium text-foreground">
            家計簿名
          </label>
          <input
            id="ledger-name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            required
            maxLength={50}
            className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground"
          />
        </div>
        <Button type="submit" fullWidth isLoading={isSubmitting}>
          家計簿を作成する
        </Button>
      </form>
    </section>
  );
};
