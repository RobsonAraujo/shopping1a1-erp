"use client";

import { useCallback, useEffect, useId, useMemo, useState } from "react";
import { HelpCircle, RefreshCw } from "lucide-react";
import { DreCostItemsModal } from "@/components/dre/dre-fixed-costs-modal";
import { DreYearTable } from "@/components/dre/dre-year-table";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { FormSelect } from "@/components/ui/form-select";
import { Switch } from "@/components/ui/switch";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { readApiError } from "@/lib/api-client-error";
import {
  formatFinancialMoney,
  formatFinancialPercent,
} from "@/lib/financial-margin";
import {
  applyDreIncludeCancelledView,
  computeDreTotals,
  sumYearLineAmounts,
  type DreLineAmounts,
} from "@/lib/dre/dre-calculations";
import type { DreYearView } from "@/lib/dre/dre-year-data";
import { getZonedYearMonth, isDreMonthSyncable } from "@/lib/mercadolibre/revenue-periods";

export function DreClient() {
  const titleId = useId();
  const currentYear = useMemo(() => getZonedYearMonth().year, []);
  const [year, setYear] = useState(currentYear);
  const [data, setData] = useState<DreYearView | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showDetails, setShowDetails] = useState(true);
  const [includeCancelledSales, setIncludeCancelledSales] = useState(false);
  const [fixedCostsModalOpen, setFixedCostsModalOpen] = useState(false);
  const [operationalCostsModalOpen, setOperationalCostsModalOpen] =
    useState(false);
  const [investmentCostsModalOpen, setInvestmentCostsModalOpen] =
    useState(false);
  const [syncingMonths, setSyncingMonths] = useState<Set<number>>(new Set());
  const [syncingAll, setSyncingAll] = useState(false);

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

  const syncedCount = data?.months.filter((m) => m.syncedAt).length ?? 0;

  const displayData = useMemo(() => {
    if (!data || !includeCancelledSales) return data;

    // map months applying cancelled overlay and recomputing totals client-side
    const months = data.months.map((month) => {
      if (!month.lines) return month;

      const lines = applyDreIncludeCancelledView(
        month.lines,
        month.cancelledIncludeOverlay ?? undefined,
      );

      const fixedCosts = data.costItems.map((item) => ({
        costItemId: item.id,
        amount: month.fixedCostValues[item.id] ?? 0,
      }));
      const operationalCosts = data.operationalCostItems.map((item) => ({
        costItemId: item.id,
        amount: month.operationalCostValues[item.id] ?? 0,
      }));
      const investmentCosts = data.investmentCostItems.map((item) => ({
        costItemId: item.id,
        amount: month.investmentCostValues[item.id] ?? 0,
      }));

      const totals =
        month.adsCost !== null
          ? computeDreTotals(
              lines,
              month.adsCost,
              fixedCosts.filter((r) => r.amount > 0),
              operationalCosts.filter((r) => r.amount > 0),
              investmentCosts.filter((r) => r.amount > 0),
            )
          : month.totals;

      return { ...month, lines, totals };
    });

    // compute year totals similar to server
    const monthLines = months
      .map((m) => m.lines)
      .filter((l): l is DreLineAmounts => l !== null);
    const yearLines = monthLines.length > 0 ? sumYearLineAmounts(monthLines) : null;
    const yearAds = months.reduce((s, m) => s + (m.adsCost ?? 0), 0);

    const yearFixedByItem = new Map<string, number>();
    for (const item of data.costItems) {
      let sum = 0;
      for (const month of months) {
        sum += month.fixedCostValues[item.id] ?? 0;
      }
      yearFixedByItem.set(item.id, sum);
    }
    const yearOperationalByItem = new Map<string, number>();
    for (const item of data.operationalCostItems) {
      let sum = 0;
      for (const month of months) {
        sum += month.operationalCostValues[item.id] ?? 0;
      }
      yearOperationalByItem.set(item.id, sum);
    }
    const yearInvestmentByItem = new Map<string, number>();
    for (const item of data.investmentCostItems) {
      let sum = 0;
      for (const month of months) {
        sum += month.investmentCostValues[item.id] ?? 0;
      }
      yearInvestmentByItem.set(item.id, sum);
    }

    const yearManualFixed = data.costItems
      .map((item) => ({ costItemId: item.id, amount: yearFixedByItem.get(item.id) ?? 0 }))
      .filter((r) => r.amount > 0);
    const yearManualOperational = data.operationalCostItems
      .map((item) => ({ costItemId: item.id, amount: yearOperationalByItem.get(item.id) ?? 0 }))
      .filter((r) => r.amount > 0);
    const yearManualInvestment = data.investmentCostItems
      .map((item) => ({ costItemId: item.id, amount: yearInvestmentByItem.get(item.id) ?? 0 }))
      .filter((r) => r.amount > 0);

    const yearTotals =
      yearLines !== null
        ? computeDreTotals(
            yearLines,
            yearAds,
            yearManualFixed,
            yearManualOperational,
            yearManualInvestment,
          )
        : yearManualFixed.length > 0 ||
            yearManualOperational.length > 0 ||
            yearManualInvestment.length > 0
        ? computeDreTotals(
            {
              revenueMl: 0,
              cancelledSalesMl: 0,
              saleFeeMl: 0,
              partialReturnsMl: 0,
              productCostErp: 0,
              taxErp: 0,
              sellerShippingMl: 0,
              fullShippingMl: 0,
              fullStorageMl: 0,
              fullNonComplianceMl: 0,
            },
            0,
            yearManualFixed,
            yearManualOperational,
            yearManualInvestment,
          )
        : null;

    return { ...data, months, yearTotals };
  }, [data, includeCancelledSales]);

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
        <div className="flex flex-wrap gap-1.5">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-8 text-xs"
            onClick={() => setShowDetails((v) => !v)}
          >
            {showDetails ? "Ocultar detalhes" : "Mostrar detalhes"}
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-8 text-xs"
            onClick={() => setOperationalCostsModalOpen(true)}
          >
            Custos operacionais
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-8 text-xs"
            onClick={() => setFixedCostsModalOpen(true)}
          >
            Custos fixos
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-8 text-xs"
            onClick={() => setInvestmentCostsModalOpen(true)}
          >
            Investimentos
          </Button>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            className="h-8 text-xs"
            disabled={syncingAll || loading}
            onClick={() => void syncAllMonths()}
          >
            <RefreshCw
              className={syncingAll ? "size-4 animate-spin" : "size-4"}
              aria-hidden
            />
            Sincronizar todos
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3 rounded-lg border border-[var(--border)] px-4 py-3">
        <Switch
          id={`${titleId}-include-cancelled`}
          checked={includeCancelledSales}
          onCheckedChange={setIncludeCancelledSales}
          aria-label="Incluir vendas canceladas no DRE"
        />
        <label
          htmlFor={`${titleId}-include-cancelled`}
          className="cursor-pointer text-sm text-[var(--foreground)]"
        >
          Incluir vendas canceladas no faturamento
        </label>
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              className="inline-flex size-5 items-center justify-center rounded-full text-[var(--muted-foreground)] hover:text-[var(--foreground)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
              aria-label="O que significa incluir vendas canceladas"
            >
              <HelpCircle className="size-4" aria-hidden />
            </button>
          </TooltipTrigger>
          <TooltipContent side="bottom" className="max-w-[20rem] text-left">
            <p>
              Por padrão, o DRE trata vendas canceladas em linha separada
              (negativa). O Mercado Livre, no painel de vendas, conta esses
              pedidos no faturamento bruto.
            </p>
            <p className="mt-2">
              Ative para ver o DRE no mesmo critério do ML. Meses sincronizados
              antes desta atualização usam a linha de canceladas como
              referência; re-sincronize para incluir custo de produto e imposto
              das canceladas.
            </p>
          </TooltipContent>
        </Tooltip>
        <p className="text-xs text-[var(--muted-foreground)] sm:ml-auto">
          {includeCancelledSales
            ? "Visão compatível com o painel ML."
            : "Padrão: faturamento só de pedidos pagos."}
        </p>
      </div>

      {displayData?.yearTotals ? (
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          <Card className="shadow-sm">
            <CardHeader className="px-3 pb-1 pt-3">
              <CardTitle className="text-xs font-medium text-[var(--muted-foreground)]">
                Faturamento (ano)
              </CardTitle>
            </CardHeader>
            <CardContent className="px-3 pb-3 text-base font-semibold">
              {formatFinancialMoney(displayData.yearTotals.totalEntrada)}
            </CardContent>
          </Card>
          <Card className="shadow-sm">
            <CardHeader className="px-3 pb-1 pt-3">
              <CardTitle className="text-xs font-medium text-[var(--muted-foreground)]">
                Margem de contribuição
              </CardTitle>
            </CardHeader>
            <CardContent className="px-3 pb-3 text-base font-semibold">
              {formatFinancialMoney(displayData.yearTotals.margemContribuicao)}{" "}
              <span className="text-xs font-normal text-[var(--muted-foreground)]">
                ({formatFinancialPercent(displayData.yearTotals.margemContribuicaoPercent)})
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
              {formatFinancialMoney(displayData.yearTotals.lucroOperacional)}{" "}
              <span className="text-xs font-normal text-[var(--muted-foreground)]">
                ({formatFinancialPercent(displayData.yearTotals.lucroOperacionalPercent)})
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

      {displayData ? (
        <DreYearTable
          data={displayData}
          showDetails={showDetails}
          syncingMonths={syncingMonths}
          onSyncMonth={(month) => void syncMonth(month)}
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
        title="Custos fixos"
        description="Cadastre itens globais e informe o valor de cada um por mês na tabela."
        costItems={data?.costItems ?? []}
        onClose={() => setFixedCostsModalOpen(false)}
        onChanged={() => void loadYear(year)}
        onError={setError}
      />
      <DreCostItemsModal
        open={operationalCostsModalOpen}
        section="operational"
        title="Custos operacionais"
        description="Itens extras de custo operacional (além das linhas ML). Valores por mês na tabela."
        costItems={data?.operationalCostItems ?? []}
        onClose={() => setOperationalCostsModalOpen(false)}
        onChanged={() => void loadYear(year)}
        onError={setError}
      />
      <DreCostItemsModal
        open={investmentCostsModalOpen}
        section="investment"
        title="Investimentos"
        description="Itens de investimento (ex.: marketing institucional, CAPEX), descontados após o Lucro Operacional Antes dos Investimentos. Valores por mês na tabela."
        costItems={data?.investmentCostItems ?? []}
        onClose={() => setInvestmentCostsModalOpen(false)}
        onChanged={() => void loadYear(year)}
        onError={setError}
      />
    </div>
    </TooltipProvider>
  );
}
