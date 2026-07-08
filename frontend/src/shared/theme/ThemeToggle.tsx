"use client";

/**
 * テーマ切替（ライト / ダーク / システム）。ヘッダーのアカウントメニューから使用する（ui-rules §3）。
 * 選択状態は aria-pressed で表現し、キーボードのみで操作できる。
 */
import { THEME_PREFERENCES, type ThemePreference } from "./theme";
import { useTheme } from "./ThemeProvider";

const LABELS: Record<ThemePreference, string> = {
  light: "ライト",
  dark: "ダーク",
  system: "システム",
};

export const ThemeToggle = () => {
  const { preference, setPreference } = useTheme();

  return (
    <div
      role="group"
      aria-label="テーマ切替"
      className="inline-flex rounded-md border border-border p-0.5"
    >
      {THEME_PREFERENCES.map((option) => {
        const isActive = preference === option;
        return (
          <button
            key={option}
            type="button"
            aria-pressed={isActive}
            onClick={() => setPreference(option)}
            className={`min-h-11 rounded px-3 text-sm transition-colors ${
              isActive ? "bg-primary text-primary-foreground" : "text-muted hover:text-foreground"
            }`}
          >
            {LABELS[option]}
          </button>
        );
      })}
    </div>
  );
};
