/**
 * 取込原本の Drive 保存（FR-DRIVE-01 / 02 / 06）。
 * 家計簿フォルダが未作成なら作成して ledgers.drive_folder_id に保存し、原本を格納する。
 * 保存失敗は取込を失敗させず drive_status: "failed" として返す（FR-DRIVE-06）。
 */
import { getServerEnv } from "@/shared/config/env";

import type { LedgerDriveFolderRepository } from "../../repositories/ledgerDriveFolderRepository";

import type { DriveClient } from "./driveClient";

export type SaveOriginalResult = {
  readonly driveFileId: string | null;
  readonly driveWebViewLink: string | null;
  readonly driveStatus: "uploaded" | "failed";
};

export type SaveOriginalDeps = {
  readonly drive: DriveClient;
  readonly folderRepository: LedgerDriveFolderRepository;
};

export type SaveOriginalInput = {
  readonly ledgerId: string;
  readonly fileName: string;
  readonly mimeType: string;
  readonly bytes: Uint8Array;
};

/** 家計簿フォルダ名（Drive 上の識別用。家計簿単位で一意）。 */
const folderNameFor = (ledgerId: string): string => `ledger-${ledgerId}`;

export const saveOriginalToDrive = async (
  deps: SaveOriginalDeps,
  input: SaveOriginalInput,
): Promise<SaveOriginalResult> => {
  try {
    let folderId = await deps.folderRepository.getDriveFolderId(input.ledgerId);
    if (folderId === null) {
      const { GOOGLE_DRIVE_ROOT_FOLDER_ID } = getServerEnv();
      folderId = await deps.drive.createFolder(
        folderNameFor(input.ledgerId),
        GOOGLE_DRIVE_ROOT_FOLDER_ID,
      );
      await deps.folderRepository.setDriveFolderId(input.ledgerId, folderId);
    }
    const uploaded = await deps.drive.uploadFile({
      name: input.fileName,
      mimeType: input.mimeType,
      bytes: input.bytes,
      folderId,
    });
    return {
      driveFileId: uploaded.fileId,
      driveWebViewLink: uploaded.webViewLink,
      driveStatus: "uploaded",
    };
  } catch {
    // 原因はレスポンスへ出さない（Drive障害・設定不備など。FR-DRIVE-06）
    return { driveFileId: null, driveWebViewLink: null, driveStatus: "failed" };
  }
};
