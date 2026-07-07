/**
 * 家計簿作成時に投入するデフォルトカテゴリの定義（FR-CATEGORY-02 / database.md §5）。
 * 一覧・固定費・システムカテゴリの正はこのモジュールとする（DBのグローバル seed は持たない）。
 */
import type { DefaultCategorySeed } from "../types";

/** 表示順に並べたデフォルトカテゴリ名（database.md §5）。 */
const DEFAULT_CATEGORY_NAMES = [
  "食費",
  "日用品",
  "交通費",
  "住居",
  "水道光熱費",
  "通信費",
  "保険",
  "医療",
  "教育",
  "娯楽",
  "被服",
  "交際費",
  "サブスク",
  "その他",
] as const;

/** 固定費フラグを初期値 true にするカテゴリ（database.md §5）。 */
const FIXED_COST_CATEGORY_NAMES: ReadonlySet<string> = new Set([
  "住居",
  "水道光熱費",
  "通信費",
  "保険",
]);

/** システムカテゴリ（削除不可・付け替え先。database.md §3.5 / FR-CATEGORY-03）。 */
const SYSTEM_CATEGORY_NAME = "その他";

/**
 * デフォルトカテゴリ一式を表示順（sortOrder 昇順）で生成する純粋関数。
 * 家計簿作成時に Service がこの結果を投入する。
 */
export const buildDefaultCategories = (): DefaultCategorySeed[] =>
  DEFAULT_CATEGORY_NAMES.map((name, index) => ({
    name,
    isFixedCost: FIXED_COST_CATEGORY_NAMES.has(name),
    isSystem: name === SYSTEM_CATEGORY_NAME,
    sortOrder: index,
  }));
