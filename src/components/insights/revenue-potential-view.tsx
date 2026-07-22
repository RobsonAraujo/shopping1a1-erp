"use client";

import { useMemo, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  ImageOff,
  RotateCcw,
  Undo2,
  X,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { FormInput } from "@/components/ui/form-input";
import { cn } from "@/lib/utils";
import { usePersistedJson } from "@/hooks/use-persisted-json";
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
import type { RevenuePotentialRow } from "@/lib/insights/types";
import { WorkingCapitalCard } from "@/components/insights/working-capital-card";

const DAYS_IN_MONTH = 30;
const STORAGE_KEY = "insights:revenue-potential:v1";

type StoredState = {
  overrides: Record<string, number>;
  excluded: Record<string, boolean>;
};

const EMPTY_STORED_STATE: StoredState = { overrides: {}, excluded: {} };

function fmtBrl(n: number): string {
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

type SortKey =
  | "product"
  | "price"
  | "dailyAvg"
  | "potential"
  | "current"
  | "gap";
type SortDir = "asc" | "desc";

function SortableTh({
  label,
  sortKey,
  activeKey,
  activeDir,
  onSort,
  className,
  align = "left",
}: {
  label: string;
  sortKey: SortKey;
  activeKey: SortKey;
  activeDir: SortDir;
  onSort: (key: SortKey) => void;
  className?: string;
  align?: "left" | "right";
}) {
  const active = activeKey === sortKey;
  const Icon = !active ? ArrowUpDown : activeDir === "asc" ? ArrowUp : ArrowDown;

  return (
    <th className={cn(className, "cursor-pointer")}>
      <button
        type="button"
        className={cn(
          "inline-flex cursor-pointer items-center gap-1 font-medium hover:text-[var(--foreground)]",
          align === "right" && "ml-auto flex-row-reverse",
          active && "text-[var(--foreground)]",
        )}
        onClick={() => onSort(sortKey)}
      >
        {label}
        <Icon className="size-3.5 shrink-0 opacity-70" aria-hidden />
      </button>
    </th>
  );
}

type EffectiveRow = RevenuePotentialRow & {
  effectiveDailyAvg: number;
  effectivePotential: number;
  effectiveGap: number;
  isOverridden: boolean;
  isExcluded: boolean;
};

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

  const handleReset = () => setStored(EMPTY_STORED_STATE);

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
            Você está vendo uma simulação: alguns produtos foram editados ou não
            considerados na análise.
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
        <ShowPausedListingsSwitch
          checked={showPaused}
          onCheckedChange={setShowPaused}
          pausedCount={pausedCount}
        />
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
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--border)] text-left text-xs text-[var(--muted-foreground)]">
                <SortableTh
                  label="SKU"
                  sortKey="product"
                  activeKey={sortKey}
                  activeDir={sortDir}
                  onSort={toggleSort}
                  className="pb-2 pr-3"
                />
                <th className="pb-2 pr-3 font-medium">Status</th>
                <SortableTh
                  label="Preço"
                  sortKey="price"
                  activeKey={sortKey}
                  activeDir={sortDir}
                  onSort={toggleSort}
                  className="pb-2 pr-3"
                  align="right"
                />
                <SortableTh
                  label="Média/dia"
                  sortKey="dailyAvg"
                  activeKey={sortKey}
                  activeDir={sortDir}
                  onSort={toggleSort}
                  className="pb-2 pr-3"
                  align="right"
                />
                <SortableTh
                  label="Potencial/mês"
                  sortKey="potential"
                  activeKey={sortKey}
                  activeDir={sortDir}
                  onSort={toggleSort}
                  className="pb-2 pr-3"
                  align="right"
                />
                <SortableTh
                  label="Atual/mês"
                  sortKey="current"
                  activeKey={sortKey}
                  activeDir={sortDir}
                  onSort={toggleSort}
                  className="pb-2 pr-3"
                  align="right"
                />
                <SortableTh
                  label="Gap"
                  sortKey="gap"
                  activeKey={sortKey}
                  activeDir={sortDir}
                  onSort={toggleSort}
                  className="pb-2 pr-3"
                  align="right"
                />
                <th className="pb-2 text-right font-medium">
                  <span className="sr-only">Ações</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {sortedRows.map((row) => (
                <tr
                  key={row.mlItemId}
                  className={cn(
                    "border-b border-[var(--border)] last:border-0",
                    row.isExcluded && "opacity-40",
                  )}
                >
                  <td className="max-w-xs py-2 pr-3">
                    <div className="flex min-w-0 items-center gap-2">
                      <Link
                        href={`/dashboard/items/${row.mlItemId}`}
                        className="relative shrink-0 overflow-hidden rounded-md border border-[var(--border)] bg-[var(--muted)]"
                      >
                        {row.imageUrl ? (
                          <Image
                            src={row.imageUrl}
                            alt=""
                            width={32}
                            height={32}
                            className="size-8 object-contain"
                            sizes="32px"
                          />
                        ) : (
                          <span className="flex size-8 items-center justify-center">
                            <ImageOff
                              className="size-3.5 text-[var(--muted-foreground)]/60"
                              aria-hidden
                            />
                          </span>
                        )}
                      </Link>
                      <div className="min-w-0">
                        <div className="truncate font-mono font-medium text-[var(--foreground)]">
                          {row.sku ?? row.mlItemId}
                        </div>
                        <div className="flex items-center gap-1.5 text-xs text-[var(--muted-foreground)]">
                          <span className="truncate">{row.title}</span>
                          {row.estimateBasis === "historical" && (
                            <Badge variant="muted" className="shrink-0 px-1.5 py-0 text-[10px]">
                              estimativa histórica
                            </Badge>
                          )}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td className="py-2 pr-3">
                    <Badge
                      variant={row.status === "active" ? "success" : "secondary"}
                      className="px-1.5 py-0 text-[10px]"
                    >
                      {row.status === "active" ? "ativo" : "pausado"}
                    </Badge>
                  </td>
                  <td className="py-2 pr-3 text-right text-[var(--muted-foreground)]">
                    {fmtBrl(row.price)}
                  </td>
                  <td className="py-2 pr-3">
                    <div className="flex items-center justify-end gap-1">
                      <FormInput
                        type="number"
                        step="any"
                        min="0"
                        disabled={row.isExcluded}
                        value={
                          row.isOverridden
                            ? overrides[row.mlItemId]
                            : row.effectiveDailyAvg.toFixed(1)
                        }
                        onChange={(e) => {
                          const value = e.target.valueAsNumber;
                          setOverride(
                            row.mlItemId,
                            Number.isFinite(value) ? Math.max(0, value) : 0,
                          );
                        }}
                        className="w-16"
                        inputClassName={cn(
                          "h-8 px-1.5 py-0.5 text-right text-sm tabular-nums",
                          row.isOverridden && "border-[var(--primary)]/50 text-[var(--primary)]",
                        )}
                      />
                      {row.isOverridden && (
                        <button
                          type="button"
                          title="Restaurar estimativa original"
                          onClick={() => clearOverride(row.mlItemId)}
                          className="cursor-pointer text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
                        >
                          <RotateCcw className="size-3.5" aria-hidden />
                        </button>
                      )}
                    </div>
                  </td>
                  <td className="py-2 pr-3 text-right font-medium">
                    {fmtBrl(row.effectivePotential)}
                  </td>
                  <td className="py-2 pr-3 text-right text-[var(--muted-foreground)]">
                    {fmtBrl(row.currentMonthlyRevenue)}
                  </td>
                  <td className="py-2 pr-3 text-right font-medium text-emerald-700 dark:text-emerald-400">
                    {fmtBrl(row.effectiveGap)}
                  </td>
                  <td className="py-2 text-right">
                    <button
                      type="button"
                      title={row.isExcluded ? "Voltar a considerar" : "Não considerar na análise"}
                      onClick={() => toggleExcluded(row.mlItemId)}
                      className="cursor-pointer text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
                    >
                      {row.isExcluded ? (
                        <Undo2 className="size-4" aria-hidden />
                      ) : (
                        <X className="size-4" aria-hidden />
                      )}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
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
