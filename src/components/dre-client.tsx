"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { RefreshCw } from "lucide-react";
import { DreCostItemsModal } from "@/components/dre-fixed-costs-modal";
import { DreYearTable } from "@/components/dre-year-table";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { readApiError } from "@/lib/api-client-error";
import {
  formatFinancialMoney,
  formatFinancialPercent,
} from "@/lib/financial-margin";
import type { DreYearView } from "@/lib/dre-year-data";
import { getZonedYearMonth, isDreMonthSyncable } from "@/lib/mercadolibre/revenue-periods";

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
  const [syncingMonths, setSyncingMonths] = useState<Set<number>>(new Set());
  const [syncingAll, setSyncingAll] = useState(false);

  const yearOptions = useMemo(() => {
    return [currentYear - 1, currentYear, currentYear + 1];
  }, [currentYear]);

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

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex flex-wrap items-center gap-3">
          <label className="text-sm font-medium" htmlFor="dre-year">
            Ano
          </label>
          <select
            id="dre-year"
            value={year}
            onChange={(e) => setYear(Number(e.target.value))}
            className="rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm"
          >
            {yearOptions.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => setShowDetails((v) => !v)}
          >
            {showDetails ? "Ocultar detalhes" : "Mostrar detalhes"}
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => setOperationalCostsModalOpen(true)}
          >
            Custos operacionais
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => setFixedCostsModalOpen(true)}
          >
            Custos fixos
          </Button>
          <Button
            type="button"
            variant="secondary"
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

      {data?.yearTotals ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-[var(--muted-foreground)]">
                Faturamento (ano)
              </CardTitle>
            </CardHeader>
            <CardContent className="text-lg font-semibold">
              {formatFinancialMoney(data.yearTotals.totalEntrada)}
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-[var(--muted-foreground)]">
                Margem de contribuição
              </CardTitle>
            </CardHeader>
            <CardContent className="text-lg font-semibold">
              {formatFinancialMoney(data.yearTotals.margemContribuicao)}{" "}
              <span className="text-sm font-normal text-[var(--muted-foreground)]">
                ({formatFinancialPercent(data.yearTotals.margemContribuicaoPercent)})
              </span>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-[var(--muted-foreground)]">
                Lucro líquido
              </CardTitle>
            </CardHeader>
            <CardContent className="text-lg font-semibold">
              {formatFinancialMoney(data.yearTotals.lucroLiquido)}{" "}
              <span className="text-sm font-normal text-[var(--muted-foreground)]">
                ({formatFinancialPercent(data.yearTotals.lucroLiquidoPercent)})
              </span>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-[var(--muted-foreground)]">
                Meses sincronizados
              </CardTitle>
            </CardHeader>
            <CardContent className="text-lg font-semibold">
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

      {data ? (
        <DreYearTable
          data={data}
          showDetails={showDetails}
          syncingMonths={syncingMonths}
          onSyncMonth={(month) => void syncMonth(month)}
          onFixedCostChange={(costItemId, month, amount) =>
            void handleManualCostChange(costItemId, month, amount)
          }
          onOperationalCostChange={(costItemId, month, amount) =>
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
    </div>
  );
}
