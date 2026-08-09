"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { AlertTriangle, ChevronRight } from "lucide-react";
import type {
  PurchaseAnalysisItemRow,
  SupplierSummary,
} from "@/lib/purchase-analysis-rows";
import {
  buildPurchaseAnalysisInputFromRow,
  computePurchaseAnalysis,
  supplierPathSegment,
} from "@/lib/purchase-analysis";
import { buildSupplierSummaries } from "@/lib/purchase-analysis-rows";
import {
  PurchaseCoverageBufferControl,
  usePurchaseCoverageBufferDays,
} from "@/components/compras/purchase-coverage-buffer";
import {
  ItemListSearch,
  itemListSearchEmptyMessage,
} from "@/components/item-list-search";
import {
  ShowPausedListingsSwitch,
  filterListingsByPausedVisibility,
  isPausedListingStatus,
} from "@/components/show-paused-listings-switch";
import { normalizeItemListSearchQuery } from "@/lib/item-list-search";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

type ComprasSupplierGridProps = {
  summaries: SupplierSummary[];
  rows: PurchaseAnalysisItemRow[];
};

function suggestedUnitsForSupplier(
  supplierRows: PurchaseAnalysisItemRow[],
  coverageBufferDays: number,
): number {
  return supplierRows
    .map((row) =>
      computePurchaseAnalysis(
        buildPurchaseAnalysisInputFromRow(row, coverageBufferDays),
      ),
    )
    .filter((analysis) => analysis.recommendation === "comprar")
    .reduce((sum, analysis) => sum + analysis.suggestedQty, 0);
}

function OverviewStat({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value: number;
  tone?: "default" | "urgent" | "accent";
}) {
  return (
    <Card>
      <CardContent className="p-4">
        <p className="text-sm text-[var(--muted-foreground)]">{label}</p>
        <p
          className={cn(
            "mt-1 text-2xl font-bold tabular-nums",
            tone === "urgent" && "text-rose-900",
            tone === "accent" && "text-sky-900",
          )}
        >
          {value.toLocaleString("pt-BR")}
        </p>
      </CardContent>
    </Card>
  );
}

export function ComprasSupplierGrid({
  summaries: _summaries,
  rows,
}: ComprasSupplierGridProps) {
  const { bufferDays, setBufferDays } = usePurchaseCoverageBufferDays();
  const [searchQuery, setSearchQuery] = useState("");
  const [showPaused, setShowPaused] = useState(false);

  const visibleRows = useMemo(
    () =>
      filterListingsByPausedVisibility(
        rows,
        showPaused,
        (row) => row.item.status,
      ),
    [rows, showPaused],
  );
  const additionalPausedSupplierCount = useMemo(() => {
    const suppliersWithActive = new Set<string>();
    const suppliersWithAny = new Set<string>();
    for (const row of rows) {
      suppliersWithAny.add(row.supplier);
      if (!isPausedListingStatus(row.item.status)) {
        suppliersWithActive.add(row.supplier);
      }
    }
    let extra = 0;
    for (const supplier of suppliersWithAny) {
      if (!suppliersWithActive.has(supplier)) extra += 1;
    }
    return extra;
  }, [rows]);
  const summaries = useMemo(
    () =>
      buildSupplierSummaries(
        visibleRows,
        (row) => row.plan.needsPurchaseAttention,
      ),
    [visibleRows],
  );

  const filteredSummaries = useMemo(() => {
    const normalized = normalizeItemListSearchQuery(searchQuery);
    if (!normalized) return summaries;
    return summaries.filter((summary) =>
      summary.supplier.toLowerCase().includes(normalized),
    );
  }, [summaries, searchQuery]);

  const suggestedBySupplier = useMemo(() => {
    const map = new Map<string, number>();
    for (const summary of summaries) {
      const supplierRows = visibleRows.filter(
        (r) => r.supplier === summary.supplier,
      );
      map.set(
        summary.supplier,
        suggestedUnitsForSupplier(supplierRows, bufferDays),
      );
    }
    return map;
  }, [summaries, visibleRows, bufferDays]);

  const overview = useMemo(() => {
    let totalProducts = 0;
    let totalUrgent = 0;
    let totalSuggested = 0;
    let alertCount = 0;

    for (const summary of summaries) {
      totalProducts += summary.totalProducts;
      totalUrgent += summary.urgentCount;
      totalSuggested +=
        suggestedBySupplier.get(summary.supplier) ??
        summary.suggestedUnitsTotal;
      if (summary.hasActiveAlert) alertCount += 1;
    }

    return {
      totalProducts,
      totalUrgent,
      totalSuggested,
      alertCount,
    };
  }, [summaries, suggestedBySupplier]);

  return (
    <div className="space-y-8">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <OverviewStat label="Fornecedores" value={summaries.length} />
        <OverviewStat label="Produtos" value={overview.totalProducts} />
        <OverviewStat
          label="Á comprar (urgente)"
          value={overview.totalUrgent}
          tone="urgent"
        />
        <OverviewStat
          label="Un. sugeridas (total)"
          value={overview.totalSuggested}
          tone="accent"
        />
      </div>

      <section className="space-y-3">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold uppercase tracking-wide text-[var(--muted-foreground)]">
              Parâmetros
            </h2>
            <p className="mt-1 text-sm text-[var(--muted-foreground)]">
              Ajuste o buffer de estoque — vale para todos os fornecedores.
            </p>
          </div>
          <ShowPausedListingsSwitch
            checked={showPaused}
            onCheckedChange={setShowPaused}
            pausedCount={additionalPausedSupplierCount}
            disabled={rows.length === 0}
          />
        </div>
        <PurchaseCoverageBufferControl
          bufferDays={bufferDays}
          onBufferDaysChange={setBufferDays}
        />
      </section>

      <section className="space-y-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-[var(--foreground)]">
              Fornecedores
            </h2>
            <p className="mt-1 text-sm text-[var(--muted-foreground)]">
              {filteredSummaries.length}{" "}
              {filteredSummaries.length === 1 ? "fornecedor" : "fornecedores"}
              {searchQuery.trim() && filteredSummaries.length !== summaries.length
                ? ` (de ${summaries.length})`
                : ""}
              {overview.alertCount > 0
                ? ` · ${overview.alertCount} com alerta de compra`
                : ""}
            </p>
          </div>
        </div>

        <ItemListSearch
          value={searchQuery}
          onChange={setSearchQuery}
          filteredCount={filteredSummaries.length}
          totalCount={summaries.length}
          placeholder="Buscar fornecedor…"
          entitySingular="fornecedor"
          entityPlural="fornecedores"
        />

        {filteredSummaries.length === 0 ? (
          <p className="rounded-lg border border-dashed border-[var(--border)] bg-[var(--muted)]/30 px-4 py-8 text-center text-sm text-[var(--muted-foreground)]">
            {itemListSearchEmptyMessage(searchQuery, "fornecedor")}
          </p>
        ) : (
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {filteredSummaries.map((summary) => {
              const hasAlert = summary.hasActiveAlert;

              return (
                <Link
                  key={summary.supplier}
                  href={`/dashboard/compras/${supplierPathSegment(summary.supplier)}`}
                  className={cn(
                    "group flex items-center gap-3 rounded-lg border bg-[var(--card)] px-3.5 py-3 transition-colors hover:bg-[var(--muted)]/40",
                    hasAlert
                      ? "border-rose-200/80 hover:border-rose-300"
                      : "border-[var(--border)] hover:border-[var(--primary)]/30",
                  )}
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <h3 className="truncate font-medium text-[var(--foreground)]">
                        {summary.supplier}
                      </h3>
                      {hasAlert ? (
                        <Badge
                          variant="warning"
                          className="h-5 shrink-0 gap-1 px-1.5 text-[10px]"
                        >
                          <AlertTriangle className="size-3" aria-hidden />
                          Alerta
                        </Badge>
                      ) : null}
                    </div>
                    <p className="mt-0.5 text-xs text-[var(--muted-foreground)]">
                      {summary.totalProducts}{" "}
                      {summary.totalProducts === 1 ? "produto" : "produtos"}
                    </p>
                  </div>
                  <ChevronRight
                    className="size-4 shrink-0 text-[var(--muted-foreground)] opacity-0 transition-opacity group-hover:opacity-100"
                    aria-hidden
                  />
                </Link>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
