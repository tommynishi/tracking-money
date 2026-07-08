"use client";

/**
 * 共通モーダル（ui-rules §6 / §8）。role="dialog" ＋ aria-modal、フォーカストラップ、
 * Esc で閉じる、背景クリック挙動、閉じたときの復帰フォーカスを一元的に担保する。
 * 破壊的操作の確認ダイアログはこの Modal を用いる。
 */
import { useCallback, useEffect, useId, useRef } from "react";

type ModalProps = {
  readonly isOpen: boolean;
  readonly onClose: () => void;
  readonly title: string;
  readonly children: React.ReactNode;
  /** 背景クリックで閉じるか（既定 true）。破壊的確認では false を推奨。 */
  readonly closeOnBackdrop?: boolean;
};

const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

const getFocusable = (container: HTMLElement): HTMLElement[] =>
  Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR));

export const Modal = ({ isOpen, onClose, title, children, closeOnBackdrop = true }: ModalProps) => {
  const titleId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);

  // 開いている間のフォーカス管理（初期フォーカス・閉じたときの復帰）と背景スクロール抑止
  useEffect(() => {
    if (!isOpen) return;

    const previouslyFocused = document.activeElement as HTMLElement | null;
    const dialog = dialogRef.current;
    const focusable = dialog === null ? [] : getFocusable(dialog);
    (focusable[0] ?? dialog)?.focus();

    const { overflow } = document.body.style;
    document.body.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = overflow;
      previouslyFocused?.focus();
    };
  }, [isOpen]);

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        onClose();
        return;
      }
      if (event.key !== "Tab") return;

      // フォーカストラップ：Tab がダイアログ外へ出ないように端で循環させる
      const dialog = dialogRef.current;
      if (dialog === null) return;
      const focusable = getFocusable(dialog);
      if (focusable.length === 0) {
        event.preventDefault();
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement;

      if (event.shiftKey && active === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      }
    },
    [onClose],
  );

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onMouseDown={(event) => {
        if (closeOnBackdrop && event.target === event.currentTarget) onClose();
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        onKeyDown={handleKeyDown}
        className="w-full max-w-md rounded-lg border border-border bg-surface p-6 shadow-lg outline-none"
      >
        <h2 id={titleId} className="text-base font-semibold text-foreground">
          {title}
        </h2>
        <div className="mt-4 text-sm text-foreground">{children}</div>
      </div>
    </div>
  );
};
