/**
 * テーマ（ダークモード）の純粋ロジックと定数（ui-rules §3）。
 * DOM・React に依存しないため単体テスト可能。副作用は ThemeProvider が担う。
 */

/** ユーザーの選択値。system は OS の prefers-color-scheme に従う。 */
export type ThemePreference = "light" | "dark" | "system";

/** 実際に適用されるテーマ（data-theme 属性に入る値）。 */
export type ResolvedTheme = "light" | "dark";

/** localStorage のキー。head 同期スクリプトと同じ値を使う。 */
export const THEME_STORAGE_KEY = "theme";

export const THEME_PREFERENCES: readonly ThemePreference[] = ["light", "dark", "system"];

const isThemePreference = (value: unknown): value is ThemePreference =>
  value === "light" || value === "dark" || value === "system";

/** localStorage 由来の未検証値を ThemePreference へ正規化する（不正値は system）。 */
export const normalizePreference = (value: unknown): ThemePreference =>
  isThemePreference(value) ? value : "system";

/** 選択値と OS 設定から実際に適用するテーマを解決する。 */
export const resolveTheme = (
  preference: ThemePreference,
  systemPrefersDark: boolean,
): ResolvedTheme => {
  if (preference === "system") {
    return systemPrefersDark ? "dark" : "light";
  }
  return preference;
};

/**
 * head で同期実行し、FOUC・hydration mismatch を防ぐ初期化スクリプト。
 * localStorage の選択値を解決して data-theme を付与する（Next 16 preventing-flash ガイド準拠）。
 */
export const THEME_INIT_SCRIPT = `(function(){try{var p=localStorage.getItem("${THEME_STORAGE_KEY}");var d=p==="dark"||((p==="system"||!p)&&window.matchMedia("(prefers-color-scheme: dark)").matches);document.documentElement.setAttribute("data-theme",d?"dark":"light");}catch(e){}})()`;
