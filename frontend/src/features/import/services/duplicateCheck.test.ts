import { describe, expect, it, vi } from "vitest";

import type { EntryDuplicateKey } from "@/features/entry/repositories/entryRepository";

import { isFileAlreadyImported, markDuplicateRows } from "./duplicateCheck";

const existing: EntryDuplicateKey[] = [
  { entryId: "entry-9", usedOn: "2026-06-24", amount: 315, normalizedDescription: "ファミリーマート" },
];

describe("markDuplicateRows", () => {
  it("既存明細と一致する行に重複情報を付ける（摘要は正規化して比較・FR-DUP-01）", async () => {
    const listDuplicateKeys = vi.fn().mockResolvedValue(existing);
    const rows = await markDuplicateRows({ listDuplicateKeys }, "ledger-1", [
      // 全角・大文字小文字・空白差は正規化で吸収される
      { rowNumber: 2, usedOn: "2026-06-24", amount: 315, description: "ﾌｧﾐﾘｰﾏｰﾄ" },
      { rowNumber: 3, usedOn: "2026-06-24", amount: 999, description: "ファミリーマート" },
      { rowNumber: 4, usedOn: "2026-06-25", amount: 315, description: "ファミリーマート" },
    ]);

    expect(rows.map((row) => row.duplicate)).toEqual([
      { entryId: "entry-9", usedOn: "2026-06-24", amount: 315 },
      null,
      null,
    ]);
    expect(rows[0].normalizedDescription).toBe("ファミリーマート");
    // 照会は行の利用日範囲に絞る
    expect(listDuplicateKeys).toHaveBeenCalledWith("ledger-1", "2026-06-24", "2026-06-25");
  });

  it("行が空なら照会せず空配列を返す", async () => {
    const listDuplicateKeys = vi.fn();
    const rows = await markDuplicateRows({ listDuplicateKeys }, "ledger-1", []);
    expect(rows).toEqual([]);
    expect(listDuplicateKeys).not.toHaveBeenCalled();
  });
});

describe("isFileAlreadyImported", () => {
  it("ハッシュ一致の取込履歴の有無を返す（FR-DUP-03）", async () => {
    const existsByFileHash = vi.fn().mockResolvedValue(true);
    await expect(isFileAlreadyImported({ existsByFileHash }, "ledger-1", "hash")).resolves.toBe(
      true,
    );
    expect(existsByFileHash).toHaveBeenCalledWith("ledger-1", "hash");
  });
});
