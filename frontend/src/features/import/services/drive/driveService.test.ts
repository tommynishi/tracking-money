import { describe, expect, it, vi } from "vitest";

import { saveOriginalToDrive } from "./driveService";

const input = {
  ledgerId: "ledger-1",
  fileName: "enavi202607.csv",
  mimeType: "text/csv",
  bytes: new TextEncoder().encode("csv"),
};

const uploadResult = { fileId: "file-1", webViewLink: "https://drive.example/file-1" };

describe("saveOriginalToDrive", () => {
  it("フォルダ未作成なら作成して drive_folder_id を保存し、原本を格納する（FR-DRIVE-02）", async () => {
    const drive = {
      createFolder: vi.fn().mockResolvedValue("folder-1"),
      uploadFile: vi.fn().mockResolvedValue(uploadResult),
      downloadFile: vi.fn(),
      deleteFile: vi.fn(),
    };
    const folderRepository = {
      getDriveFolderId: vi.fn().mockResolvedValue(null),
      setDriveFolderId: vi.fn().mockResolvedValue(undefined),
    };

    const result = await saveOriginalToDrive({ drive, folderRepository }, input);

    expect(drive.createFolder).toHaveBeenCalledWith("ledger-ledger-1");
    expect(folderRepository.setDriveFolderId).toHaveBeenCalledWith("ledger-1", "folder-1");
    expect(drive.uploadFile).toHaveBeenCalledWith({
      name: input.fileName,
      mimeType: input.mimeType,
      bytes: input.bytes,
      folderId: "folder-1",
    });
    expect(result).toEqual({
      driveFileId: "file-1",
      driveWebViewLink: "https://drive.example/file-1",
      driveStatus: "uploaded",
    });
  });

  it("フォルダ作成済みなら再作成しない", async () => {
    const drive = {
      createFolder: vi.fn(),
      uploadFile: vi.fn().mockResolvedValue(uploadResult),
      downloadFile: vi.fn(),
      deleteFile: vi.fn(),
    };
    const folderRepository = {
      getDriveFolderId: vi.fn().mockResolvedValue("folder-9"),
      setDriveFolderId: vi.fn(),
    };

    await saveOriginalToDrive({ drive, folderRepository }, input);

    expect(drive.createFolder).not.toHaveBeenCalled();
    expect(folderRepository.setDriveFolderId).not.toHaveBeenCalled();
  });

  it("Drive障害時は failed を返し、例外を投げない（FR-DRIVE-06）", async () => {
    const drive = {
      createFolder: vi.fn(),
      uploadFile: vi.fn().mockRejectedValue(new Error("drive down")),
      downloadFile: vi.fn(),
      deleteFile: vi.fn(),
    };
    const folderRepository = {
      getDriveFolderId: vi.fn().mockResolvedValue("folder-9"),
      setDriveFolderId: vi.fn(),
    };

    await expect(saveOriginalToDrive({ drive, folderRepository }, input)).resolves.toEqual({
      driveFileId: null,
      driveWebViewLink: null,
      driveStatus: "failed",
    });
  });
});
