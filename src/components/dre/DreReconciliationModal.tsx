"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, ExternalLink, Upload } from "lucide-react";
import { toast } from "sonner";
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
import { formatFinancialMoney } from "@/lib/pricing/financial-margin";
import type { DreEditableLineKey } from "@/lib/dre/dre-calculations";
import type { DreMonthView, DreYearView } from "@/lib/dre/dre-year-data";
import type { DreReconciliationReview } from "@/lib/dre/reconciliation/types";
import { readApiError } from "@/lib/api/api-client-error";
import { cn } from "@/lib/utils";

const ML_BILLING_URL =
  "https://vendedores.mercadolivre.com.br/billing/resume#from=seller-menu";

type DreReconciliationModalProps = {
  open: boolean;
  year: number;
  months: DreMonthView[];
  defaultMonth: number;
  /**
   * Import salvo pelo fluxo antigo a revisar: pula o upload e compara a
   * planilha guardada com o DRE atual.
   */
  reviewImportId?: string | null;
  onClose: () => void;
  /** Conciliou ou descartou — devolve o ano recarregado e o mês afetado. */
  onChanged: (yearView: DreYearView, month: number) => void;
  onError: (message: string | null) => void;
};

/**
 * Conciliação em um passo: prévia (diferença linha a linha entre a planilha
 * Por Vendas e o DRE) → "Conciliar mês" grava e marca o mês como conciliado.
 * Não há estado intermediário "aplicado e não salvo".
 */
export function DreReconciliationModal({
  open,
  year,
  months,
  defaultMonth,
  reviewImportId = null,
  onClose,
  onChanged,
  onError,
}: DreReconciliationModalProps) {
  const [month, setMonth] = useState(defaultMonth);
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [review, setReview] = useState<DreReconciliationReview | null>(null);
  const [selectedKeys, setSelectedKeys] = useState<Set<DreEditableLineKey>>(
    new Set(),
  );
  const [showMatched, setShowMatched] = useState(false);
  /** Prévia nova ainda não confirmada — apagada se o modal fechar sem conciliar. */
  const draftImportIdRef = useRef<string | null>(null);

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

  function applyReview(next: DreReconciliationReview) {
    setReview(next);
    setSelectedKeys(new Set(next.diff.map((row) => row.lineKey)));
    setShowMatched(false);
  }

  useEffect(() => {
    if (!open) return;
    const allowed = months
      .filter((item) => !item.isFutureMonth)
      .map((item) => item.month);
    setMonth(
      allowed.includes(defaultMonth) ? defaultMonth : (allowed[0] ?? defaultMonth),
    );
    setFile(null);
    setReview(null);
    setSelectedKeys(new Set());
    setBusy(false);
    draftImportIdRef.current = null;

    if (!reviewImportId) return;
    let cancelled = false;
    setBusy(true);
    void (async () => {
      try {
        const res = await fetch(`/api/dre/reconciliation/${reviewImportId}`);
        if (!res.ok) {
          onError(await readApiError(res, "dre_reconciliation_review_failed"));
          return;
        }
        const json = (await res.json()) as DreReconciliationReview;
        if (!cancelled) applyReview(json);
      } catch {
        onError("Falha de rede ao carregar a conciliação salva.");
      } finally {
        if (!cancelled) setBusy(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // `months`/`onError` mudam de identidade a cada render do pai; a revisão
    // só precisa recarregar quando o modal abre ou o import muda.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, defaultMonth, reviewImportId]);

  const selectedCount = selectedKeys.size;
  const reconciledLineCount = (review?.matched.length ?? 0) + selectedCount;
  const allSelected = useMemo(() => {
    if (!review) return false;
    return review.diff.every((row) => selectedKeys.has(row.lineKey));
  }, [review, selectedKeys]);

  function discardDraftSilently() {
    const draftId = draftImportIdRef.current;
    draftImportIdRef.current = null;
    if (!draftId) return;
    // Rascunho não mexeu no DRE: apagar é só limpeza (evita "pendência"
    // fantasma). Falha aqui não importa — a próxima prévia do mês apaga.
    void fetch(`/api/dre/reconciliation/${draftId}`, { method: "DELETE" }).catch(
      () => undefined,
    );
  }

  function close() {
    if (busy) return;
    discardDraftSilently();
    onClose();
  }

  async function handlePreview() {
    if (!file) return;
    setBusy(true);
    onError(null);
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
      const json = (await res.json()) as DreReconciliationReview;
      draftImportIdRef.current = json.importId;
      applyReview(json);
    } catch {
      onError("Falha de rede ao ler a planilha.");
    } finally {
      setBusy(false);
    }
  }

  async function handleConfirm() {
    if (!review) return;
    setBusy(true);
    onError(null);
    try {
      const res = await fetch(
        `/api/dre/reconciliation/${review.importId}/confirm`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ acceptedLineKeys: [...selectedKeys] }),
        },
      );
      if (!res.ok) {
        onError(await readApiError(res, "dre_reconciliation_confirm_failed"));
        return;
      }
      const json = (await res.json()) as { year?: DreYearView };
      if (json.year) {
        draftImportIdRef.current = null;
        onChanged(json.year, review.month);
        toast.success(`${monthLabel} conciliado.`);
        onClose();
      }
    } catch {
      onError("Falha de rede ao conciliar o mês.");
    } finally {
      setBusy(false);
    }
  }

  async function handleDiscardLegacy() {
    if (!review) return;
    setBusy(true);
    onError(null);
    try {
      const res = await fetch(`/api/dre/reconciliation/${review.importId}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        onError(await readApiError(res, "dre_reconciliation_discard_failed"));
        return;
      }
      const json = (await res.json()) as { year?: DreYearView };
      if (json.year) {
        onChanged(json.year, review.month);
        toast.success("Conciliação descartada.");
        onClose();
      }
    } catch {
      onError("Falha de rede ao descartar a conciliação.");
    } finally {
      setBusy(false);
    }
  }

  const legacy = Boolean(review?.legacy);

  return (
    <Sheet
      open={open}
      onOpenChange={(next) => {
        if (!next) close();
      }}
    >
      <SheetContent className="sm:max-w-lg">
        <SheetHeader>
          <SheetTitle>
            {legacy ? "Revisar conciliação" : "Conciliação ML"} — {monthLabel}
          </SheetTitle>
          <SheetDescription>
            A API de faturamento do Mercado Livre pode oscilar. A planilha
            oficial Por Vendas é a fonte da verdade das tarifas do mês: ao
            conciliar, essas linhas ficam com o valor da planilha e continuam
            assim nas próximas sincronizações.
          </SheetDescription>
        </SheetHeader>
        <SheetBody className="space-y-4 text-sm">
          <FormSelect
            label="Mês da planilha"
            value={String(month)}
            onValueChange={(value) => {
              setMonth(Number(value));
              discardDraftSilently();
              setReview(null);
              setSelectedKeys(new Set());
            }}
            options={monthOptions}
            disabled={busy || Boolean(review) || Boolean(reviewImportId)}
          />

          {!review ? (
            reviewImportId ? (
              <p className="text-xs text-[var(--muted-foreground)]">
                {busy ? "Carregando conciliação salva…" : null}
              </p>
            ) : (
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
                    <a href={ML_BILLING_URL} target="_blank" rel="noreferrer">
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
            )
          ) : (
            <div className="space-y-3">
              {legacy ? (
                <p className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                  {review.status === "confirmed"
                    ? "Esta conciliação foi salva antes da correção do sync e pode ter sido sobrescrita depois. Confira a diferença com o DRE atual e concilie de novo para protegê-la."
                    : "Esta conciliação foi aplicada e nunca salva. Confira a diferença com o DRE atual e concilie ou descarte."}
                </p>
              ) : null}
              <p className="text-xs text-[var(--muted-foreground)]">
                {review.fileName} · {review.sheetName} · {review.rowCount} linhas
              </p>
              {review.unrecognizedFees.length > 0 ? (
                <div className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                  Tarifas não reconhecidas foram somadas em Tarifas especiais.
                  Total:{" "}
                  {formatFinancialMoney(
                    review.unrecognizedFees.reduce(
                      (sum, fee) => sum + fee.total,
                      0,
                    ),
                  )}
                </div>
              ) : null}
              {review.warnings.map((warning) => (
                <p key={warning.code} className="text-xs text-amber-800">
                  {warning.message}
                </p>
              ))}

              {review.diff.length > 0 ? (
                <>
                  <div className="flex items-center justify-between gap-2 text-xs">
                    <p className="font-medium text-[var(--foreground)]">
                      Diferenças ({review.diff.length})
                    </p>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        className="cursor-pointer underline"
                        onClick={() =>
                          setSelectedKeys(
                            new Set(review.diff.map((row) => row.lineKey)),
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
                  </div>
                  <ul className="divide-y divide-[var(--border)] rounded-lg border border-[var(--border)]">
                    {review.diff.map((row) => (
                      <li key={row.lineKey}>
                        <label className="flex cursor-pointer items-start gap-2 px-3 py-2">
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
                          <span className="min-w-0 flex-1">
                            <span className="block font-medium">{row.label}</span>
                            <span className="block text-xs text-[var(--muted-foreground)]">
                              {formatFinancialMoney(row.currentAmount)} →{" "}
                              {formatFinancialMoney(row.proposedAmount)}{" "}
                              <span
                                className={
                                  row.delta >= 0
                                    ? "text-emerald-700"
                                    : "text-red-700"
                                }
                              >
                                ({row.delta >= 0 ? "+" : ""}
                                {formatFinancialMoney(row.delta)})
                              </span>
                            </span>
                          </span>
                        </label>
                      </li>
                    ))}
                  </ul>
                  <p className="text-xs text-[var(--muted-foreground)]">
                    Linha desmarcada fica com o valor atual e fora da
                    conciliação.
                  </p>
                </>
              ) : (
                <p className="rounded-lg border border-[var(--border)] px-3 py-3 text-xs text-[var(--muted-foreground)]">
                  Nenhuma diferença: a planilha confere com o DRE atual.
                </p>
              )}

              {review.matched.length > 0 ? (
                <div className="rounded-lg border border-[var(--border)]">
                  <button
                    type="button"
                    className="flex w-full cursor-pointer items-center justify-between gap-2 px-3 py-2 text-xs text-[var(--muted-foreground)]"
                    aria-expanded={showMatched}
                    onClick={() => setShowMatched((value) => !value)}
                  >
                    <span>
                      {review.matched.length === 1
                        ? "1 linha já confere com a planilha"
                        : `${review.matched.length} linhas já conferem com a planilha`}
                    </span>
                    <ChevronDown
                      className={cn(
                        "size-3.5 transition-transform",
                        showMatched && "rotate-180",
                      )}
                      aria-hidden
                    />
                  </button>
                  {showMatched ? (
                    <ul className="divide-y divide-[var(--border)] border-t border-[var(--border)]">
                      {review.matched.map((row) => (
                        <li
                          key={row.lineKey}
                          className="flex items-center justify-between gap-2 px-3 py-1.5 text-xs"
                        >
                          <span>{row.label}</span>
                          <span className="tabular-nums text-[var(--muted-foreground)]">
                            {formatFinancialMoney(row.amount)}
                          </span>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </div>
              ) : null}
            </div>
          )}
        </SheetBody>
        <SheetFooter>
          <Button type="button" variant="outline" disabled={busy} onClick={close}>
            Cancelar
          </Button>
          {review && legacy ? (
            <Button
              type="button"
              variant="outline"
              disabled={busy}
              onClick={() => void handleDiscardLegacy()}
            >
              {review.status === "confirmed"
                ? "Não considerar conciliado"
                : "Descartar"}
            </Button>
          ) : null}
          {!review ? (
            reviewImportId ? null : (
              <Button
                type="button"
                disabled={!file || busy}
                onClick={() => void handlePreview()}
              >
                {busy ? "Lendo…" : "Ler planilha"}
              </Button>
            )
          ) : (
            <Button
              type="button"
              disabled={busy || reconciledLineCount === 0}
              onClick={() => void handleConfirm()}
            >
              {busy
                ? "Conciliando…"
                : allSelected
                  ? "Conciliar mês"
                  : `Conciliar ${reconciledLineCount} linha(s)`}
            </Button>
          )}
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
