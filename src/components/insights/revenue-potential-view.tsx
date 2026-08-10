"use client";

import { useMemo, useState } from "react";
import { RotateCcw, X } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  usePersistedJson,
  getPersistedJsonValue,
  setPersistedJsonValue,
} from "@/hooks/use-persisted-json";
import {
  ItemListSearch,
  itemListSearchEmptyMessage,
} from "@/components/item-list-search";
import { filterByItemListSearch } from "@/lib/item-list-search";
import {
  ShowPausedListingsSwitch,
  countPausedListings,
  filterListingsByPausedVisibility,
} from "@/components/show-paused-listings-switch";
import type { RevenuePotentialRow, RevenueSimulationPayload } from "@/lib/insights/types";
import {
  WorkingCapitalCard,
  WORKING_CAPITAL_STORAGE_KEY,
  WORKING_CAPITAL_DEFAULT_STORED_STATE,
  type WorkingCapitalStoredState,
} from "@/components/insights/working-capital-card";
import {
  SavedSimulationsMenu,
  type ActiveSimulation,
} from "@/components/insights/saved-simulations-menu";
import {
  RevenuePotentialTable,
  type EffectiveRow,
  type SortKey,
  type SortDir,
} from "@/components/insights/revenue-potential-table";

const DAYS_IN_MONTH = 30;
const STORAGE_KEY = "insights:revenue-potential:v1";
const ACTIVE_SIMULATION_STORAGE_KEY =
  "insights:revenue-potential:active-simulation:v1";

type StoredState = {
  overrides: Record<string, number>;
  excluded: Record<string, boolean>;
};

const EMPTY_STORED_STATE: StoredState = { overrides: {}, excluded: {} };

function fmtBrl(n: number): string {
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

// Ordena sempre pelos valores originais (não pelos editados), para que
// alterar a média/dia de um produto não reordene a tabela embaixo do cursor.
function sortValue(row: EffectiveRow, key: SortKey): number | string {
  switch (key) {
    case "product":
      return (row.sku ?? row.mlItemId).toLocaleLowerCase("pt-BR");
    case "price":
      return row.price;
    case "dailyAvg":
      return row.dailyAvgEstimate;
    case "potential":
      return row.potentialMonthlyRevenue;
    case "current":
      return row.currentMonthlyRevenue;
    case "gap":
      return row.gap;
  }
}

type TabKey = "potencial" | "capital";

export function RevenuePotentialView({ rows }: { rows: RevenuePotentialRow[] }) {
  const [activeTab, setActiveTab] = useState<TabKey>("potencial");
  const [sortKey, setSortKey] = useState<SortKey>("gap");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [searchQuery, setSearchQuery] = useState("");
  // Pausados vêm visíveis por padrão aqui — são o principal alvo desta análise.
  const [showPaused, setShowPaused] = useState(true);
  const [stored, setStored] = usePersistedJson<StoredState>(
    STORAGE_KEY,
    EMPTY_STORED_STATE,
  );
  const [activeSimulation, setActiveSimulation] =
    usePersistedJson<ActiveSimulation>(ACTIVE_SIMULATION_STORAGE_KEY, null);
  const { overrides, excluded } = stored;

  const setOverride = (mlItemId: string, value: number) => {
    setStored({ ...stored, overrides: { ...overrides, [mlItemId]: value } });
  };

  const clearOverride = (mlItemId: string) => {
    const nextOverrides = { ...overrides };
    delete nextOverrides[mlItemId];
    setStored({ ...stored, overrides: nextOverrides });
  };

  const toggleExcluded = (mlItemId: string) => {
    setStored({
      ...stored,
      excluded: { ...excluded, [mlItemId]: !excluded[mlItemId] },
    });
  };

  const hasChanges =
    Object.keys(overrides).length > 0 ||
    Object.keys(excluded).some((k) => excluded[k]);

  const handleReset = () => {
    setStored(EMPTY_STORED_STATE);
    setActiveSimulation(null);
  };

  const buildSimulationPayload = (): RevenueSimulationPayload => {
    const workingCapital = getPersistedJsonValue<WorkingCapitalStoredState>(
      WORKING_CAPITAL_STORAGE_KEY,
      WORKING_CAPITAL_DEFAULT_STORED_STATE,
    );
    return {
      overrides: stored.overrides,
      excluded: stored.excluded,
      periodDays: workingCapital.periodDays,
      installmentsBySupplier: workingCapital.installmentsBySupplier,
    };
  };

  const handleLoadSimulation = (payload: RevenueSimulationPayload) => {
    setStored({ overrides: payload.overrides, excluded: payload.excluded });
    setPersistedJsonValue<WorkingCapitalStoredState>(WORKING_CAPITAL_STORAGE_KEY, {
      periodDays: payload.periodDays,
      installmentsBySupplier: payload.installmentsBySupplier,
    });
  };

  const toggleSort = (key: SortKey) => {
    if (key === sortKey) {
      setSortDir((prev) => (prev === "asc" ? "desc" : "asc"));
      return;
    }
    setSortKey(key);
    setSortDir(key === "product" ? "asc" : "desc");
  };

  const effectiveRows = useMemo<EffectiveRow[]>(() => {
    return rows.map((row) => {
      const override = overrides[row.mlItemId];
      const effectiveDailyAvg = override ?? row.dailyAvgEstimate;
      const effectivePotential = effectiveDailyAvg * DAYS_IN_MONTH * row.price;
      return {
        ...row,
        effectiveDailyAvg,
        effectivePotential,
        effectiveGap: effectivePotential - row.currentMonthlyRevenue,
        isOverridden: override !== undefined,
        isExcluded: Boolean(excluded[row.mlItemId]),
      };
    });
  }, [rows, overrides, excluded]);

  const pausedCount = useMemo(
    () => countPausedListings(effectiveRows, (r) => r.status),
    [effectiveRows],
  );

  const visibleRows = useMemo(() => {
    const statusVisible = filterListingsByPausedVisibility(
      effectiveRows,
      showPaused,
      (r) => r.status,
    );
    return filterByItemListSearch(statusVisible, searchQuery, (r) => ({
      sku: r.sku,
      title: r.title,
      mlItemId: r.mlItemId,
    }));
  }, [effectiveRows, showPaused, searchQuery]);

  const sortedRows = useMemo(() => {
    const copy = [...visibleRows];
    copy.sort((a, b) => {
      const va = sortValue(a, sortKey);
      const vb = sortValue(b, sortKey);
      const cmp =
        typeof va === "string" && typeof vb === "string"
          ? va.localeCompare(vb, "pt-BR")
          : (va as number) - (vb as number);
      return sortDir === "asc" ? cmp : -cmp;
    });
    return copy;
  }, [visibleRows, sortKey, sortDir]);

  const totals = useMemo(() => {
    const considered = visibleRows.filter((r) => !r.isExcluded);
    const totalPotential = considered.reduce((sum, r) => sum + r.effectivePotential, 0);
    const totalCurrent = considered.reduce((sum, r) => sum + r.currentMonthlyRevenue, 0);
    return {
      totalPotential,
      totalCurrent,
      totalGap: totalPotential - totalCurrent,
      excludedCount: visibleRows.length - considered.length,
    };
  }, [visibleRows]);

  // Capital de giro segue o mesmo switch de pausados da tabela acima —
  // independente da busca por texto, que é específica da tabela. Os
  // excluídos continuam vindo (com isExcluded=true) para o card poder
  // contá-los; quem descarta do cálculo é o buildWorkingCapitalRows.
  const activeConsideredRows = useMemo(
    () => filterListingsByPausedVisibility(effectiveRows, showPaused, (r) => r.status),
    [effectiveRows, showPaused],
  );

  const kpis = [
    {
      key: "potencial",
      label: "Potencial mensal",
      value: fmtBrl(totals.totalPotential),
      tone: "text-[var(--primary)]",
    },
    {
      key: "atual",
      label: "Faturamento atual estimado",
      value: fmtBrl(totals.totalCurrent),
      tone: "text-[var(--muted-foreground)]",
    },
    {
      key: "gap",
      label: "Oportunidade (gap)",
      value: fmtBrl(totals.totalGap),
      tone: "text-emerald-700 dark:text-emerald-400",
    },
  ];

  if (rows.length === 0) {
    return (
      <p className="py-4 text-center text-sm text-[var(--muted-foreground)]">
        Nenhum produto encontrado para estimar potencial de faturamento.
      </p>
    );
  }

  return (
    <div className="space-y-6">
      {hasChanges && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 dark:border-amber-800 dark:bg-amber-950/30">
          <p className="text-sm font-medium text-amber-900 dark:text-amber-100">
            {activeSimulation
              ? `Você está editando a simulação salva "${activeSimulation.name}".`
              : "Você está vendo uma simulação: alguns produtos foram editados ou não considerados na análise."}
          </p>
          <button
            type="button"
            onClick={handleReset}
            className="inline-flex shrink-0 cursor-pointer items-center gap-1.5 rounded-md bg-amber-600 px-3 py-1.5 text-sm font-semibold text-white shadow-sm hover:bg-amber-700"
          >
            <RotateCcw className="size-4" aria-hidden />
            Resetar simulação
          </button>
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div
          role="tablist"
          aria-label="Visão de potencial de faturamento"
          className="inline-flex rounded-lg border border-[var(--border)] bg-[var(--muted)]/20 p-1"
        >
          {(
            [
              { id: "potencial", label: "Potencial de faturamento" },
              { id: "capital", label: "Capital de giro necessário" },
            ] as const
          ).map((tab) => {
            const selected = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={selected}
                className={cn(
                  "inline-flex cursor-pointer items-center rounded-md px-4 py-2 text-sm font-medium transition-colors",
                  selected
                    ? "bg-[var(--card)] text-[var(--primary)] shadow-sm"
                    : "text-[var(--muted-foreground)] hover:text-[var(--foreground)]",
                )}
                onClick={() => setActiveTab(tab.id)}
              >
                {tab.label}
              </button>
            );
          })}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <SavedSimulationsMenu
            activeSimulation={activeSimulation}
            onActiveSimulationChange={setActiveSimulation}
            buildPayload={buildSimulationPayload}
            onLoad={handleLoadSimulation}
          />
          <ShowPausedListingsSwitch
            checked={showPaused}
            onCheckedChange={setShowPaused}
            pausedCount={pausedCount}
          />
        </div>
      </div>

      {activeTab === "capital" ? (
        <WorkingCapitalCard rows={activeConsideredRows} />
      ) : (
      <>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {kpis.map(({ key, label, value, tone }) => (
          <div
            key={key}
            className="rounded-xl border border-[var(--border)] bg-[var(--muted)]/30 px-4 py-3"
          >
            <div className="text-xs font-medium text-[var(--muted-foreground)]">
              {label}
            </div>
            <div className={cn("mt-1 text-2xl font-bold tracking-tight", tone)}>
              {value}
            </div>
          </div>
        ))}
      </div>

      <ItemListSearch
        value={searchQuery}
        onChange={setSearchQuery}
        filteredCount={visibleRows.length}
        totalCount={effectiveRows.length}
        entitySingular="produto"
        entityPlural="produtos"
        className="sm:max-w-sm"
      />

      <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] px-4 py-4 shadow-sm sm:px-5">
        <p className="mb-3 text-xs text-[var(--muted-foreground)]">
          Edite a média/dia de um produto para simular outro cenário, ou clique em{" "}
          <X className="inline size-3" aria-hidden /> para não considerá-lo na análise.
          As mudanças não são salvas — servem só para essa visualização.
        </p>
        {sortedRows.length === 0 ? (
          <p className="py-4 text-center text-sm text-[var(--muted-foreground)]">
            {itemListSearchEmptyMessage(searchQuery, "produto")}
          </p>
        ) : (
          <RevenuePotentialTable
            rows={sortedRows}
            sortKey={sortKey}
            sortDir={sortDir}
            onSort={toggleSort}
            overrides={overrides}
            setOverride={setOverride}
            clearOverride={clearOverride}
            toggleExcluded={toggleExcluded}
          />
        )}
        <p className="mt-2 text-right text-xs text-[var(--muted-foreground)]">
          {rows.length} produto{rows.length !== 1 ? "s" : ""} no total
          {totals.excludedCount > 0 &&
            ` · ${totals.excludedCount} não considerado${totals.excludedCount !== 1 ? "s" : ""}`}
        </p>
      </div>
      </>
      )}
    </div>
  );
}
