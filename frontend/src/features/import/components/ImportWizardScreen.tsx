"use client";

/**
 * SCR-09 インポートウィザード（screen.md・FR-CSV-01〜07 / FR-DUP-01〜03 / FR-AICAT-02）。
 * Step1: ファイル選択・フォーマット指定（汎用は列マッピング）→ Step2: プレビュー確認 → Step3: 結果。
 */
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import { apiFetch, isApiError } from "@/shared/api/client";
import { Button } from "@/shared/components/Button";
import { useToast } from "@/shared/components/toast/ToastProvider";
import { formatAmount, formatDateList } from "@/shared/utils/format";
import { currentBillingMonth } from "@/shared/utils/month";

import type { Category } from "@/features/category/types";
import { LedgerSetup } from "@/features/ledger/components/LedgerSetup";

type Me = { readonly personalLedgerId: string | null; readonly familyLedgerId: string | null };

type SavedMapping = {
  readonly id: string;
  readonly name: string;
};

type PreviewRow = {
  readonly rowNo: number;
  readonly usedOn: string;
  readonly billingMonth: string;
  readonly amount: number;
  readonly description: string;
  readonly suggestedCategoryId: string;
  readonly categorySource: "rule" | "ai" | "none";
  readonly duplicate: { entryId: string; usedOn: string; amount: number } | null;
};

type AnalyzeResult = {
  readonly importFileId: string;
  readonly format: string;
  readonly fileName: string;
  readonly rows: readonly PreviewRow[];
  readonly errorRows: readonly { rowNo: number; message: string }[];
};

type ConfirmResult = {
  readonly importedCount: number;
  readonly skippedCount: number;
  readonly errorCount: number;
};

type EditableRow = PreviewRow & {
  readonly include: boolean;
  readonly categoryId: string;
  readonly memo: string;
};

const FORMAT_OPTIONS = [
  { value: "", label: "自動判定" },
  { value: "rakuten", label: "楽天カード" },
  { value: "jcb", label: "JCBカード" },
  { value: "generic", label: "汎用CSV（列マッピング）" },
] as const;

const USED_ON_FORMAT_OPTIONS = ["YYYY/MM/DD", "YYYY-MM-DD", "YYYYMMDD"] as const;

const SOURCE_LABELS: Record<PreviewRow["categorySource"], string> = {
  rule: "学習",
  ai: "AI",
  none: "未分類",
};

const STEPS = ["ファイル選択", "プレビュー確認", "結果"] as const;

export const ImportWizardScreen = () => {
  const { showToast } = useToast();
  const [ledgerId, setLedgerId] = useState<string | null>(null);
  const [needsSetup, setNeedsSetup] = useState(false);
  const [meError, setMeError] = useState(false);

  const [step, setStep] = useState(0);
  const [file, setFile] = useState<File | null>(null);
  const [billingMonth, setBillingMonth] = useState(currentBillingMonth());
  const [format, setFormat] = useState<string>("");
  const [savedMappings, setSavedMappings] = useState<SavedMapping[]>([]);
  const [mappingId, setMappingId] = useState("");
  const [headerRows, setHeaderRows] = useState("1");
  const [usedOnColumn, setUsedOnColumn] = useState("0");
  const [usedOnFormat, setUsedOnFormat] = useState<string>("YYYY/MM/DD");
  const [descriptionColumn, setDescriptionColumn] = useState("1");
  const [amountColumn, setAmountColumn] = useState("2");
  const [saveMappingName, setSaveMappingName] = useState("");

  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analyzeError, setAnalyzeError] = useState<string | null>(null);
  const [duplicateFileWarning, setDuplicateFileWarning] = useState(false);

  const [analyzed, setAnalyzed] = useState<AnalyzeResult | null>(null);
  const [rows, setRows] = useState<EditableRow[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [isConfirming, setIsConfirming] = useState(false);
  const [result, setResult] = useState<ConfirmResult | null>(null);

  useEffect(() => {
    void apiFetch<Me>("/api/me")
      .then(({ data }) => {
        const resolved = data.personalLedgerId ?? data.familyLedgerId;
        if (resolved === null) {
          setNeedsSetup(true);
        } else {
          setLedgerId(resolved);
        }
      })
      .catch(() => setMeError(true));
  }, []);

  useEffect(() => {
    if (ledgerId === null) return;
    void apiFetch<SavedMapping[]>(`/api/ledgers/${ledgerId}/csv-mappings`)
      .then(({ data }) => setSavedMappings(data))
      .catch(() => showToast({ type: "error", message: "マッピング一覧の取得に失敗しました" }));
    void apiFetch<Category[]>(`/api/ledgers/${ledgerId}/categories`)
      .then(({ data }) => setCategories(data))
      .catch(() => showToast({ type: "error", message: "カテゴリの取得に失敗しました" }));
  }, [ledgerId, showToast]);

  const inlineMapping = useCallback(
    () => ({
      headerRows: Number(headerRows),
      usedOnColumn: Number(usedOnColumn),
      usedOnFormat,
      descriptionColumn: Number(descriptionColumn),
      amountColumn: Number(amountColumn),
    }),
    [headerRows, usedOnColumn, usedOnFormat, descriptionColumn, amountColumn],
  );

  const analyze = async (force: boolean) => {
    if (ledgerId === null || file === null) return;
    setIsAnalyzing(true);
    setAnalyzeError(null);
    setDuplicateFileWarning(false);
    try {
      // 汎用CSVで新規マッピングを保存する場合は先に保存して再利用可能にする（FR-CSV-02）
      let effectiveMappingId = mappingId;
      if (format === "generic" && mappingId === "" && saveMappingName.trim() !== "") {
        const saved = await apiFetch<SavedMapping>(`/api/ledgers/${ledgerId}/csv-mappings`, {
          method: "POST",
          body: JSON.stringify({ name: saveMappingName.trim(), mapping: inlineMapping() }),
        });
        effectiveMappingId = saved.data.id;
        setSavedMappings((current) => [...current, saved.data]);
      }

      const form = new FormData();
      form.set("file", file);
      form.set("force", force ? "true" : "false");
      form.set("billingMonth", billingMonth);
      if (format !== "") form.set("format", format);
      if (format === "generic") {
        if (effectiveMappingId !== "") {
          form.set("mappingId", effectiveMappingId);
        } else {
          form.set("mapping", JSON.stringify(inlineMapping()));
        }
      }
      const { data } = await apiFetch<AnalyzeResult>(`/api/ledgers/${ledgerId}/imports/analyze`, {
        method: "POST",
        body: form,
      });
      setAnalyzed(data);
      setRows(
        data.rows.map((row) => ({
          ...row,
          // 重複候補の既定はスキップ（FR-DUP-02）
          include: row.duplicate === null,
          categoryId: row.suggestedCategoryId,
          memo: "",
        })),
      );
      setStep(1);
    } catch (error) {
      if (isApiError(error) && error.details?.some((detail) => detail.code === "DUPLICATE_FILE")) {
        setDuplicateFileWarning(true);
      } else if (
        isApiError(error) &&
        error.details?.some((detail) => detail.code === "FORMAT_UNKNOWN")
      ) {
        setAnalyzeError(
          "フォーマットを自動判定できませんでした。カード会社を選択するか、汎用CSVで列を指定してください",
        );
      } else {
        setAnalyzeError(isApiError(error) ? error.message : "解析に失敗しました");
      }
    } finally {
      setIsAnalyzing(false);
    }
  };

  const confirm = async () => {
    if (ledgerId === null || analyzed === null) return;
    setIsConfirming(true);
    try {
      const { data } = await apiFetch<ConfirmResult>(
        `/api/ledgers/${ledgerId}/imports/${analyzed.importFileId}/confirm`,
        {
          method: "POST",
          body: JSON.stringify({
            rows: rows.map((row) => ({
              usedOn: row.usedOn,
              billingMonth: row.billingMonth,
              amount: row.amount,
              description: row.description,
              categoryId: row.categoryId,
              memo: row.memo.trim() === "" ? null : row.memo,
              skip: !row.include,
            })),
          }),
        },
      );
      setResult(data);
      setStep(2);
    } catch (error) {
      showToast({
        type: "error",
        message: isApiError(error) ? error.message : "取込の確定に失敗しました",
      });
    } finally {
      setIsConfirming(false);
    }
  };

  const reset = () => {
    setStep(0);
    setFile(null);
    setAnalyzed(null);
    setRows([]);
    setResult(null);
    setDuplicateFileWarning(false);
    setAnalyzeError(null);
  };

  const updateRow = (
    rowNo: number,
    patch: Partial<Pick<EditableRow, "include" | "categoryId" | "billingMonth" | "memo">>,
  ) => {
    setRows((current) => current.map((row) => (row.rowNo === rowNo ? { ...row, ...patch } : row)));
  };

  const setAllInclude = (include: boolean) => {
    setRows((current) => current.map((row) => ({ ...row, include })));
  };

  if (needsSetup) {
    return (
      <LedgerSetup
        onCreated={(createdLedgerId) => {
          setNeedsSetup(false);
          setLedgerId(createdLedgerId);
        }}
      />
    );
  }
  if (meError) {
    return <p className="text-sm text-danger">読み込みに失敗しました。再読み込みしてください。</p>;
  }
  if (ledgerId === null) {
    return <div className="h-40 animate-pulse rounded-lg border border-border bg-surface" />;
  }

  const includeCount = rows.filter((row) => row.include).length;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold text-foreground">インポート</h1>
        <Link href="/imports" className="text-sm text-primary underline">
          取込履歴を見る
        </Link>
      </div>

      <ol aria-label="ステップ" className="flex gap-2 text-sm">
        {STEPS.map((label, index) => (
          <li
            key={label}
            aria-current={index === step ? "step" : undefined}
            className={`rounded-full px-3 py-1 ${
              index === step
                ? "bg-primary text-primary-foreground"
                : "border border-border text-muted"
            }`}
          >
            {index + 1}. {label}
          </li>
        ))}
      </ol>

      {step === 0 && (
        <section className="space-y-4 rounded-lg border border-border bg-surface p-4">
          <div>
            <label htmlFor="import-file" className="block text-sm font-medium text-foreground">
              ファイル（CSV・最大10MB）
            </label>
            <input
              id="import-file"
              type="file"
              accept=".csv,.pdf"
              className="mt-1 block w-full text-sm text-foreground"
              onChange={(event) => setFile(event.target.files?.[0] ?? null)}
            />
          </div>
          <div>
            <label htmlFor="import-billing-month" className="block text-sm font-medium text-foreground">
              支払月
            </label>
            <input
              id="import-billing-month"
              type="month"
              required
              value={billingMonth}
              onChange={(event) => setBillingMonth(event.target.value)}
              className="mt-1 rounded-md border border-border bg-background px-2 py-1.5 text-sm text-foreground"
            />
            <p className="mt-1 text-xs text-muted">
              この明細（請求書）の対象月です。全行に適用され、プレビューで行ごとに変更もできます。
            </p>
          </div>
          <div>
            <label htmlFor="import-format" className="block text-sm font-medium text-foreground">
              フォーマット
            </label>
            <select
              id="import-format"
              value={format}
              onChange={(event) => setFormat(event.target.value)}
              className="mt-1 rounded-md border border-border bg-background px-2 py-1.5 text-sm text-foreground"
            >
              {FORMAT_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>

          {format === "generic" && (
            <fieldset className="space-y-3 rounded-md border border-border p-3">
              <legend className="px-1 text-sm font-medium text-foreground">列マッピング</legend>
              <div>
                <label htmlFor="mapping-id" className="block text-sm text-foreground">
                  保存済みマッピング
                </label>
                <select
                  id="mapping-id"
                  value={mappingId}
                  onChange={(event) => setMappingId(event.target.value)}
                  className="mt-1 rounded-md border border-border bg-background px-2 py-1.5 text-sm text-foreground"
                >
                  <option value="">新規に指定する</option>
                  {savedMappings.map((saved) => (
                    <option key={saved.id} value={saved.id}>
                      {saved.name}
                    </option>
                  ))}
                </select>
              </div>
              {mappingId === "" && (
                <>
                  <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
                    {(
                      [
                        ["ヘッダー行数", headerRows, setHeaderRows],
                        ["利用日の列", usedOnColumn, setUsedOnColumn],
                        ["摘要の列", descriptionColumn, setDescriptionColumn],
                        ["金額の列", amountColumn, setAmountColumn],
                      ] as const
                    ).map(([label, value, setter]) => (
                      <div key={label}>
                        <label className="block text-sm text-foreground">
                          {label}
                          <input
                            type="number"
                            min={0}
                            value={value}
                            onChange={(event) => setter(event.target.value)}
                            className="mt-1 w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm text-foreground"
                          />
                        </label>
                      </div>
                    ))}
                    <div>
                      <label className="block text-sm text-foreground">
                        日付形式
                        <select
                          value={usedOnFormat}
                          onChange={(event) => setUsedOnFormat(event.target.value)}
                          className="mt-1 w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm text-foreground"
                        >
                          {USED_ON_FORMAT_OPTIONS.map((option) => (
                            <option key={option} value={option}>
                              {option}
                            </option>
                          ))}
                        </select>
                      </label>
                    </div>
                  </div>
                  <p className="text-xs text-muted">列番号は 0 始まりです（先頭の列が 0）。</p>
                  <div>
                    <label className="block text-sm text-foreground">
                      このマッピングを保存する（任意・名前を入力）
                      <input
                        type="text"
                        value={saveMappingName}
                        onChange={(event) => setSaveMappingName(event.target.value)}
                        placeholder="例：◯◯カード用"
                        className="mt-1 w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm text-foreground"
                      />
                    </label>
                  </div>
                </>
              )}
            </fieldset>
          )}

          {analyzeError !== null && <p className="text-sm text-danger">{analyzeError}</p>}
          {duplicateFileWarning && (
            <div className="space-y-2 rounded-md border border-border bg-background p-3">
              <p className="text-sm text-foreground">
                このファイルは取込済みです。それでも取り込みますか？（FR-DUP-03）
              </p>
              <Button
                variant="secondary"
                onClick={() => void analyze(true)}
                disabled={isAnalyzing}
              >
                それでも取り込む
              </Button>
            </div>
          )}

          <Button onClick={() => void analyze(false)} disabled={file === null || isAnalyzing}>
            {isAnalyzing ? "解析中…" : "解析してプレビューへ"}
          </Button>
        </section>
      )}

      {step === 1 && analyzed !== null && (
        <section className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm text-muted">
              {analyzed.fileName}（{analyzed.format}）：{rows.length}行を検出
            </p>
            <div className="flex gap-2">
              <Button variant="secondary" onClick={() => setAllInclude(true)}>
                全て取込
              </Button>
              <Button variant="secondary" onClick={() => setAllInclude(false)}>
                全てスキップ
              </Button>
            </div>
          </div>

          {/* PC: 表形式 */}
          <div className="hidden overflow-x-auto rounded-lg border border-border md:block">
            <table className="w-full text-sm">
              <thead className="bg-surface text-left text-muted">
                <tr>
                  <th className="px-3 py-2">取込</th>
                  <th className="px-3 py-2">利用日</th>
                  <th className="px-3 py-2">支払月</th>
                  <th className="px-3 py-2">摘要</th>
                  <th className="px-3 py-2 text-right">金額</th>
                  <th className="px-3 py-2">カテゴリ</th>
                  <th className="px-3 py-2">備考</th>
                  <th className="px-3 py-2">判定</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.rowNo} className="border-t border-border">
                    <td className="px-3 py-2">
                      <input
                        type="checkbox"
                        aria-label={`${row.description} を取り込む`}
                        checked={row.include}
                        onChange={(event) => updateRow(row.rowNo, { include: event.target.checked })}
                      />
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap">{formatDateList(row.usedOn)}</td>
                    <td className="px-3 py-2">
                      <input
                        type="month"
                        aria-label={`${row.description} の支払月`}
                        value={row.billingMonth}
                        onChange={(event) => updateRow(row.rowNo, { billingMonth: event.target.value })}
                        className="w-32 rounded-md border border-border bg-background px-2 py-1 text-sm text-foreground"
                      />
                    </td>
                    <td className="px-3 py-2">
                      {row.description}
                      {row.duplicate !== null && (
                        <span className="ml-2 rounded-full bg-warning/20 px-2 py-0.5 text-xs text-foreground">
                          重複候補
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-right">{formatAmount(row.amount)}</td>
                    <td className="px-3 py-2">
                      <select
                        aria-label={`${row.description} のカテゴリ`}
                        value={row.categoryId}
                        onChange={(event) => updateRow(row.rowNo, { categoryId: event.target.value })}
                        className="rounded-md border border-border bg-background px-2 py-1 text-sm text-foreground"
                      >
                        {categories.map((category) => (
                          <option key={category.id} value={category.id}>
                            {category.name}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="px-3 py-2">
                      <input
                        type="text"
                        aria-label={`${row.description} の備考`}
                        maxLength={500}
                        value={row.memo}
                        onChange={(event) => updateRow(row.rowNo, { memo: event.target.value })}
                        className="w-32 rounded-md border border-border bg-background px-2 py-1 text-sm text-foreground"
                      />
                    </td>
                    <td className="px-3 py-2 text-xs text-muted">
                      {SOURCE_LABELS[row.categorySource]}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* スマホ: カード形式 */}
          <ul className="space-y-2 md:hidden">
            {rows.map((row) => (
              <li key={row.rowNo} className="rounded-lg border border-border bg-surface p-3">
                <div className="flex items-center justify-between gap-2">
                  <label className="flex items-center gap-2 text-sm text-foreground">
                    <input
                      type="checkbox"
                      checked={row.include}
                      onChange={(event) => updateRow(row.rowNo, { include: event.target.checked })}
                    />
                    {formatDateList(row.usedOn)}
                  </label>
                  <span className="text-sm font-medium">{formatAmount(row.amount)}</span>
                </div>
                <p className="mt-1 text-sm text-foreground">
                  {row.description}
                  {row.duplicate !== null && (
                    <span className="ml-2 rounded-full bg-warning/20 px-2 py-0.5 text-xs">
                      重複候補
                    </span>
                  )}
                </p>
                <div className="mt-2 flex items-center gap-2">
                  <select
                    value={row.categoryId}
                    onChange={(event) => updateRow(row.rowNo, { categoryId: event.target.value })}
                    className="flex-1 rounded-md border border-border bg-background px-2 py-1 text-sm text-foreground"
                  >
                    {categories.map((category) => (
                      <option key={category.id} value={category.id}>
                        {category.name}
                      </option>
                    ))}
                  </select>
                  <span className="text-xs text-muted">{SOURCE_LABELS[row.categorySource]}</span>
                </div>
                <div className="mt-2 flex items-center gap-2">
                  <label className="flex items-center gap-1 text-xs text-muted">
                    支払月
                    <input
                      type="month"
                      value={row.billingMonth}
                      onChange={(event) => updateRow(row.rowNo, { billingMonth: event.target.value })}
                      className="rounded-md border border-border bg-background px-2 py-1 text-sm text-foreground"
                    />
                  </label>
                </div>
                <div className="mt-2">
                  <input
                    type="text"
                    placeholder="備考（任意）"
                    maxLength={500}
                    value={row.memo}
                    onChange={(event) => updateRow(row.rowNo, { memo: event.target.value })}
                    className="w-full rounded-md border border-border bg-background px-2 py-1 text-sm text-foreground"
                  />
                </div>
              </li>
            ))}
          </ul>

          {analyzed.errorRows.length > 0 && (
            <div className="rounded-lg border border-border bg-surface p-3">
              <h2 className="text-sm font-medium text-foreground">
                取込対象外の行（{analyzed.errorRows.length}件・FR-CSV-07）
              </h2>
              <ul className="mt-1 space-y-1 text-xs text-muted">
                {analyzed.errorRows.map((errorRow) => (
                  <li key={errorRow.rowNo}>
                    {errorRow.rowNo}行目：{errorRow.message}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="flex gap-2">
            <Button variant="secondary" onClick={reset} disabled={isConfirming}>
              やり直す
            </Button>
            <Button onClick={() => void confirm()} disabled={isConfirming}>
              {isConfirming ? "取込中…" : `${includeCount}件を取り込む`}
            </Button>
          </div>
        </section>
      )}

      {step === 2 && result !== null && (
        <section className="space-y-4 rounded-lg border border-border bg-surface p-4">
          <h2 className="text-base font-semibold text-foreground">取込が完了しました</h2>
          <dl className="grid grid-cols-3 gap-3 text-center text-sm">
            {(
              [
                ["取込", result.importedCount],
                ["スキップ", result.skippedCount],
                ["エラー", result.errorCount],
              ] as const
            ).map(([label, count]) => (
              <div key={label} className="rounded-md border border-border p-3">
                <dt className="text-muted">{label}</dt>
                <dd className="text-lg font-semibold text-foreground">{count}件</dd>
              </div>
            ))}
          </dl>
          <div className="flex gap-2">
            <Link href="/entries">
              <Button variant="secondary">明細を見る</Button>
            </Link>
            <Button onClick={reset}>続けて取り込む</Button>
          </div>
        </section>
      )}
    </div>
  );
};
