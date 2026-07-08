"use client";

/**
 * 共通ボタン（ui-rules §6）。processing 中は disabled＋スピナー表示で二重送信を防ぐ。
 * ネイティブ button 要素を用い、type は既定で "button"（フォーム誤送信防止）。
 */
import { forwardRef } from "react";

import { buttonClassName, type ButtonVariant } from "./buttonStyles";

type ButtonProps = React.ComponentPropsWithoutRef<"button"> & {
  readonly variant?: ButtonVariant;
  readonly fullWidth?: boolean;
  /** 非同期処理中。true の間は disabled＋スピナーを表示する。 */
  readonly isLoading?: boolean;
};

const Spinner = () => (
  <svg
    className="size-4 animate-spin"
    viewBox="0 0 24 24"
    fill="none"
    aria-hidden="true"
    focusable="false"
  >
    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
  </svg>
);

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant, fullWidth, isLoading = false, disabled, type, className, children, ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type ?? "button"}
      disabled={disabled === true || isLoading}
      aria-busy={isLoading}
      className={buttonClassName({ variant, fullWidth, className })}
      {...rest}
    >
      {isLoading ? <Spinner /> : null}
      {children}
    </button>
  );
});
