"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Download, Info, Plus, RefreshCw, X } from "lucide-react";
import { DreCostItemsModal } from "@/components/dre/dre-fixed-costs-modal";
import { DreSyncOverlay } from "@/components/dre/dre-sync-overlay";
import { DreYearTable } from "@/components/dre/dre-year-table";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { FormSelect } from "@/components/ui/form-select";
import { TooltipProvider } from "@/components/ui/tooltip";
import { consumeSSEStream } from "@/hooks/use-sse-stream";
import { readApiError } from "@/lib/api-client-error";
import {
  formatFinancialMoney,
  formatFinancialPercent,
} from "@/lib/financial-margin";
import type { DreEditableLineKey } from "@/lib/dre/dre-calculations";
import { downloadDreYearCsv } from "@/lib/dre/dre-export-csv";
import {
  dreEditableLineLabel,
  dreMonthShortLabel,
} from "@/lib/dre/dre-table-rows";
import type { DreYearView } from "@/lib/dre/dre-year-data";
import type { DreSyncProgressPhase } from "@/lib/dre/dre-month-data";
import {
  getZonedYearMonth,
  isDreMonthSyncable,
} from "@/lib/mercadolibre/revenue-periods";
import { cn } from "@/lib/utils";

const SYNC_ALL_CONCURRENCY = 2;

type DreSyncSseEvent =
  | {
      type: "progress";
      phase: DreSyncProgressPhase;
      message: string;
    }
  | {
      type: "complete";
      syncedAt: string;
      year: number;
      yearView: DreYearView;
    }
  | { type: "error"; message: string };

type SyncConfirmState =
  | { mode: "month"; month: number }
  | { mode: "all" }
  | null;

type SyncAdjustmentItem = {
  id: string;
  month: number;
  monthLabel: string;
  lineKey: DreEditableLineKey;
  lineLabel: string;
  amount: number;
};

function collectSyncAdjustments(
  data: DreYearView,
  scope: SyncConfirmState,
): SyncAdjustmentItem[] {
  if (!scope) return [];
  const months =
    scope.mode === "month"
      ? data.months.filter((m) => m.month === scope.month)
      : data.months.filter((m) => isDreMonthSyncable(data.year, m.month));

  const items: SyncAdjustmentItem[] = [];
  for (const month of months) {
    for (const lineKey of month.manuallyEditedLineKeys) {
      const amount =
        lineKey === "adsCost"
          ? -Math.max(0, month.adsCost ?? 0)
          : (month.lines?.[lineKey] ?? 0);
      items.push({
        id: `${month.month}:${lineKey}`,
        month: month.month,
        monthLabel: month.label,
        lineKey,
        lineLabel: dreEditableLineLabel(lineKey),
        amount,
      });
    }
  }
  return items;
}

export function DreClient() {
  const currentYear = useMemo(() => getZonedYearMonth().year, []);
  const [year, setYear] = useState(currentYear);
  const [data, setData] = useState<DreYearView | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showDetails, setShowDetails] = useState(true);
  const [selectedMonth, setSelectedMonth] = useState<number | null>(null);
  const [fixedCostsModalOpen, setFixedCostsModalOpen] = useState(false);
  const [operationalCostsModalOpen, setOperationalCostsModalOpen] =
    useState(false);
  const [investmentCostsModalOpen, setInvestmentCostsModalOpen] =
    useState(false);
  const [syncingMonths, setSyncingMonths] = useState<Set<number>>(new Set());
  const [syncingMonthMessages, setSyncingMonthMessages] = useState<
    Record<number, string>
  >({});
  const [syncingAll, setSyncingAll] = useState(false);
  const [syncConfirm, setSyncConfirm] = useState<SyncConfirmState>(null);
  const [preserveAdjustmentIds, setPreserveAdjustmentIds] = useState<
    Set<string>
  >(new Set());
  /** Marca visual "ajustado" + restore — só na sessão atual (some no reload). */
  const [sessionAdjustedByMonth, setSessionAdjustedByMonth] = useState<
    Record<number, DreEditableLineKey[]>
  >({});

  const yearOptions = useMemo(
    () =>
      [currentYear - 1, currentYear, currentYear + 1].map((y) => ({
        value: String(y),
        label: String(y),
      })),
    [currentYear],
  );

  const viewData = useMemo((): DreYearView | null => {
    if (!data) return null;
    return {
      ...data,
      months: data.months.map((month) => ({
        ...month,
        manuallyEditedLineKeys: sessionAdjustedByMonth[month.month] ?? [],
      })),
    };
  }, [data, sessionAdjustedByMonth]);

  const syncAdjustments = useMemo(
    () =>
      data && syncConfirm ? collectSyncAdjustments(data, syncConfirm) : [],
    [data, syncConfirm],
  );

  useEffect(() => {
    if (!syncConfirm) {
      setPreserveAdjustmentIds(new Set());
      return;
    }
    if (!data) return;
    const items = collectSyncAdjustments(data, syncConfirm);
    setPreserveAdjustmentIds(new Set(items.map((item) => item.id)));
  }, [syncConfirm, data]);

  const loadYear = useCallback(async (targetYear: number) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/dre?year=${targetYear}`);
      if (!res.ok) {
        setError(await readApiError(res, "dre_load_failed"));
        return;
      }
      setData((await res.json()) as DreYearView);
    } catch {
      setError("Falha de rede ao carregar o DRE. Verifique sua conexão.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadYear(year);
  }, [year, loadYear]);

  useEffect(() => {
    setSelectedMonth(null);
    setSessionAdjustedByMonth({});
  }, [year]);

  const updateSessionAdjustedAfterEdit = useCallback(
    (
      month: number,
      lineKey: DreEditableLineKey,
      yearView: DreYearView,
    ) => {
      const serverKeys =
        yearView.months.find((m) => m.month === month)
          ?.manuallyEditedLineKeys ?? [];
      setSessionAdjustedByMonth((prev) => {
        const nextKeys = new Set(prev[month] ?? []);
        if (serverKeys.includes(lineKey)) nextKeys.add(lineKey);
        else nextKeys.delete(lineKey);
        return { ...prev, [month]: [...nextKeys] };
      });
    },
    [],
  );

  const syncMonth = useCallback(
    async (
      month: number,
      preserveLineKeys: DreEditableLineKey[] = [],
    ): Promise<boolean> => {
      if (!isDreMonthSyncable(year, month)) {
        return true;
      }

      setSyncingMonths((prev) => new Set(prev).add(month));
      setSyncingMonthMessages((prev) => ({
        ...prev,
        [month]: "Iniciando sincronização…",
      }));
      try {
        const res = await fetch("/api/dre/sync?stream=1", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ year, month, preserveLineKeys }),
        });
        if (!res.ok) {
          setError(await readApiError(res, "dre_sync_failed"));
          return false;
        }

        let completed = false;
        await consumeSSEStream<DreSyncSseEvent>(res, (event) => {
          if (event.type === "progress") {
            setSyncingMonthMessages((prev) => ({
              ...prev,
              [month]: event.message,
            }));
            return;
          }
          if (event.type === "error") {
            setError(event.message || "dre_sync_failed");
            return;
          }
          if (event.type === "complete") {
            completed = true;
            setData((prev) => {
              if (!prev || prev.year !== event.yearView.year) {
                return event.yearView;
              }
              // Sync-all (concorrência 2): um yearView antigo não pode
              // sobrescrever mês já atualizado por outra sync em paralelo.
              const prevByMonth = new Map(
                prev.months.map((row) => [row.month, row]),
              );
              const months = event.yearView.months.map((row) => {
                const existing = prevByMonth.get(row.month);
                if (!existing) return row;
                const existingTs = existing.syncedAt
                  ? Date.parse(existing.syncedAt)
                  : 0;
                const nextTs = row.syncedAt ? Date.parse(row.syncedAt) : 0;
                return nextTs >= existingTs ? row : existing;
              });
              return { ...event.yearView, months };
            });
            setSessionAdjustedByMonth((prev) => {
              if (preserveLineKeys.length === 0) {
                if (!(month in prev)) return prev;
                const next = { ...prev };
                delete next[month];
                return next;
              }
              return { ...prev, [month]: [...preserveLineKeys] };
            });
          }
        });

        if (!completed) {
          setError("Sincronização interrompida antes de concluir.");
          return false;
        }
        return true;
      } catch {
        setError("Falha de rede ao sincronizar. Verifique sua conexão.");
        return false;
      } finally {
        setSyncingMonths((prev) => {
          const next = new Set(prev);
          next.delete(month);
          return next;
        });
        setSyncingMonthMessages((prev) => {
          if (!(month in prev)) return prev;
          const next = { ...prev };
          delete next[month];
          return next;
        });
      }
    },
    [year],
  );

  const monthHasSnapshot = useCallback(
    (month: number) => {
      const row = data?.months.find((m) => m.month === month);
      return Boolean(row?.syncedAt || row?.lines);
    },
    [data],
  );

  const requestSyncMonth = useCallback(
    (month: number) => {
      if (!isDreMonthSyncable(year, month)) return;
      if (monthHasSnapshot(month)) {
        setSyncConfirm({ mode: "month", month });
        return;
      }
      void syncMonth(month);
    },
    [year, monthHasSnapshot, syncMonth],
  );

  const syncAllMonths = useCallback(
    async (
      preserveByMonth: Map<number, DreEditableLineKey[]> = new Map(),
    ) => {
      setSyncingAll(true);
      setError(null);
      const failures: number[] = [];
      const months: number[] = [];
      for (let month = 1; month <= 12; month += 1) {
        if (!isDreMonthSyncable(year, month)) continue;
        months.push(month);
      }

      try {
        let cursor = 0;
        async function worker() {
          while (cursor < months.length) {
            const month = months[cursor];
            cursor += 1;
            const ok = await syncMonth(
              month,
              preserveByMonth.get(month) ?? [],
            );
            if (!ok) failures.push(month);
          }
        }

        const workers = Array.from(
          {
            length: Math.min(SYNC_ALL_CONCURRENCY, Math.max(months.length, 1)),
          },
          () => worker(),
        );
        await Promise.all(workers);

        if (failures.length > 0) {
          setError(
            `Falha ao sincronizar ${failures.length} mês(es), começando por ${failures[0]}. Corrija o erro e tente novamente.`,
          );
        } else {
          // Garante yearTotals consistentes após merges concorrentes.
          await loadYear(year);
        }
      } finally {
        setSyncingAll(false);
      }
    },
    [syncMonth, year, loadYear],
  );

  const requestSyncAll = useCallback(() => {
    const anyExisting = Boolean(
      data?.months.some(
        (m) =>
          isDreMonthSyncable(year, m.month) &&
          Boolean(m.syncedAt || m.lines),
      ),
    );
    if (anyExisting) {
      setSyncConfirm({ mode: "all" });
      return;
    }
    void syncAllMonths();
  }, [data, year, syncAllMonths]);

  const buildPreserveByMonth = useCallback(() => {
    const map = new Map<number, DreEditableLineKey[]>();
    for (const item of syncAdjustments) {
      if (!preserveAdjustmentIds.has(item.id)) continue;
      const list = map.get(item.month) ?? [];
      list.push(item.lineKey);
      map.set(item.month, list);
    }
    return map;
  }, [syncAdjustments, preserveAdjustmentIds]);

  const confirmSyncOverwrite = useCallback(
    (preserveSelected: boolean) => {
      const pending = syncConfirm;
      setSyncConfirm(null);
      if (!pending) return;

      if (pending.mode === "month") {
        const keys = preserveSelected
          ? (buildPreserveByMonth().get(pending.month) ?? [])
          : [];
        void syncMonth(pending.month, keys);
        return;
      }

      void syncAllMonths(preserveSelected ? buildPreserveByMonth() : new Map());
    },
    [syncConfirm, syncMonth, syncAllMonths, buildPreserveByMonth],
  );

  const togglePreserveAdjustment = useCallback((id: string) => {
    setPreserveAdjustmentIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const handleManualCostChange = useCallback(
    async (costItemId: string, month: number, amount: number | null) => {
      setError(null);
      try {
        const res = await fetch("/api/dre/cost-values", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ costItemId, year, month, amount }),
        });
        if (!res.ok) {
          setError(await readApiError(res, "dre_cost_value_failed"));
          return;
        }
        const json = (await res.json()) as { year?: DreYearView };
        if (json.year) {
          setData(json.year);
        }
      } catch {
        setError("Falha de rede ao salvar o valor.");
      }
    },
    [year],
  );

  const handleLineChange = useCallback(
    async (lineKey: DreEditableLineKey, month: number, amount: number) => {
      setError(null);
      try {
        const res = await fetch("/api/dre/lines", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ year, month, lineKey, amount }),
        });
        if (!res.ok) {
          setError(await readApiError(res, "dre_line_patch_failed"));
          return;
        }
        const json = (await res.json()) as { year?: DreYearView };
        if (json.year) {
          setData(json.year);
          updateSessionAdjustedAfterEdit(month, lineKey, json.year);
        }
      } catch {
        setError("Falha de rede ao salvar o valor.");
      }
    },
    [year, updateSessionAdjustedAfterEdit],
  );

  const handleLineRestore = useCallback(
    async (lineKey: DreEditableLineKey, month: number) => {
      setError(null);
      try {
        const res = await fetch("/api/dre/lines", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            year,
            month,
            lineKey,
            action: "restore",
          }),
        });
        if (!res.ok) {
          setError(await readApiError(res, "dre_line_patch_failed"));
          return;
        }
        const json = (await res.json()) as { year?: DreYearView };
        if (json.year) {
          setData(json.year);
          setSessionAdjustedByMonth((prev) => ({
            ...prev,
            [month]: (prev[month] ?? []).filter((key) => key !== lineKey),
          }));
        }
      } catch {
        setError("Falha de rede ao restaurar o valor.");
      }
    },
    [year],
  );

  const syncedCount = data?.months.filter((m) => m.syncedAt).length ?? 0;
  const syncConfirmMonthLabel =
    syncConfirm?.mode === "month"
      ? (data?.months.find((m) => m.month === syncConfirm.month)?.label ??
        `mês ${syncConfirm.month}`)
      : null;

  const focusMonthView =
    selectedMonth !== null
      ? (data?.months.find((m) => m.month === selectedMonth) ?? null)
      : null;
  const focusTotals = focusMonthView
    ? focusMonthView.totals
    : (data?.yearTotals ?? null);
  const monthFocused = selectedMonth !== null && focusMonthView !== null;
  const focusCardClass = monthFocused
    ? "origin-center scale-[1.04] shadow-[0_8px_24px_-4px_rgba(27,45,111,0.28),0_4px_10px_-2px_rgba(27,45,111,0.12)] transition-[transform,box-shadow] duration-[1800ms] ease-linear"
    : "origin-center scale-100 shadow-sm transition-[transform,box-shadow] duration-[1800ms] ease-linear";

  return (
    <TooltipProvider delayDuration={200}>
      {syncingMonths.size > 0 ? (
        <DreSyncOverlay
          year={year}
          syncingAll={syncingAll}
          items={[...syncingMonths]
            .sort((a, b) => a - b)
            .map((month) => ({
              month,
              message: syncingMonthMessages[month] ?? "Sincronizando…",
            }))}
        />
      ) : null}
      <div className="space-y-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap items-end gap-2">
            <FormSelect
              id="dre-year"
              label="Ano"
              value={String(year)}
              onValueChange={(value) => setYear(Number(value))}
              options={yearOptions}
              triggerClassName="h-9 w-[6.5rem] text-xs"
            />
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="mr-1 hidden text-[11px] font-medium uppercase tracking-wide text-[var(--muted-foreground)] sm:inline">
              Cadastrar
            </span>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              className="h-8 gap-1 text-xs font-medium"
              onClick={() => setOperationalCostsModalOpen(true)}
              title="Cadastrar itens de custo operacional (depois informe o valor por mês na tabela)"
            >
              <Plus className="size-3.5" aria-hidden />
              Custos operacionais
            </Button>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              className="h-8 gap-1 text-xs font-medium"
              onClick={() => setFixedCostsModalOpen(true)}
              title="Cadastrar itens de custo fixo (depois informe o valor por mês na tabela)"
            >
              <Plus className="size-3.5" aria-hidden />
              Custos fixos
            </Button>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              className="h-8 gap-1 text-xs font-medium"
              onClick={() => setInvestmentCostsModalOpen(true)}
              title="Cadastrar itens de investimento (depois informe o valor por mês na tabela)"
            >
              <Plus className="size-3.5" aria-hidden />
              Investimentos
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-8 gap-1 text-xs"
              disabled={!data || loading}
              onClick={() => {
                if (!data) return;
                downloadDreYearCsv(data, showDetails);
              }}
              title="Exportar a grade do DRE (CSV para Excel/Sheets)"
            >
              <Download className="size-3.5" aria-hidden />
              Exportar CSV
            </Button>
            <Button
              type="button"
              variant="default"
              size="sm"
              className="h-8 text-xs"
              disabled={syncingAll || loading}
              onClick={() => requestSyncAll()}
            >
              <RefreshCw
                className={syncingAll ? "size-4 animate-spin" : "size-4"}
                aria-hidden
              />
              Sincronizar todos
            </Button>
          </div>
        </div>

        {data ? (
          <div className="space-y-2">
            <div className="flex h-5 items-center gap-2">
              {monthFocused ? (
                <span className="inline-flex animate-in fade-in-0 items-center gap-1.5 text-[11px] font-medium text-[var(--muted-foreground)] duration-[1800ms]">
                  Exibindo{" "}
                  <span className="font-semibold text-[var(--foreground)]">
                    {focusMonthView.label}
                  </span>
                  <button
                    type="button"
                    className="inline-flex size-4 items-center justify-center rounded-full text-[var(--muted-foreground)] hover:bg-[var(--muted)] hover:text-[var(--foreground)]"
                    aria-label="Voltar aos totais do ano"
                    title="Voltar aos totais do ano"
                    onClick={() => setSelectedMonth(null)}
                  >
                    <X className="size-3" aria-hidden />
                  </button>
                </span>
              ) : (
                <span className="text-[11px] text-transparent" aria-hidden>
                  &nbsp;
                </span>
              )}
            </div>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
              <Card className={focusCardClass}>
                <CardHeader className="px-3 pb-1 pt-3">
                  <CardTitle className="flex items-center gap-1.5 text-xs font-medium text-[var(--muted-foreground)]">
                    Faturamento
                    <span
                      className={cn(
                        "rounded px-1 py-px text-[10px] font-semibold uppercase tracking-wide",
                        monthFocused
                          ? "text-[var(--foreground)]"
                          : "bg-[var(--muted)] text-[var(--muted-foreground)]",
                      )}
                    >
                      {monthFocused && selectedMonth !== null
                        ? dreMonthShortLabel(selectedMonth)
                        : "ano"}
                    </span>
                  </CardTitle>
                </CardHeader>
                <CardContent className="px-3 pb-3 text-base font-semibold tabular-nums">
                  {formatFinancialMoney(focusTotals?.totalEntrada ?? null)}
                </CardContent>
              </Card>
              <Card className={focusCardClass}>
                <CardHeader className="px-3 pb-1 pt-3">
                  <CardTitle className="flex items-center gap-1.5 text-xs font-medium text-[var(--muted-foreground)]">
                    Margem de contribuição
                    {monthFocused && selectedMonth !== null ? (
                      <span className="text-[10px] font-semibold uppercase tracking-wide text-[var(--foreground)]">
                        {dreMonthShortLabel(selectedMonth)}
                      </span>
                    ) : null}
                  </CardTitle>
                </CardHeader>
                <CardContent className="px-3 pb-3 text-base font-semibold tabular-nums">
                  {formatFinancialMoney(focusTotals?.margemContribuicao ?? null)}{" "}
                  <span className="text-xs font-normal text-[var(--muted-foreground)]">
                    ({formatFinancialPercent(
                      focusTotals?.margemContribuicaoPercent ?? null,
                    )}
                    )
                  </span>
                </CardContent>
              </Card>
              <Card className={focusCardClass}>
                <CardHeader className="px-3 pb-1 pt-3">
                  <CardTitle className="flex items-center gap-1.5 text-xs font-medium text-[var(--muted-foreground)]">
                    Lucro operacional
                    {monthFocused && selectedMonth !== null ? (
                      <span className="text-[10px] font-semibold uppercase tracking-wide text-[var(--foreground)]">
                        {dreMonthShortLabel(selectedMonth)}
                      </span>
                    ) : null}
                  </CardTitle>
                </CardHeader>
                <CardContent className="px-3 pb-3 text-base font-semibold tabular-nums">
                  {formatFinancialMoney(focusTotals?.lucroOperacional ?? null)}{" "}
                  <span className="text-xs font-normal text-[var(--muted-foreground)]">
                    ({formatFinancialPercent(
                      focusTotals?.lucroOperacionalPercent ?? null,
                    )}
                    )
                  </span>
                </CardContent>
              </Card>
              <Card className="shadow-sm">
                <CardHeader className="px-3 pb-1 pt-3">
                  <CardTitle className="text-xs font-medium text-[var(--muted-foreground)]">
                    Meses sincronizados
                  </CardTitle>
                </CardHeader>
                <CardContent className="px-3 pb-3 text-base font-semibold">
                  {syncedCount} / 12
                </CardContent>
              </Card>
            </div>
          </div>
        ) : null}

        <div className="flex gap-2.5 rounded-lg border border-[var(--border)] bg-[var(--muted)]/30 px-3 py-2.5 text-xs leading-relaxed text-[var(--muted-foreground)]">
          <Info
            className="mt-0.5 size-3.5 shrink-0 text-[var(--foreground)]/70"
            aria-hidden
          />
          <div className="space-y-1.5">
            <p className="font-medium text-[var(--foreground)]">Bom saber</p>
            <ol className="list-decimal space-y-1 pl-4">
              <li>
                <span className="font-medium text-[var(--foreground)]">
                  Auditar:
                </span>{" "}
                clique uma vez em um valor (ex.: Faturamento, Custo produto,
                Tarifa) para ver o detalhamento.
              </li>
              <li>
                <span className="font-medium text-[var(--foreground)]">
                  Editar:
                </span>{" "}
                dê dois cliques no valor, ajuste no campo e use{" "}
                <span className="font-medium text-[var(--foreground)]">
                  Aplicar
                </span>{" "}
                (ou Enter) para salvar, ou{" "}
                <span className="font-medium text-[var(--foreground)]">
                  Cancelar
                </span>{" "}
                (ou Esc) para desistir. Células ajustadas ficam marcadas; use
                restaurar para voltar ao valor do último sync.
              </li>
              <li>
                <span className="font-medium text-[var(--foreground)]">
                  Destacar mês:
                </span>{" "}
                clique no cabeçalho do mês para focar a coluna — os cards do
                topo passam a mostrar aquele mês. Totais e margens são
                calculados automaticamente; sincronizar atualiza/substitui os
                valores importados (custos fixos, operacionais e investimentos
                cadastrados permanecem).
              </li>
              <li>
                <span className="font-medium text-[var(--foreground)]">
                  Cadastrar custos:
                </span>{" "}
                use os botões com “+” no topo para criar itens; depois dê
                dois cliques na célula do mês para informar o valor.
              </li>
            </ol>
          </div>
        </div>

        {error ? (
          <div
            className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-200"
            role="alert"
          >
            {error}
          </div>
        ) : null}

        {loading && !data ? (
          <p className="text-sm text-[var(--muted-foreground)]">Carregando…</p>
        ) : null}

        {viewData ? (
          <DreYearTable
            data={viewData}
            showDetails={showDetails}
            onToggleDetails={() => setShowDetails((v) => !v)}
            selectedMonth={selectedMonth}
            onSelectedMonthChange={setSelectedMonth}
            syncingMonths={syncingMonths}
            syncingMonthMessages={syncingMonthMessages}
            onSyncMonth={requestSyncMonth}
            onLineChange={(lineKey, month, amount) =>
              void handleLineChange(lineKey, month, amount)
            }
            onLineRestore={(lineKey, month) =>
              void handleLineRestore(lineKey, month)
            }
            onFixedCostChange={(costItemId, month, amount) =>
              void handleManualCostChange(costItemId, month, amount)
            }
            onOperationalCostChange={(costItemId, month, amount) =>
              void handleManualCostChange(costItemId, month, amount)
            }
            onInvestmentCostChange={(costItemId, month, amount) =>
              void handleManualCostChange(costItemId, month, amount)
            }
          />
        ) : null}

        <DreCostItemsModal
          open={fixedCostsModalOpen}
          section="fixed"
          title="Cadastrar custos fixos"
          description="1) Cadastre o nome do item aqui. 2) Depois, na tabela do DRE, dê dois cliques na célula do mês para informar o valor."
          costItems={data?.costItems ?? []}
          onClose={() => setFixedCostsModalOpen(false)}
          onChanged={() => void loadYear(year)}
          onError={setError}
        />
        <DreCostItemsModal
          open={operationalCostsModalOpen}
          section="operational"
          title="Cadastrar custos operacionais"
          description="1) Cadastre o nome do item aqui (além das linhas do ML). 2) Depois, na tabela do DRE, dê dois cliques na célula do mês para informar o valor."
          costItems={data?.operationalCostItems ?? []}
          onClose={() => setOperationalCostsModalOpen(false)}
          onChanged={() => void loadYear(year)}
          onError={setError}
        />
        <DreCostItemsModal
          open={investmentCostsModalOpen}
          section="investment"
          title="Cadastrar investimentos"
          description="1) Cadastre o nome do item aqui (ex.: marketing institucional, CAPEX). 2) Depois, na tabela do DRE, dê dois cliques na célula do mês para informar o valor. Esses itens entram após o Lucro Operacional Antes dos Investimentos."
          costItems={data?.investmentCostItems ?? []}
          onClose={() => setInvestmentCostsModalOpen(false)}
          onChanged={() => void loadYear(year)}
          onError={setError}
        />

        <AlertDialog
          open={syncConfirm !== null}
          onOpenChange={(open) => {
            if (!open) setSyncConfirm(null);
          }}
        >
          <AlertDialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
            <AlertDialogHeader>
              <AlertDialogTitle>
                {syncConfirm?.mode === "all"
                  ? "Sincronizar todos os meses?"
                  : `Sincronizar ${syncConfirmMonthLabel}?`}
              </AlertDialogTitle>
              <AlertDialogDescription>
                {syncAdjustments.length > 0
                  ? "Há valores ajustados manualmente. Escolha o que deseja manter; o restante será atualizado com os dados importados."
                  : syncConfirm?.mode === "all"
                    ? "Já existem valores salvos. A sincronização busca os dados novamente e substitui as linhas importadas."
                    : "Já existem valores salvos neste mês. A sincronização busca os dados novamente e substitui as linhas importadas."}{" "}
                Custos fixos, operacionais e investimentos cadastrados não são
                apagados.
              </AlertDialogDescription>
            </AlertDialogHeader>

            {syncAdjustments.length > 0 ? (
              <div className="space-y-3">
                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-7 text-xs"
                    onClick={() =>
                      setPreserveAdjustmentIds(
                        new Set(syncAdjustments.map((item) => item.id)),
                      )
                    }
                  >
                    Manter todos
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-7 text-xs"
                    onClick={() => setPreserveAdjustmentIds(new Set())}
                  >
                    Não manter nenhum
                  </Button>
                </div>
                <ul className="max-h-56 space-y-1.5 overflow-y-auto rounded-lg border border-[var(--border)] p-2">
                  {syncAdjustments.map((item) => {
                    const checked = preserveAdjustmentIds.has(item.id);
                    return (
                      <li key={item.id}>
                        <label
                          className={cn(
                            "flex cursor-pointer items-center gap-3 rounded-md px-2 py-2 text-sm transition-colors hover:bg-[var(--muted)]/50",
                            checked && "bg-[var(--accent)]/60",
                          )}
                        >
                          <input
                            type="checkbox"
                            className="size-4 accent-[var(--primary)]"
                            checked={checked}
                            onChange={() => togglePreserveAdjustment(item.id)}
                          />
                          <span className="min-w-0 flex-1">
                            <span className="font-medium text-[var(--foreground)]">
                              {item.lineLabel}
                            </span>
                            {syncConfirm?.mode === "all" ? (
                              <span className="text-[var(--muted-foreground)]">
                                {" "}
                                · {item.monthLabel}
                              </span>
                            ) : null}
                          </span>
                          <span className="shrink-0 tabular-nums text-[var(--muted-foreground)]">
                            {formatFinancialMoney(item.amount)}
                          </span>
                        </label>
                      </li>
                    );
                  })}
                </ul>
                <p className="text-xs text-[var(--muted-foreground)]">
                  {preserveAdjustmentIds.size === 0
                    ? "Nenhum ajuste será mantido — todos os valores importados serão atualizados."
                    : `${preserveAdjustmentIds.size} de ${syncAdjustments.length} ajuste(s) serão mantidos.`}
                </p>
              </div>
            ) : null}

            <AlertDialogFooter className="flex-col gap-2 sm:flex-col sm:space-x-0">
              <AlertDialogCancel className="w-full sm:w-full">
                Cancelar
              </AlertDialogCancel>
              {syncAdjustments.length > 0 ? (
                <>
                  <Button
                    type="button"
                    variant="destructive"
                    className="w-full"
                    onClick={() => confirmSyncOverwrite(false)}
                  >
                    Atualizar todos (sem manter)
                  </Button>
                  <Button
                    type="button"
                    className="w-full"
                    onClick={() => confirmSyncOverwrite(true)}
                  >
                    Sincronizar mantendo selecionados
                  </Button>
                </>
              ) : (
                <AlertDialogAction
                  variant="destructive"
                  className="w-full"
                  onClick={() => confirmSyncOverwrite(false)}
                >
                  Substituir e sincronizar
                </AlertDialogAction>
              )}
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </TooltipProvider>
  );
}
