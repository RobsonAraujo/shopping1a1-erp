"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Info, Plus, RefreshCw } from "lucide-react";
import { DreCostItemsModal } from "@/components/dre/dre-fixed-costs-modal";
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
import { readApiError } from "@/lib/api-client-error";
import {
  formatFinancialMoney,
  formatFinancialPercent,
} from "@/lib/financial-margin";
import type { DreEditableLineKey } from "@/lib/dre/dre-calculations";
import type { DreYearView } from "@/lib/dre/dre-year-data";
import {
  getZonedYearMonth,
  isDreMonthSyncable,
} from "@/lib/mercadolibre/revenue-periods";

type SyncConfirmState =
  | { mode: "month"; month: number }
  | { mode: "all" }
  | null;

export function DreClient() {
  const currentYear = useMemo(() => getZonedYearMonth().year, []);
  const [year, setYear] = useState(currentYear);
  const [data, setData] = useState<DreYearView | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showDetails, setShowDetails] = useState(true);
  const [fixedCostsModalOpen, setFixedCostsModalOpen] = useState(false);
  const [operationalCostsModalOpen, setOperationalCostsModalOpen] =
    useState(false);
  const [investmentCostsModalOpen, setInvestmentCostsModalOpen] =
    useState(false);
  const [syncingMonths, setSyncingMonths] = useState<Set<number>>(new Set());
  const [syncingAll, setSyncingAll] = useState(false);
  const [syncConfirm, setSyncConfirm] = useState<SyncConfirmState>(null);

  const yearOptions = useMemo(
    () =>
      [currentYear - 1, currentYear, currentYear + 1].map((y) => ({
        value: String(y),
        label: String(y),
      })),
    [currentYear],
  );

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

  const syncMonth = useCallback(
    async (month: number): Promise<boolean> => {
      if (!isDreMonthSyncable(year, month)) {
        return true;
      }

      setSyncingMonths((prev) => new Set(prev).add(month));
      try {
        const res = await fetch("/api/dre/sync", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ year, month }),
        });
        if (!res.ok) {
          setError(await readApiError(res, "dre_sync_failed"));
          return false;
        }
        await loadYear(year);
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
      }
    },
    [year, loadYear],
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

  const syncAllMonths = useCallback(async () => {
    setSyncingAll(true);
    setError(null);
    const failures: number[] = [];
    try {
      for (let month = 1; month <= 12; month += 1) {
        if (!isDreMonthSyncable(year, month)) continue;
        const ok = await syncMonth(month);
        if (!ok) failures.push(month);
      }
      if (failures.length > 0) {
        setError(
          `Sincronização interrompida no mês ${failures[0]}. Corrija o erro e tente novamente.`,
        );
      }
    } finally {
      setSyncingAll(false);
    }
  }, [syncMonth, year]);

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

  const confirmSyncOverwrite = useCallback(() => {
    const pending = syncConfirm;
    setSyncConfirm(null);
    if (!pending) return;
    if (pending.mode === "month") {
      void syncMonth(pending.month);
      return;
    }
    void syncAllMonths();
  }, [syncConfirm, syncMonth, syncAllMonths]);

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
        }
      } catch {
        setError("Falha de rede ao salvar o valor.");
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

  return (
    <TooltipProvider delayDuration={200}>
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

        {data?.yearTotals ? (
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            <Card className="shadow-sm">
              <CardHeader className="px-3 pb-1 pt-3">
                <CardTitle className="text-xs font-medium text-[var(--muted-foreground)]">
                  Faturamento (ano)
                </CardTitle>
              </CardHeader>
              <CardContent className="px-3 pb-3 text-base font-semibold">
                {formatFinancialMoney(data.yearTotals.totalEntrada)}
              </CardContent>
            </Card>
            <Card className="shadow-sm">
              <CardHeader className="px-3 pb-1 pt-3">
                <CardTitle className="text-xs font-medium text-[var(--muted-foreground)]">
                  Margem de contribuição
                </CardTitle>
              </CardHeader>
              <CardContent className="px-3 pb-3 text-base font-semibold">
                {formatFinancialMoney(data.yearTotals.margemContribuicao)}{" "}
                <span className="text-xs font-normal text-[var(--muted-foreground)]">
                  ({formatFinancialPercent(
                    data.yearTotals.margemContribuicaoPercent,
                  )}
                  )
                </span>
              </CardContent>
            </Card>
            <Card className="shadow-sm">
              <CardHeader className="px-3 pb-1 pt-3">
                <CardTitle className="text-xs font-medium text-[var(--muted-foreground)]">
                  Lucro operacional
                </CardTitle>
              </CardHeader>
              <CardContent className="px-3 pb-3 text-base font-semibold">
                {formatFinancialMoney(data.yearTotals.lucroOperacional)}{" "}
                <span className="text-xs font-normal text-[var(--muted-foreground)]">
                  ({formatFinancialPercent(
                    data.yearTotals.lucroOperacionalPercent,
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
                (ou Esc) para desistir.
              </li>
              <li>
                <span className="font-medium text-[var(--foreground)]">
                  Destacar mês:
                </span>{" "}
                clique no cabeçalho do mês para focar a coluna. Totais e
                margens são calculados automaticamente; sincronizar
                atualiza/substitui os valores importados (custos fixos,
                operacionais e investimentos cadastrados permanecem).
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

        {data ? (
          <DreYearTable
            data={data}
            showDetails={showDetails}
            onToggleDetails={() => setShowDetails((v) => !v)}
            syncingMonths={syncingMonths}
            onSyncMonth={requestSyncMonth}
            onLineChange={(lineKey, month, amount) =>
              void handleLineChange(lineKey, month, amount)
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
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>
                {syncConfirm?.mode === "all"
                  ? "Substituir valores sincronizados?"
                  : `Substituir valores de ${syncConfirmMonthLabel}?`}
              </AlertDialogTitle>
              <AlertDialogDescription>
                {syncConfirm?.mode === "all"
                  ? "Já existem valores salvos em um ou mais meses. A sincronização vai buscar os dados importados novamente e substituir os valores atuais das linhas (incluindo edições manuais nessas linhas)."
                  : "Já existem valores salvos para este mês. A sincronização vai buscar os dados importados novamente e substituir os valores atuais das linhas (incluindo edições manuais nessas linhas)."}{" "}
                Custos fixos, operacionais e investimentos cadastrados não são
                apagados.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancelar</AlertDialogCancel>
              <AlertDialogAction
                variant="destructive"
                onClick={confirmSyncOverwrite}
              >
                Substituir e sincronizar
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </TooltipProvider>
  );
}
