"use client";

/**
 * テーマ選択値の管理・永続化・DOM反映を担う Provider（ui-rules §3）。
 * 初期テーマは head の同期スクリプト（THEME_INIT_SCRIPT）が data-theme へ反映済みのため、
 * ここでは選択値の状態管理と以降の変更反映のみを行う。
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

import {
  normalizePreference,
  resolveTheme,
  THEME_STORAGE_KEY,
  type ResolvedTheme,
  type ThemePreference,
} from "./theme";

type ThemeContextValue = {
  readonly preference: ThemePreference;
  readonly resolved: ResolvedTheme;
  readonly setPreference: (preference: ThemePreference) => void;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

const DARK_MEDIA_QUERY = "(prefers-color-scheme: dark)";

const readStoredPreference = (): ThemePreference => {
  if (typeof window === "undefined") return "system";
  return normalizePreference(window.localStorage.getItem(THEME_STORAGE_KEY));
};

const prefersDark = (): boolean =>
  typeof window !== "undefined" && window.matchMedia(DARK_MEDIA_QUERY).matches;

export const ThemeProvider = ({ children }: { children: React.ReactNode }) => {
  // 初期値は localStorage から遅延取得し、head スクリプトが反映した DOM と一致させる
  const [preference, setPreferenceState] = useState<ThemePreference>(readStoredPreference);
  const [systemPrefersDark, setSystemPrefersDark] = useState<boolean>(prefersDark);

  // OS 設定の変更に追従（preference が system のときのみ表示へ影響）
  useEffect(() => {
    const media = window.matchMedia(DARK_MEDIA_QUERY);
    const handleChange = (event: MediaQueryListEvent) => setSystemPrefersDark(event.matches);
    media.addEventListener("change", handleChange);
    return () => media.removeEventListener("change", handleChange);
  }, []);

  const resolved = resolveTheme(preference, systemPrefersDark);

  // 解決結果を data-theme へ反映（初回はスクリプトと同値のため実質no-op）
  useEffect(() => {
    document.documentElement.setAttribute("data-theme", resolved);
  }, [resolved]);

  const setPreference = useCallback((next: ThemePreference) => {
    setPreferenceState(next);
    window.localStorage.setItem(THEME_STORAGE_KEY, next);
  }, []);

  const value = useMemo<ThemeContextValue>(
    () => ({ preference, resolved, setPreference }),
    [preference, resolved, setPreference],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
};

export const useTheme = (): ThemeContextValue => {
  const context = useContext(ThemeContext);
  if (context === null) {
    throw new Error("useTheme は ThemeProvider の内側で使用してください");
  }
  return context;
};
