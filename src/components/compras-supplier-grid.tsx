"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import {
  AlertTriangle,
  ChevronRight,
  ShoppingCart,
  TrendingUp,
} from "lucide-react";
import type {
  PurchaseAnalysisItemRow,
  SupplierSummary,
} from "@/lib/purchase-analysis-rows";
import {
  buildPurchaseAnalysisInputFromRow,
  computePurchaseAnalysis,
  supplierPathSegment,
} from "@/lib/purchase-analysis";
import {
  PurchaseCoverageBufferControl,
  usePurchaseCoverageBufferDays,
} from "@/components/purchase-coverage-buffer";
import {
  ItemListSearch,
  itemListSearchEmptyMessage,
} from "@/components/item-list-search";
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

function SupplierMetric({
  label,
  value,
  highlight = false,
}: {
  label: string;
  value: number;
  highlight?: boolean;
}) {
  return (
    <div
      className={cn(
        "rounded-lg px-3 py-2.5",
        highlight ? "bg-rose-50/80" : "bg-[var(--muted)]/50",
      )}
    >
      <p className="text-[11px] font-medium text-[var(--muted-foreground)]">
        {label}
      </p>
      <p
        className={cn(
          "mt-0.5 text-lg font-bold tabular-nums leading-none",
          highlight ? "text-rose-900" : "text-[var(--foreground)]",
        )}
      >
        {value.toLocaleString("pt-BR")}
      </p>
    </div>
  );
}

export function ComprasSupplierGrid({
  summaries,
  rows,
}: ComprasSupplierGridProps) {
  const { bufferDays, setBufferDays } = usePurchaseCoverageBufferDays();
  const [searchQuery, setSearchQuery] = useState("");

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
      const supplierRows = rows.filter((r) => r.supplier === summary.supplier);
      map.set(
        summary.supplier,
        suggestedUnitsForSupplier(supplierRows, bufferDays),
      );
    }
    return map;
  }, [summaries, rows, bufferDays]);

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
        <OverviewStat label="Produtos ativos" value={overview.totalProducts} />
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
        <div>
          <h2 className="text-sm font-semibold uppercase tracking-wide text-[var(--muted-foreground)]">
            Parâmetros
          </h2>
          <p className="mt-1 text-sm text-[var(--muted-foreground)]">
            Ajuste o buffer de estoque — vale para todos os fornecedores.
          </p>
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
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {filteredSummaries.map((summary) => {
            const hasAlert = summary.hasActiveAlert;
            const suggestedUnitsTotal =
              suggestedBySupplier.get(summary.supplier) ??
              summary.suggestedUnitsTotal;

            return (
              <Link
                key={summary.supplier}
                href={`/dashboard/compras/${supplierPathSegment(summary.supplier)}`}
                className={cn(
                  "group flex flex-col overflow-hidden rounded-xl border bg-[var(--card)] shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md",
                  hasAlert
                    ? "border-rose-200/80 hover:border-rose-300"
                    : "border-[var(--border)] hover:border-[var(--primary)]/30",
                )}
              >
                <div className="p-5">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex min-w-0 items-center gap-3">
                      <span
                        className={cn(
                          "flex h-10 w-10 shrink-0 items-center justify-center rounded-xl",
                          hasAlert
                            ? "bg-rose-100 text-rose-900"
                            : "bg-sky-100 text-sky-900",
                        )}
                      >
                        <ShoppingCart className="size-5" aria-hidden />
                      </span>
                      <div className="min-w-0">
                        <h3 className="truncate text-lg font-semibold text-[var(--primary)]">
                          {summary.supplier}
                        </h3>
                        <p className="text-xs text-[var(--muted-foreground)]">
                          {summary.totalProducts}{" "}
                          {summary.totalProducts === 1
                            ? "produto"
                            : "produtos"}
                        </p>
                      </div>
                    </div>
                    {hasAlert ? (
                      <Badge variant="warning" className="shrink-0 gap-1">
                        <AlertTriangle className="size-3" aria-hidden />
                        Alerta
                      </Badge>
                    ) : null}
                  </div>

                  <div className="mt-4 grid grid-cols-2 gap-2">
                    <SupplierMetric
                      label="Á comprar"
                      value={summary.urgentCount}
                      highlight={summary.urgentCount > 0}
                    />
                    <SupplierMetric
                      label="Boa rotação"
                      value={summary.highRotationCount}
                    />
                    <SupplierMetric
                      label="Sem vendas"
                      value={summary.noSalesCount}
                    />
                    <SupplierMetric
                      label="Un. sugeridas"
                      value={suggestedUnitsTotal}
                    />
                  </div>
                </div>

                <div className="flex items-center justify-between gap-3 border-t border-[var(--border)] bg-[var(--muted)]/30 px-5 py-3">
                  <span className="flex items-center gap-1.5 text-sm text-[var(--muted-foreground)]">
                    <TrendingUp className="size-3.5 shrink-0" aria-hidden />
                    <span>
                      <span className="font-semibold text-[var(--foreground)]">
                        {suggestedUnitsTotal.toLocaleString("pt-BR")}
                      </span>{" "}
                      un. para repor
                    </span>
                  </span>
                  <span className="flex items-center gap-1 text-xs font-medium text-[var(--primary)] opacity-0 transition-opacity group-hover:opacity-100">
                    Analisar
                    <ChevronRight className="size-4" aria-hidden />
                  </span>
                </div>
              </Link>
            );
          })}
        </div>
        )}
      </section>
    </div>
  );
}
