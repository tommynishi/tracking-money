"use client";

/**
 * SCR-10 取込履歴（screen.md・FR-CSV-05 / FR-DRIVE-03〜06）。
 * 一覧・詳細（エラー行）・原本ダウンロード・Drive原本削除（明細は残る）。
 */
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import { apiFetch, isApiError } from "@/shared/api/client";
import type { ListMeta } from "@/shared/api/response";
import { Button } from "@/shared/components/Button";
import { Modal } from "@/shared/components/Modal";
import { useToast } from "@/shared/components/toast/ToastProvider";
import { formatDateTime } from "@/shared/utils/format";

type Me = { readonly personalLedgerId: string | null; readonly familyLedgerId: string | null };

type ImportHistoryItem = {
  readonly id: string;
  readonly fileName: string;
  readonly fileType: "csv" | "pdf";
  readonly format: string;
  readonly billingMonth: string;
  readonly status: "analyzed" | "completed" | "partial" | "failed";
  readonly importedCount: number;
  readonly skippedCount: number;
  readonly errorCount: number;
  readonly driveWebViewLink: string | null;
  readonly driveStatus: "uploaded" | "failed";
  readonly hasDriveFile: boolean;
  readonly createdAt: string;
};

type ImportDetail = ImportHistoryItem & {
  readonly errorRows: readonly { rowNo: number; raw: string; message: string }[];
};

const STATUS_LABELS: Record<ImportHistoryItem["status"], string> = {
  analyzed: "確定待ち",
  completed: "完了",
  partial: "一部エラー",
  failed: "失敗",
};

export const ImportHistoryScreen = () => {
  const { showToast } = useToast();
  const [ledgerId, setLedgerId] = useState<string | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [items, setItems] = useState<ImportHistoryItem[]>([]);
  const [meta, setMeta] = useState<ListMeta | null>(null);
  const [page, setPage] = useState(1);
  const [detail, setDetail] = useState<ImportDetail | null>(null);
  const [deleting, setDeleting] = useState<ImportHistoryItem | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  useEffect(() => {
    void apiFetch<Me>("/api/me")
      .then(({ data }) => setLedgerId(data.personalLedgerId ?? data.familyLedgerId))
      .catch(() => setLoadError(true));
  }, []);

  const loadItems = useCallback((): Promise<void> => {
    if (ledgerId === null) return Promise.resolve();
    return apiFetch<ImportHistoryItem[]>(`/api/ledgers/${ledgerId}/imports?page=${page}`)
      .then(({ data, meta: listMeta }) => {
        setItems(data);
        setMeta(listMeta ?? null);
      })
      .catch(() => setLoadError(true));
  }, [ledgerId, page]);

  useEffect(() => {
    void loadItems();
  }, [loadItems]);

  const openDetail = async (item: ImportHistoryItem) => {
    try {
      const { data } = await apiFetch<ImportDetail>(`/api/ledgers/${ledgerId}/imports/${item.id}`);
      setDetail(data);
    } catch (error) {
      showToast({
        type: "error",
        message: isApiError(error) ? error.message : "詳細の取得に失敗しました",
      });
    }
  };

  const deleteDriveFile = async () => {
    if (deleting === null || ledgerId === null) return;
    setIsDeleting(true);
    try {
      await apiFetch(`/api/ledgers/${ledgerId}/imports/${deleting.id}/file`, { method: "DELETE" });
      showToast({ type: "success", message: "Drive上の原本ファイルを削除しました" });
      setDeleting(null);
      await loadItems();
    } catch (error) {
      showToast({
        type: "error",
        message: isApiError(error) ? error.message : "削除に失敗しました",
      });
    } finally {
      setIsDeleting(false);
    }
  };

  if (loadError) {
    return <p className="text-sm text-danger">読み込みに失敗しました。再読み込みしてください。</p>;
  }
  if (ledgerId === null) {
    return <div className="h-40 animate-pulse rounded-lg border border-border bg-surface" />;
  }

  const countsText = (item: ImportHistoryItem): string =>
    `取込${item.importedCount}／スキップ${item.skippedCount}／エラー${item.errorCount}`;

  const driveCell = (item: ImportHistoryItem) =>
    item.driveStatus === "failed" ? (
      <span className="text-xs text-danger">保存失敗</span>
    ) : item.driveWebViewLink !== null ? (
      <a
        href={item.driveWebViewLink}
        target="_blank"
        rel="noreferrer"
        className="text-xs text-primary underline"
      >
        Driveで開く
      </a>
    ) : (
      <span className="text-xs text-muted">削除済み</span>
    );

  const actions = (item: ImportHistoryItem) => (
    <div className="flex flex-wrap gap-2">
      <Button variant="secondary" onClick={() => void openDetail(item)}>
        詳細
      </Button>
      {item.hasDriveFile && (
        <>
          <a href={`/api/ledgers/${ledgerId}/imports/${item.id}/download`} download>
            <Button variant="secondary">ダウンロード</Button>
          </a>
          <Button variant="danger" onClick={() => setDeleting(item)}>
            原本削除
          </Button>
        </>
      )}
    </div>
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold text-foreground">取込履歴</h1>
        <Link href="/import" className="text-sm text-primary underline">
          新しく取り込む
        </Link>
      </div>

      {items.length === 0 ? (
        <div className="rounded-lg border border-border bg-surface p-8 text-center text-sm text-muted">
          取込履歴はまだありません。
          <Link href="/import" className="ml-1 text-primary underline">
            CSVを取り込む
          </Link>
        </div>
      ) : (
        <>
          {/* PC: 表形式 */}
          <div className="hidden overflow-x-auto rounded-lg border border-border md:block">
            <table className="w-full text-sm">
              <thead className="bg-surface text-left text-muted">
                <tr>
                  <th className="px-3 py-2">取込日時</th>
                  <th className="px-3 py-2">ファイル名</th>
                  <th className="px-3 py-2">形式</th>
                  <th className="px-3 py-2">支払月</th>
                  <th className="px-3 py-2">件数</th>
                  <th className="px-3 py-2">状態</th>
                  <th className="px-3 py-2">Drive</th>
                  <th className="px-3 py-2">操作</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <tr key={item.id} className="border-t border-border">
                    <td className="px-3 py-2 whitespace-nowrap">{formatDateTime(item.createdAt)}</td>
                    <td className="px-3 py-2">{item.fileName}</td>
                    <td className="px-3 py-2">{item.format}</td>
                    <td className="px-3 py-2 whitespace-nowrap">{item.billingMonth}</td>
                    <td className="px-3 py-2 whitespace-nowrap">{countsText(item)}</td>
                    <td className="px-3 py-2">{STATUS_LABELS[item.status]}</td>
                    <td className="px-3 py-2">{driveCell(item)}</td>
                    <td className="px-3 py-2">{actions(item)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* スマホ: カード形式 */}
          <ul className="space-y-2 md:hidden">
            {items.map((item) => (
              <li key={item.id} className="space-y-2 rounded-lg border border-border bg-surface p-3">
                <div className="flex items-center justify-between text-sm">
                  <span className="font-medium text-foreground">{item.fileName}</span>
                  <span className="text-muted">{STATUS_LABELS[item.status]}</span>
                </div>
                <p className="text-xs text-muted">
                  {formatDateTime(item.createdAt)}／{item.format}／支払月{item.billingMonth}／
                  {countsText(item)}
                </p>
                <div className="flex items-center justify-between">
                  {driveCell(item)}
                  {actions(item)}
                </div>
              </li>
            ))}
          </ul>

          {meta !== null && meta.totalPages > 1 && (
            <div className="flex items-center justify-center gap-3 text-sm">
              <Button variant="secondary" onClick={() => setPage(page - 1)} disabled={page <= 1}>
                前へ
              </Button>
              <span className="text-muted">
                {meta.page} / {meta.totalPages}
              </span>
              <Button
                variant="secondary"
                onClick={() => setPage(page + 1)}
                disabled={page >= meta.totalPages}
              >
                次へ
              </Button>
            </div>
          )}
        </>
      )}

      <Modal
        isOpen={detail !== null}
        onClose={() => setDetail(null)}
        title={detail?.fileName ?? "取込詳細"}
      >
        {detail !== null && (
          <div className="space-y-3 text-sm">
            <p className="text-muted">
              {formatDateTime(detail.createdAt)}／{detail.format}／支払月{detail.billingMonth}／
              {STATUS_LABELS[detail.status]}
            </p>
            <p className="text-foreground">{countsText(detail)}</p>
            {detail.driveStatus === "failed" && (
              <p className="text-danger">
                原本ファイルのDrive保存に失敗しています（明細の取込には影響ありません）
              </p>
            )}
            {detail.errorRows.length > 0 && (
              <div>
                <h3 className="font-medium text-foreground">エラー行</h3>
                <ul className="mt-1 max-h-48 space-y-1 overflow-y-auto text-xs text-muted">
                  {detail.errorRows.map((row) => (
                    <li key={row.rowNo}>
                      {row.rowNo}行目：{row.message}（{row.raw}）
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </Modal>

      <Modal
        isOpen={deleting !== null}
        onClose={() => setDeleting(null)}
        title="Drive原本の削除"
      >
        <div className="space-y-4 text-sm">
          <p className="text-foreground">
            「{deleting?.fileName}」の原本ファイルをDriveから削除します。
            取り込んだ明細と取込履歴は残ります。よろしいですか？
          </p>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setDeleting(null)} disabled={isDeleting}>
              キャンセル
            </Button>
            <Button variant="danger" onClick={() => void deleteDriveFile()} disabled={isDeleting}>
              {isDeleting ? "削除中…" : "削除する"}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
};
