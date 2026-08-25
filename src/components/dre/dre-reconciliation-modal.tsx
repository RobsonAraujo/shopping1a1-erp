"use client";

import { useEffect, useMemo, useState } from "react";
import { ExternalLink, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FormSelect } from "@/components/ui/form-select";
import {
  Sheet,
  SheetBody,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { formatFinancialMoney } from "@/lib/financial-margin";
import type { DreEditableLineKey } from "@/lib/dre/dre-calculations";
import type { DreMonthView, DreYearView } from "@/lib/dre/dre-year-data";
import type {
  DreReconciliationLineDiff,
  ReconciliationParseWarning,
  UnrecognizedFeeSummary,
} from "@/lib/dre/reconciliation/types";
import { formatApiErrorMessage, readApiError } from "@/lib/api-client-error";

const ML_BILLING_URL =
  "https://vendedores.mercadolivre.com.br/billing/resume#from=seller-menu";

type PreviewResponse = {
  importId: string;
  sheetName: string;
  rowCount: number;
  diff: DreReconciliationLineDiff[];
  unrecognizedFees: UnrecognizedFeeSummary[];
  warnings: ReconciliationParseWarning[];
};

type DreReconciliationModalProps = {
  open: boolean;
  year: number;
  months: DreMonthView[];
  defaultMonth: number;
  onClose: () => void;
  onApplied: (
    yearView: DreYearView,
    acceptedLineKeys: DreEditableLineKey[],
    month: number,
  ) => void;
  onError: (message: string) => void;
};

export function DreReconciliationModal({
  open,
  year,
  months,
  defaultMonth,
  onClose,
  onApplied,
  onError,
}: DreReconciliationModalProps) {
  const [month, setMonth] = useState(defaultMonth);
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<PreviewResponse | null>(null);
  const [selectedKeys, setSelectedKeys] = useState<Set<DreEditableLineKey>>(
    new Set(),
  );

  const monthOptions = useMemo(
    () =>
      months
        .filter((item) => !item.isFutureMonth)
        .map((item) => ({
          value: String(item.month),
          label: item.label,
        })),
    [months],
  );

  const monthLabel =
    months.find((item) => item.month === month)?.label ?? `mês ${month}`;

  useEffect(() => {
    if (!open) return;
    const allowed = months
      .filter((item) => !item.isFutureMonth)
      .map((item) => item.month);
    setMonth(
      allowed.includes(defaultMonth) ? defaultMonth : (allowed[0] ?? defaultMonth),
    );
    setFile(null);
    setPreview(null);
    setSelectedKeys(new Set());
    setBusy(false);
  }, [open, defaultMonth, months]);

  const selectedCount = selectedKeys.size;
  const allSelected = useMemo(() => {
    if (!preview) return false;
    return preview.diff.every((row) => selectedKeys.has(row.lineKey));
  }, [preview, selectedKeys]);

  function reset() {
    setFile(null);
    setPreview(null);
    setSelectedKeys(new Set());
    setBusy(false);
  }

  async function handlePreview() {
    if (!file) return;
    setBusy(true);
    try {
      const form = new FormData();
      form.set("file", file);
      form.set("year", String(year));
      form.set("month", String(month));
      const res = await fetch("/api/dre/reconciliation/preview", {
        method: "POST",
        body: form,
      });
      if (!res.ok) {
        onError(await readApiError(res, "dre_reconciliation_preview_failed"));
        return;
      }
      const json = (await res.json()) as PreviewResponse;
      setPreview(json);
      setSelectedKeys(new Set(json.diff.map((row) => row.lineKey)));
    } catch {
      onError("Falha de rede ao ler a planilha.");
    } finally {
      setBusy(false);
    }
  }

  async function handleApply() {
    if (!preview) return;
    setBusy(true);
    try {
      const res = await fetch(
        `/api/dre/reconciliation/${preview.importId}/apply`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            acceptedLineKeys: [...selectedKeys],
          }),
        },
      );
      if (!res.ok) {
        onError(await readApiError(res, "dre_reconciliation_apply_failed"));
        return;
      }
      const json = (await res.json()) as { year?: DreYearView };
      if (json.year) {
        onApplied(json.year, [...selectedKeys], month);
        reset();
        onClose();
      }
    } catch {
      onError("Falha de rede ao aplicar a conciliação.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet
      open={open}
      onOpenChange={(next) => {
        if (!next && !busy) {
          reset();
          onClose();
        }
      }}
    >
      <SheetContent className="sm:max-w-lg">
        <SheetHeader>
          <SheetTitle>Conciliação ML — {monthLabel}</SheetTitle>
          <SheetDescription>
            Os valores da API do Mercado Livre podem oscilar. Use o relatório
            oficial de conciliação por vendas para corrigir o mês.
          </SheetDescription>
        </SheetHeader>
        <SheetBody className="space-y-4 text-sm">
          <FormSelect
            label="Mês da planilha"
            value={String(month)}
            onValueChange={(value) => {
              setMonth(Number(value));
              setPreview(null);
              setSelectedKeys(new Set());
            }}
            options={monthOptions}
            disabled={busy || Boolean(preview)}
          />

          {!preview ? (
            <div className="space-y-3 rounded-xl border border-[var(--border)] p-3">
              <div className="space-y-2 text-xs leading-relaxed text-[var(--muted-foreground)]">
                <p className="font-medium text-[var(--foreground)]">
                  Onde baixar a planilha
                </p>
                <p>
                  Mercado Livre → Faturamento → Tarifas e Pagamentos →
                  Conciliação →{" "}
                  <span className="font-semibold text-[var(--foreground)]">
                    Por Vendas
                  </span>
                </p>
                <p>
                  Ao gerar o relatório, escolha o tipo{" "}
                  <span className="font-semibold text-[var(--foreground)]">
                    Por Vendas
                  </span>
                  , no mesmo mês selecionado acima.
                </p>
                <Button asChild variant="outline" size="sm" className="w-full">
                  <a
                    href={ML_BILLING_URL}
                    target="_blank"
                    rel="noreferrer"
                  >
                    <ExternalLink className="size-3.5" aria-hidden />
                    Abrir faturamento no Mercado Livre
                  </a>
                </Button>
              </div>
              <label className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-[var(--border)] bg-[var(--muted)]/20 px-4 py-6 text-center">
                <Upload className="size-5 text-[var(--muted-foreground)]" />
                <span className="text-sm font-medium">
                  {file ? file.name : "Solte o .xlsx ou clique para escolher"}
                </span>
                <input
                  type="file"
                  accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                  className="hidden"
                  onChange={(event) => {
                    const next = event.target.files?.[0] ?? null;
                    setFile(next);
                  }}
                />
              </label>
            </div>
          ) : (
            <div className="space-y-3">
              <p className="text-xs text-[var(--muted-foreground)]">
                {preview.sheetName} · {preview.rowCount} linhas
              </p>
              {preview.unrecognizedFees.length > 0 ? (
                <div className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                  Tarifas não reconhecidas foram somadas em Tarifas especiais.
                  Total:{" "}
                  {formatFinancialMoney(
                    preview.unrecognizedFees.reduce(
                      (sum, fee) => sum + fee.total,
                      0,
                    ),
                  )}
                </div>
              ) : null}
              {preview.warnings.map((warning) => (
                <p key={warning.code} className="text-xs text-amber-800">
                  {warning.message}
                </p>
              ))}
              <div className="flex gap-2 text-xs">
                <button
                  type="button"
                  className="cursor-pointer underline"
                  onClick={() =>
                    setSelectedKeys(
                      new Set(preview.diff.map((row) => row.lineKey)),
                    )
                  }
                >
                  Selecionar tudo
                </button>
                <button
                  type="button"
                  className="cursor-pointer underline"
                  onClick={() => setSelectedKeys(new Set())}
                >
                  Nenhuma
                </button>
              </div>
              <ul className="divide-y divide-[var(--border)] rounded-lg border border-[var(--border)]">
                {preview.diff.length === 0 ? (
                  <li className="px-3 py-4 text-xs text-[var(--muted-foreground)]">
                    Nenhum valor do DRE mudaria com esta planilha.
                  </li>
                ) : (
                  preview.diff.map((row) => (
                    <li
                      key={row.lineKey}
                      className="flex items-start gap-2 px-3 py-2"
                    >
                      <input
                        type="checkbox"
                        className="mt-1"
                        checked={selectedKeys.has(row.lineKey)}
                        onChange={() => {
                          setSelectedKeys((prev) => {
                            const next = new Set(prev);
                            if (next.has(row.lineKey)) next.delete(row.lineKey);
                            else next.add(row.lineKey);
                            return next;
                          });
                        }}
                      />
                      <div className="min-w-0 flex-1">
                        <p className="font-medium">{row.label}</p>
                        <p className="text-xs text-[var(--muted-foreground)]">
                          {formatFinancialMoney(row.currentAmount)} →{" "}
                          {formatFinancialMoney(row.proposedAmount)}{" "}
                          <span
                            className={
                              row.delta >= 0 ? "text-emerald-700" : "text-red-700"
                            }
                          >
                            ({row.delta >= 0 ? "+" : ""}
                            {formatFinancialMoney(row.delta)})
                          </span>
                        </p>
                      </div>
                    </li>
                  ))
                )}
              </ul>
            </div>
          )}
        </SheetBody>
        <SheetFooter>
          <Button
            type="button"
            variant="outline"
            disabled={busy}
            onClick={() => {
              reset();
              onClose();
            }}
          >
            Cancelar
          </Button>
          {!preview ? (
            <Button type="button" disabled={!file || busy} onClick={() => void handlePreview()}>
              {busy ? "Lendo…" : "Ler planilha"}
            </Button>
          ) : (
            <Button
              type="button"
              disabled={busy || (preview.diff.length > 0 && selectedCount === 0)}
              onClick={() => void handleApply()}
            >
              {busy
                ? "Aplicando…"
                : allSelected
                  ? "Aplicar na tabela"
                  : `Aplicar ${selectedCount} linhas`}
            </Button>
          )}
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

void formatApiErrorMessage;
