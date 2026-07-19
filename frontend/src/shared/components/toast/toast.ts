/**
 * Toast の型と純粋ロジック（ui-rules §6）。React・DOM に依存しないため単体テスト可能。
 * 成功は自動消去（4秒）、エラーは手動で閉じる（自動消去しない）。
 */

export type ToastType = "success" | "error" | "warning";

export type Toast = {
  readonly id: string;
  readonly type: ToastType;
  readonly message: string;
};

/** 自動消去までのミリ秒。null は自動消去しない（手動クローズのみ）。 */
export const AUTO_DISMISS_MS: Record<ToastType, number | null> = {
  success: 4000,
  warning: 6000,
  error: null,
};

/** 指定タイプの自動消去時間を返す（null=自動消去なし）。 */
export const autoDismissMs = (type: ToastType): number | null => AUTO_DISMISS_MS[type];

/** 一覧末尾へ Toast を追加する（不変更新）。 */
export const addToast = (toasts: readonly Toast[], toast: Toast): Toast[] => [...toasts, toast];

/** 指定 id の Toast を除去する（不変更新）。 */
export const removeToast = (toasts: readonly Toast[], id: string): Toast[] =>
  toasts.filter((toast) => toast.id !== id);
