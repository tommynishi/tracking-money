/**
 * Button の Tailwind クラス算出（純粋関数・ui-rules §6）。
 * DOM に依存しないため単体テスト可能。Button.tsx から利用する。
 */

export type ButtonVariant = "primary" | "secondary" | "danger" | "ghost";

const BASE_CLASSES =
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-md px-4 text-sm font-medium " +
  "transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary " +
  "disabled:cursor-not-allowed disabled:opacity-60";

const VARIANT_CLASSES: Record<ButtonVariant, string> = {
  primary: "bg-primary text-primary-foreground hover:opacity-90",
  secondary: "border border-border bg-surface text-foreground hover:bg-background",
  danger: "bg-danger text-danger-foreground hover:opacity-90",
  ghost: "text-foreground hover:bg-background",
};

export type ButtonStyleOptions = {
  readonly variant?: ButtonVariant;
  readonly fullWidth?: boolean;
  readonly className?: string;
};

/** variant・幅指定・追加クラスから button の className を組み立てる。 */
export const buttonClassName = ({
  variant = "primary",
  fullWidth = false,
  className,
}: ButtonStyleOptions = {}): string =>
  [BASE_CLASSES, VARIANT_CLASSES[variant], fullWidth ? "w-full" : "", className ?? ""]
    .filter((part) => part !== "")
    .join(" ");
