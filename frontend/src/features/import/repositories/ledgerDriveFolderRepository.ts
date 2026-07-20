/**
 * ledgers.drive_folder_id の読み書き（FR-DRIVE-02・database.md 3.2）。
 * インポート機能専用のため、家計簿の主 Repository とは分離して最小限に保つ。
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

import { NotFoundError } from "@/shared/errors/appError";

const TABLE = "ledgers";

export type LedgerDriveFolderRepository = {
  getDriveFolderId(ledgerId: string): Promise<string | null>;
  setDriveFolderId(ledgerId: string, folderId: string): Promise<void>;
};

export const createLedgerDriveFolderRepository = (
  client: SupabaseClient,
): LedgerDriveFolderRepository => ({
  async getDriveFolderId(ledgerId) {
    const { data, error } = await client
      .from(TABLE)
      .select("drive_folder_id")
      .eq("id", ledgerId)
      .is("deleted_at", null)
      .maybeSingle();

    if (error) {
      throw new Error(`Failed to get drive folder id: ${error.message}`);
    }
    if (data === null) {
      throw new NotFoundError("家計簿が見つかりません");
    }
    return z.object({ drive_folder_id: z.string().nullable() }).parse(data).drive_folder_id;
  },

  async setDriveFolderId(ledgerId, folderId) {
    const { error } = await client
      .from(TABLE)
      .update({ drive_folder_id: folderId })
      .eq("id", ledgerId)
      .is("deleted_at", null);

    if (error) {
      throw new Error(`Failed to set drive folder id: ${error.message}`);
    }
  },
});
