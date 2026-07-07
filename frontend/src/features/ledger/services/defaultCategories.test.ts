import { describe, expect, it } from "vitest";

import { buildDefaultCategories } from "./defaultCategories";

describe("buildDefaultCategories", () => {
  it("database.md §5 の14カテゴリを生成する", () => {
    // Act
    const categories = buildDefaultCategories();

    // Assert
    expect(categories).toHaveLength(14);
    expect(categories.map((category) => category.name)).toEqual([
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
    ]);
  });

  it("sortOrder は 0 始まりで表示順に連番になる", () => {
    // Act
    const categories = buildDefaultCategories();

    // Assert
    expect(categories.map((category) => category.sortOrder)).toEqual([
      0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13,
    ]);
  });

  it("固定費フラグは住居・水道光熱費・通信費・保険のみ true", () => {
    // Act
    const fixedCostNames = buildDefaultCategories()
      .filter((category) => category.isFixedCost)
      .map((category) => category.name);

    // Assert
    expect(fixedCostNames).toEqual(["住居", "水道光熱費", "通信費", "保険"]);
  });

  it("システムカテゴリは「その他」1件のみで末尾に配置される", () => {
    // Act
    const categories = buildDefaultCategories();
    const systemCategories = categories.filter((category) => category.isSystem);

    // Assert
    expect(systemCategories).toHaveLength(1);
    expect(systemCategories[0]?.name).toBe("その他");
    expect(categories.at(-1)?.name).toBe("その他");
  });
});
