"use client";

/**
 * Toast の表示管理（ui-rules §6）。showToast で通知を追加し、成功/警告は自動消去、
 * エラーは手動クローズのみ。表示領域は aria-live でスクリーンリーダーへ通知する。
 */
import { createContext, useCallback, useContext, useMemo, useRef, useState } from "react";

import { addToast, autoDismissMs, removeToast, type Toast, type ToastType } from "./toast";

type ToastContextValue = {
  readonly showToast: (input: { type: ToastType; message: string }) => void;
};

const ToastContext = createContext<ToastContextValue | null>(null);

const ROLE_BY_TYPE: Record<ToastType, "status" | "alert"> = {
  success: "status",
  warning: "status",
  error: "alert",
};

const STYLE_BY_TYPE: Record<ToastType, string> = {
  success: "border-success text-foreground",
  warning: "border-warning text-foreground",
  error: "border-danger text-foreground",
};

export const ToastProvider = ({ children }: { children: React.ReactNode }) => {
  const [toasts, setToasts] = useState<readonly Toast[]>([]);
  const timers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  const dismiss = useCallback((id: string) => {
    setToasts((current) => removeToast(current, id));
    const timer = timers.current.get(id);
    if (timer !== undefined) {
      clearTimeout(timer);
      timers.current.delete(id);
    }
  }, []);

  const showToast = useCallback(
    ({ type, message }: { type: ToastType; message: string }) => {
      const id = crypto.randomUUID();
      setToasts((current) => addToast(current, { id, type, message }));

      const duration = autoDismissMs(type);
      if (duration !== null) {
        timers.current.set(
          id,
          setTimeout(() => dismiss(id), duration),
        );
      }
    },
    [dismiss],
  );

  const value = useMemo<ToastContextValue>(() => ({ showToast }), [showToast]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div
        aria-live="polite"
        className="pointer-events-none fixed inset-x-0 bottom-0 z-50 flex flex-col items-center gap-2 p-4"
      >
        {toasts.map((toast) => (
          <div
            key={toast.id}
            role={ROLE_BY_TYPE[toast.type]}
            className={`pointer-events-auto flex w-full max-w-sm items-start justify-between gap-3 rounded-md border-l-4 bg-surface px-4 py-3 text-sm shadow-md ${STYLE_BY_TYPE[toast.type]}`}
          >
            <span>{toast.message}</span>
            <button
              type="button"
              onClick={() => dismiss(toast.id)}
              aria-label="通知を閉じる"
              className="text-muted hover:text-foreground"
            >
              ×
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
};

export const useToast = (): ToastContextValue => {
  const context = useContext(ToastContext);
  if (context === null) {
    throw new Error("useToast は ToastProvider の内側で使用してください");
  }
  return context;
};
