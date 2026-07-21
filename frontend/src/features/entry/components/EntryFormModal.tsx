"use client";

/**
 * SCR-04 明細登録・編集モーダル（screen.md・FR-ENTRY-01/02）。
 * 登録（entry 未指定）と編集（entry 指定）を兼ねる。保存成功時は onSaved で一覧を再読込する。
 */
import { useRef, useState } from "react";

import { apiFetch, isApiError } from "@/shared/api/client";
import { Button } from "@/shared/components/Button";
import { Modal } from "@/shared/components/Modal";
import { useToast } from "@/shared/components/toast/ToastProvider";

import type { Category } from "@/features/category/types";
import type { LedgerMember, LedgerType } from "@/features/ledger/types";

import type { EntryListItem, SplitType } from "../types";

type FormState = {
  usedOn: string;
  /** 支払月（YYYY-MM）。カード請求の対象月（利用日と異なる場合がある）。 */
  billingMonth: string;
  amount: string;
  description: string;
  categoryId: string;
  paymentMethod: string;
  memo: string;
  /** 支払者（FR-SPLIT-04）。家族家計簿のみ使用。 */
  paidByUserId: string;
  splitType: SplitType;
  /** splitType="custom" のときの比重（メンバーごと、文字列入力のまま保持）。 */
  customShares: Record<string, string>;
  /** splitType="assigned" のときの計上先。 */
  assignedUserId: string;
};

const toLocalDate = (date: Date): string => {
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
};

const buildInitialState = (
  categories: readonly Category[],
  members: readonly LedgerMember[],
  selfUserId: string | null,
  entry?: EntryListItem,
): FormState => {
  const usedOn = entry?.usedOn ?? toLocalDate(new Date());
  const customShares = Object.fromEntries(
    members.map((member) => {
      const existing = entry?.splitShares?.find((share) => share.userId === member.userId);
      return [member.userId, existing !== undefined ? String(existing.weight) : ""];
    }),
  );
  return {
    usedOn,
    billingMonth: entry?.billingMonth ?? usedOn.slice(0, 7),
    amount: entry === undefined ? "" : String(entry.amount),
    description: entry?.description ?? "",
    categoryId: entry?.category.id ?? categories[0]?.id ?? "",
    paymentMethod: entry?.paymentMethod ?? "",
    memo: entry?.memo ?? "",
    paidByUserId: entry?.paidBy.id ?? selfUserId ?? members[0]?.userId ?? "",
    splitType: entry?.splitType ?? "default",
    customShares,
    assignedUserId: entry?.assignedTo?.id ?? "",
  };
};

type EntryFormProps = {
  onClose: () => void;
  onSaved: () => void;
  ledgerId: string;
  categories: readonly Category[];
  /** 家族家計簿のときのみ支払者・按分方法の入力を表示する（FR-SPLIT）。 */
  ledgerType: LedgerType;
  members: readonly LedgerMember[];
  /** ログイン中ユーザーのID。新規登録時の支払者の既定値に使う。 */
  selfUserId: string | null;
  /** 指定時は編集モード。 */
  entry?: EntryListItem;
};

const SPLIT_TYPE_OPTIONS: { value: SplitType; label: string }[] = [
  { value: "default", label: "既定比重で按分" },
  { value: "custom", label: "この明細だけ独自の比重で按分" },
  { value: "assigned", label: "1人に全額計上（肩代わり）" },
];

export const EntryFormModal = ({ isOpen, ...props }: EntryFormProps & { isOpen: boolean }) => (
  <Modal isOpen={isOpen} onClose={props.onClose} title={props.entry ? "明細を編集" : "明細を登録"}>
    {/* 開くたびに再マウントして対象明細（または空）で初期化する */}
    {isOpen && <EntryForm {...props} />}
  </Modal>
);

const EntryForm = ({
  onClose,
  onSaved,
  ledgerId,
  categories,
  ledgerType,
  members,
  selfUserId,
  entry,
}: EntryFormProps) => {
  const { showToast } = useToast();
  const [form, setForm] = useState<FormState>(() =>
    buildInitialState(categories, members, selfUserId, entry),
  );
  const [isSubmitting, setIsSubmitting] = useState(false);
  const isEdit = entry !== undefined;
  const isFamily = ledgerType === "family";
  // 支払月をユーザーが手動編集したら、以降は利用日変更に追従させない
  const billingMonthTouched = useRef(false);

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((current) => ({ ...current, [key]: value }));

  const setUsedOn = (value: string) => {
    setForm((current) => ({
      ...current,
      usedOn: value,
      billingMonth: billingMonthTouched.current ? current.billingMonth : value.slice(0, 7),
    }));
  };

  const setBillingMonth = (value: string) => {
    billingMonthTouched.current = true;
    set("billingMonth", value);
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setIsSubmitting(true);
    try {
      const payload = {
        usedOn: form.usedOn,
        billingMonth: form.billingMonth,
        amount: Number(form.amount),
        description: form.description,
        categoryId: form.categoryId,
        paymentMethod: form.paymentMethod.trim() === "" ? null : form.paymentMethod,
        memo: form.memo.trim() === "" ? null : form.memo,
        ...(isFamily
          ? {
              paidByUserId: form.paidByUserId,
              splitType: form.splitType,
              splitShares:
                form.splitType === "custom"
                  ? members
                      .map((member) => ({
                        userId: member.userId,
                        weight: Number(form.customShares[member.userId] ?? ""),
                      }))
                      .filter((share) => share.weight > 0)
                  : null,
              assignedUserId: form.splitType === "assigned" ? form.assignedUserId : null,
            }
          : {}),
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
            onChange={(event) => setUsedOn(event.target.value)}
            className={inputClass}
          />
        </div>
        <div>
          <label htmlFor="entry-billing-month" className="block text-sm font-medium text-foreground">
            支払月
          </label>
          <input
            id="entry-billing-month"
            type="month"
            required
            value={form.billingMonth}
            onChange={(event) => setBillingMonth(event.target.value)}
            className={inputClass}
          />
          <p className="mt-1 text-xs text-muted">
            カード請求の対象月。既定は利用日と同じ月です（例：6/23利用が7月請求なら「2026-07」）。
          </p>
        </div>
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
      {isFamily && members.length >= 2 && (
        <div className="space-y-4 rounded-lg border border-border p-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="entry-paid-by" className="block text-sm font-medium text-foreground">
                支払者
              </label>
              <select
                id="entry-paid-by"
                required
                value={form.paidByUserId}
                onChange={(event) => set("paidByUserId", event.target.value)}
                className={inputClass}
              >
                {members.map((member) => (
                  <option key={member.userId} value={member.userId}>
                    {member.displayName}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label
                htmlFor="entry-split-type"
                className="block text-sm font-medium text-foreground"
              >
                按分方法
              </label>
              <select
                id="entry-split-type"
                required
                value={form.splitType}
                onChange={(event) => set("splitType", event.target.value as SplitType)}
                className={inputClass}
              >
                {SPLIT_TYPE_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {form.splitType === "custom" && (
            <div>
              <span className="block text-sm font-medium text-foreground">独自の比重</span>
              <div className="mt-1 grid grid-cols-1 gap-2 sm:grid-cols-2">
                {members.map((member) => (
                  <div key={member.userId} className="flex items-center gap-2">
                    <span className="w-24 truncate text-sm text-muted">{member.displayName}</span>
                    <input
                      aria-label={`${member.displayName}の独自比重`}
                      type="number"
                      min={1}
                      required
                      value={form.customShares[member.userId] ?? ""}
                      onChange={(event) =>
                        set("customShares", {
                          ...form.customShares,
                          [member.userId]: event.target.value,
                        })
                      }
                      className={inputClass}
                    />
                  </div>
                ))}
              </div>
            </div>
          )}

          {form.splitType === "assigned" && (
            <div>
              <label
                htmlFor="entry-assigned-user"
                className="block text-sm font-medium text-foreground"
              >
                計上先メンバー
              </label>
              <select
                id="entry-assigned-user"
                required
                value={form.assignedUserId}
                onChange={(event) => set("assignedUserId", event.target.value)}
                className={inputClass}
              >
                <option value="" disabled>
                  選択してください
                </option>
                {members.map((member) => (
                  <option key={member.userId} value={member.userId}>
                    {member.displayName}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>
      )}
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
