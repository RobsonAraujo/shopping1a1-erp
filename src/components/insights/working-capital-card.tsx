"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { RotateCcw } from "lucide-react";
import { FormInput } from "@/components/ui/form-input";
import { cn } from "@/lib/utils";
import { usePersistedJson } from "@/hooks/use-persisted-json";
import { getSkuSupplier } from "@/lib/mercadolibre/item-sku";
import {
  ItemListSearch,
  itemListSearchEmptyMessage,
} from "@/components/item-list-search";
import { filterByItemListSearch } from "@/lib/item-list-search";
import {
  buildWorkingCapitalRows,
  type WorkingCapitalInputRow,
} from "@/lib/insights/working-capital";
import { WorkingCapitalTable } from "@/components/insights/working-capital-table";

export const WORKING_CAPITAL_STORAGE_KEY = "insights:working-capital:v1";
const STORAGE_KEY = WORKING_CAPITAL_STORAGE_KEY;
const PERIOD_PRESETS = [30, 45, 60];

export type WorkingCapitalStoredState = {
  periodDays: number;
  installmentsBySupplier: Record<string, number>;
};
type StoredState = WorkingCapitalStoredState;

export const WORKING_CAPITAL_DEFAULT_STORED_STATE: StoredState = {
  periodDays: 30,
  installmentsBySupplier: {},
};
const DEFAULT_STORED_STATE = WORKING_CAPITAL_DEFAULT_STORED_STATE;

function fmtBrl(n: number): string {
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export function WorkingCapitalCard({ rows }: { rows: WorkingCapitalInputRow[] }) {
  const [stored, setStored] = usePersistedJson<StoredState>(
    STORAGE_KEY,
    DEFAULT_STORED_STATE,
  );
  const { periodDays, installmentsBySupplier } = stored;
  const [searchQuery, setSearchQuery] = useState("");

  const excludedCount = useMemo(
    () => rows.filter((r) => r.isExcluded).length,
    [rows],
  );

  const suppliers = useMemo(() => {
    const set = new Set<string>();
    for (const row of rows) {
      if (row.isExcluded) continue;
      set.add(getSkuSupplier(row.sku));
    }
    return [...set].sort((a, b) => a.localeCompare(b, "pt-BR"));
  }, [rows]);

  const { rows: allCapitalRows, missingCostSkus } = useMemo(
    () => buildWorkingCapitalRows(rows, periodDays, installmentsBySupplier),
    [rows, periodDays, installmentsBySupplier],
  );

  const capitalRows = useMemo(
    () =>
      filterByItemListSearch(allCapitalRows, searchQuery, (r) => ({
        sku: r.sku,
        title: r.title,
        mlItemId: r.mlItemId,
      })),
    [allCapitalRows, searchQuery],
  );

  const totalCapital = useMemo(
    () => capitalRows.reduce((sum, r) => sum + r.effectiveCapital, 0),
    [capitalRows],
  );

  const setPeriodDays = (value: number) => {
    setStored({ ...stored, periodDays: Math.max(1, Math.round(value)) });
  };

  const setInstallments = (supplier: string, value: number) => {
    setStored({
      ...stored,
      installmentsBySupplier: {
        ...installmentsBySupplier,
        [supplier]: Math.max(1, Math.round(value)),
      },
    });
  };

  const hasCustomSettings =
    periodDays !== DEFAULT_STORED_STATE.periodDays ||
    Object.values(installmentsBySupplier).some((v) => v > 1);

  const handleReset = () => setStored(DEFAULT_STORED_STATE);

  return (
    <div className="space-y-4 rounded-2xl border border-[var(--border)] bg-[var(--card)] px-4 py-4 shadow-sm sm:px-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-[var(--primary)]">
            Capital de giro necessário
          </h2>
          <p className="mt-0.5 max-w-xl text-xs text-[var(--muted-foreground)]">
            Estoque necessário (média/dia × dias) × custo unitário cadastrado
            (NF ou compra + ICMS-ST) ÷ parcelas do fornecedor. Não considera
            produtos excluídos da simulação acima; pausados seguem o switch
            &quot;Mostrar pausados&quot;.
          </p>
        </div>
        {hasCustomSettings && (
          <button
            type="button"
            onClick={handleReset}
            className="inline-flex shrink-0 cursor-pointer items-center gap-1.5 rounded-md border border-[var(--border)] px-2.5 py-1 text-xs font-medium hover:bg-[var(--muted)]"
          >
            <RotateCcw className="size-3.5" aria-hidden />
            Resetar período/parcelas
          </button>
        )}
      </div>

      <div className="rounded-xl border border-[var(--border)] bg-[var(--muted)]/30 px-4 py-3">
        <div className="text-xs font-medium text-[var(--muted-foreground)]">
          Capital necessário para {periodDays} dias
        </div>
        <div className="mt-1 text-3xl font-bold tracking-tight text-[var(--primary)]">
          {fmtBrl(totalCapital)}
        </div>
      </div>

      <ItemListSearch
        value={searchQuery}
        onChange={setSearchQuery}
        filteredCount={capitalRows.length}
        totalCount={allCapitalRows.length}
        entitySingular="produto"
        entityPlural="produtos"
        className="sm:max-w-sm"
      />

      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-medium text-[var(--muted-foreground)]">
          Período:
        </span>
        {PERIOD_PRESETS.map((preset) => (
          <button
            key={preset}
            type="button"
            onClick={() => setPeriodDays(preset)}
            className={cn(
              "cursor-pointer rounded-md border px-2.5 py-1 text-xs font-medium",
              periodDays === preset
                ? "border-[var(--primary)] bg-[var(--primary)] text-[var(--primary-foreground)]"
                : "border-[var(--border)] hover:bg-[var(--muted)]",
            )}
          >
            {preset}d
          </button>
        ))}
        <FormInput
          type="number"
          min="1"
          step="1"
          value={periodDays}
          onChange={(e) => {
            const value = e.target.valueAsNumber;
            if (Number.isFinite(value)) setPeriodDays(value);
          }}
          className="w-20"
          inputClassName="h-8 px-2 py-0.5 text-right text-sm tabular-nums"
        />
        <span className="text-xs text-[var(--muted-foreground)]">dias</span>
      </div>

      {suppliers.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-medium text-[var(--muted-foreground)]">
            Parcelamento por fornecedor (boleto) — 1x = à vista
          </p>
          <div className="flex flex-wrap gap-2">
            {suppliers.map((supplier) => (
              <div
                key={supplier}
                className="flex items-center gap-1.5 rounded-md border border-[var(--border)] bg-[var(--muted)]/30 px-2 py-1"
              >
                <span className="text-xs">{supplier}</span>
                <FormInput
                  type="number"
                  min="1"
                  step="1"
                  value={installmentsBySupplier[supplier] ?? 1}
                  onChange={(e) => {
                    const value = e.target.valueAsNumber;
                    if (Number.isFinite(value)) setInstallments(supplier, value);
                  }}
                  className="w-14"
                  inputClassName="h-7 px-1.5 py-0 text-right text-xs tabular-nums"
                />
                <span className="text-xs text-[var(--muted-foreground)]">parcelas</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {missingCostSkus.length > 0 && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-100">
          {missingCostSkus.length} produto{missingCostSkus.length !== 1 ? "s" : ""} sem
          custo cadastrado — não {missingCostSkus.length !== 1 ? "entram" : "entra"} neste
          total (capital pode estar subestimado):{" "}
          <span className="font-mono">{missingCostSkus.slice(0, 6).join(", ")}</span>
          {missingCostSkus.length > 6 && ` +${missingCostSkus.length - 6}`}.{" "}
          <Link href="/dashboard/produtos" className="underline font-medium">
            Cadastrar custo
          </Link>
        </div>
      )}

      {capitalRows.length === 0 && allCapitalRows.length > 0 && (
        <p className="py-4 text-center text-sm text-[var(--muted-foreground)]">
          {itemListSearchEmptyMessage(searchQuery, "produto")}
        </p>
      )}

      {capitalRows.length > 0 && <WorkingCapitalTable rows={capitalRows} />}

      <p className="text-right text-xs text-[var(--muted-foreground)]">
        {rows.length} produto{rows.length !== 1 ? "s" : ""} no total
        {excludedCount > 0 &&
          ` · ${excludedCount} não considerado${excludedCount !== 1 ? "s" : ""}`}
        {missingCostSkus.length > 0 &&
          ` · ${missingCostSkus.length} sem custo cadastrado`}
      </p>
    </div>
  );
}
