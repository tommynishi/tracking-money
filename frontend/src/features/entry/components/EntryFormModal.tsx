"use client";

/**
 * SCR-04 明細登録・編集モーダル（screen.md・FR-ENTRY-01/02）。
 * 登録（entry 未指定）と編集（entry 指定）を兼ねる。保存成功時は onSaved で一覧を再読込する。
 */
import { useState } from "react";

import { apiFetch, isApiError } from "@/shared/api/client";
import { Button } from "@/shared/components/Button";
import { Modal } from "@/shared/components/Modal";
import { useToast } from "@/shared/components/toast/ToastProvider";

import type { Category } from "@/features/category/types";

import type { EntryListItem } from "../types";

type FormState = {
  usedOn: string;
  amount: string;
  description: string;
  categoryId: string;
  paymentMethod: string;
  memo: string;
};

const toLocalDate = (date: Date): string => {
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
};

const buildInitialState = (categories: readonly Category[], entry?: EntryListItem): FormState => ({
  usedOn: entry?.usedOn ?? toLocalDate(new Date()),
  amount: entry === undefined ? "" : String(entry.amount),
  description: entry?.description ?? "",
  categoryId: entry?.category.id ?? categories[0]?.id ?? "",
  paymentMethod: entry?.paymentMethod ?? "",
  memo: entry?.memo ?? "",
});

type EntryFormProps = {
  onClose: () => void;
  onSaved: () => void;
  ledgerId: string;
  categories: readonly Category[];
  /** 指定時は編集モード。 */
  entry?: EntryListItem;
};

export const EntryFormModal = ({ isOpen, ...props }: EntryFormProps & { isOpen: boolean }) => (
  <Modal isOpen={isOpen} onClose={props.onClose} title={props.entry ? "明細を編集" : "明細を登録"}>
    {/* 開くたびに再マウントして対象明細（または空）で初期化する */}
    {isOpen && <EntryForm {...props} />}
  </Modal>
);

const EntryForm = ({ onClose, onSaved, ledgerId, categories, entry }: EntryFormProps) => {
  const { showToast } = useToast();
  const [form, setForm] = useState<FormState>(() => buildInitialState(categories, entry));
  const [isSubmitting, setIsSubmitting] = useState(false);
  const isEdit = entry !== undefined;

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((current) => ({ ...current, [key]: value }));

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setIsSubmitting(true);
    try {
      const payload = {
        usedOn: form.usedOn,
        amount: Number(form.amount),
        description: form.description,
        categoryId: form.categoryId,
        paymentMethod: form.paymentMethod.trim() === "" ? null : form.paymentMethod,
        memo: form.memo.trim() === "" ? null : form.memo,
      };
      if (isEdit) {
        await apiFetch(`/api/ledgers/${ledgerId}/entries/${entry.id}`, {
          method: "PATCH",
          body: JSON.stringify(payload),
        });
      } else {
        await apiFetch(`/api/ledgers/${ledgerId}/entries`, {
          method: "POST",
          body: JSON.stringify(payload),
        });
      }
      showToast({ type: "success", message: isEdit ? "明細を更新しました" : "明細を登録しました" });
      onSaved();
      onClose();
    } catch (error) {
      showToast({
        type: "error",
        message: isApiError(error) ? error.message : "保存に失敗しました",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const inputClass =
    "mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground";

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="entry-used-on" className="block text-sm font-medium text-foreground">
            利用日
          </label>
          <input
            id="entry-used-on"
            type="date"
            required
            value={form.usedOn}
            onChange={(event) => set("usedOn", event.target.value)}
            className={inputClass}
          />
        </div>
        <div>
          <label htmlFor="entry-amount" className="block text-sm font-medium text-foreground">
            金額（円・返金はマイナス）
          </label>
          <input
            id="entry-amount"
            type="number"
            required
            step={1}
            value={form.amount}
            onChange={(event) => set("amount", event.target.value)}
            className={inputClass}
          />
        </div>
      </div>
      <div>
        <label htmlFor="entry-description" className="block text-sm font-medium text-foreground">
          摘要
        </label>
        <input
          id="entry-description"
          required
          maxLength={200}
          value={form.description}
          onChange={(event) => set("description", event.target.value)}
          className={inputClass}
        />
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="entry-category" className="block text-sm font-medium text-foreground">
            カテゴリ
          </label>
          <select
            id="entry-category"
            required
            value={form.categoryId}
            onChange={(event) => set("categoryId", event.target.value)}
            className={inputClass}
          >
            {categories.map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label
            htmlFor="entry-payment-method"
            className="block text-sm font-medium text-foreground"
          >
            支払い方法（任意）
          </label>
          <input
            id="entry-payment-method"
            maxLength={50}
            value={form.paymentMethod}
            onChange={(event) => set("paymentMethod", event.target.value)}
            className={inputClass}
          />
        </div>
      </div>
      <div>
        <label htmlFor="entry-memo" className="block text-sm font-medium text-foreground">
          メモ（任意）
        </label>
        <textarea
          id="entry-memo"
          rows={2}
          maxLength={500}
          value={form.memo}
          onChange={(event) => set("memo", event.target.value)}
          className={inputClass}
        />
      </div>
      <div className="flex justify-end gap-2">
        <Button type="button" variant="secondary" onClick={onClose}>
          キャンセル
        </Button>
        <Button type="submit" isLoading={isSubmitting}>
          {isEdit ? "更新する" : "登録する"}
        </Button>
      </div>
    </form>
  );
};
