/**
 * Google Drive API v3 クライアント（FR-DRIVE-01〜04）。
 * アプリ管理の共通Drive（サービスアカウント）に対する最小限の操作のみ提供する。
 * 認証・HTTP は fetch ベース（SDK 依存なし）。失敗は ExternalServiceError で表す。
 */
import { z } from "zod";

import { ExternalServiceError } from "@/shared/errors/appError";

import { getDriveAccessToken } from "./googleAuth";

const FILES_URL = "https://www.googleapis.com/drive/v3/files";
const UPLOAD_URL = "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,webViewLink";
const FOLDER_MIME = "application/vnd.google-apps.folder";

const fileSchema = z.object({ id: z.string().min(1), webViewLink: z.string().optional() });

export type DriveUploadResult = { readonly fileId: string; readonly webViewLink: string | null };

export type DriveClient = {
  /** フォルダを作成して ID を返す（家計簿単位の分離・FR-DRIVE-02）。 */
  createFolder(name: string, parentFolderId?: string): Promise<string>;
  /** ファイルを保存して ID とリンクを返す（FR-DRIVE-01 / 05）。 */
  uploadFile(input: {
    name: string;
    mimeType: string;
    bytes: Uint8Array;
    folderId: string;
  }): Promise<DriveUploadResult>;
  /** ファイル内容を取得する（FR-DRIVE-03）。 */
  downloadFile(fileId: string): Promise<Uint8Array>;
  /** ファイルを削除する（FR-DRIVE-04）。 */
  deleteFile(fileId: string): Promise<void>;
};

const authHeaders = async (): Promise<Record<string, string>> => ({
  authorization: `Bearer ${await getDriveAccessToken()}`,
});

const assertOk = (response: Response, operation: string): void => {
  if (!response.ok) {
    throw new ExternalServiceError(`Drive ${operation} に失敗しました（status=${response.status}）`);
  }
};

export const createDriveClient = (): DriveClient => ({
  async createFolder(name, parentFolderId) {
    const response = await fetch(`${FILES_URL}?fields=id`, {
      method: "POST",
      headers: { ...(await authHeaders()), "content-type": "application/json" },
      body: JSON.stringify({
        name,
        mimeType: FOLDER_MIME,
        ...(parentFolderId === undefined ? {} : { parents: [parentFolderId] }),
      }),
    });
    assertOk(response, "フォルダ作成");
    return fileSchema.parse(await response.json()).id;
  },

  async uploadFile(input) {
    // multipart/related（メタデータ＋本体）で1リクエスト保存する
    const boundary = `boundary-${crypto.randomUUID()}`;
    const metadata = JSON.stringify({
      name: input.name,
      parents: [input.folderId],
      mimeType: input.mimeType,
    });
    const head =
      `--${boundary}\r\ncontent-type: application/json; charset=UTF-8\r\n\r\n${metadata}\r\n` +
      `--${boundary}\r\ncontent-type: ${input.mimeType}\r\n\r\n`;
    const tail = `\r\n--${boundary}--`;
    const body = new Uint8Array(
      Buffer.concat([Buffer.from(head), Buffer.from(input.bytes), Buffer.from(tail)]),
    );

    const response = await fetch(UPLOAD_URL, {
      method: "POST",
      headers: {
        ...(await authHeaders()),
        "content-type": `multipart/related; boundary=${boundary}`,
      },
      body,
    });
    assertOk(response, "アップロード");
    const file = fileSchema.parse(await response.json());
    return { fileId: file.id, webViewLink: file.webViewLink ?? null };
  },

  async downloadFile(fileId) {
    const response = await fetch(`${FILES_URL}/${fileId}?alt=media`, {
      headers: await authHeaders(),
    });
    assertOk(response, "ダウンロード");
    return new Uint8Array(await response.arrayBuffer());
  },

  async deleteFile(fileId) {
    const response = await fetch(`${FILES_URL}/${fileId}`, {
      method: "DELETE",
      headers: await authHeaders(),
    });
    assertOk(response, "削除");
  },
});
