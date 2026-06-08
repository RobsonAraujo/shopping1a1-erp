"use client";

import Link from "next/link";
import { useMemo } from "react";
import { ShoppingCart } from "lucide-react";
import type {
  PurchaseAnalysisItemRow,
  SupplierSummary,
} from "@/lib/dashboard-purchase-data";
import {
  buildPurchaseAnalysisInputFromRow,
  computePurchaseAnalysis,
  supplierPathSegment,
} from "@/lib/purchase-analysis";
import {
  PurchaseCoverageBufferControl,
  usePurchaseCoverageBufferDays,
} from "@/components/purchase-coverage-buffer";
import { Badge } from "@/components/ui/badge";

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

export function ComprasSupplierGrid({
  summaries,
  rows,
}: ComprasSupplierGridProps) {
  const { bufferDays, setBufferDays } = usePurchaseCoverageBufferDays();

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

  return (
    <div className="space-y-6">
      <PurchaseCoverageBufferControl
        bufferDays={bufferDays}
        onBufferDaysChange={setBufferDays}
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {summaries.map((summary) => {
          const hasAlert = summary.hasActiveAlert;
          const suggestedUnitsTotal =
            suggestedBySupplier.get(summary.supplier) ??
            summary.suggestedUnitsTotal;

          return (
            <Link
              key={summary.supplier}
              href={`/dashboard/compras/${supplierPathSegment(summary.supplier)}`}
              className="group rounded-xl border border-[var(--border)] bg-[var(--card)] p-5 shadow-sm transition-colors hover:border-[var(--primary)]/30 hover:bg-[var(--muted)]/20"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-2">
                  <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-sky-100 text-sky-900">
                    <ShoppingCart className="size-5" aria-hidden />
                  </span>
                  <h2 className="text-lg font-semibold text-[var(--primary)]">
                    {summary.supplier}
                  </h2>
                </div>
                {hasAlert ? (
                  <Badge variant="warning" className="shrink-0">
                    Alerta
                  </Badge>
                ) : null}
              </div>

              <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
                <div>
                  <dt className="text-[var(--muted-foreground)]">Produtos</dt>
                  <dd className="font-semibold tabular-nums">
                    {summary.totalProducts}
                  </dd>
                </div>
                <div>
                  <dt className="text-[var(--muted-foreground)]">
                    Á Comprar
                  </dt>
                  <dd className="font-semibold tabular-nums text-rose-900">
                    {summary.urgentCount}
                  </dd>
                </div>
                <div>
                  <dt className="text-[var(--muted-foreground)]">
                    Boa rotação
                  </dt>
                  <dd className="font-semibold tabular-nums">
                    {summary.highRotationCount}
                  </dd>
                </div>
                <div>
                  <dt className="text-[var(--muted-foreground)]">
                    Sem vendas
                  </dt>
                  <dd className="font-semibold tabular-nums">
                    {summary.noSalesCount}
                  </dd>
                </div>
              </dl>

              <p className="mt-4 text-sm text-[var(--muted-foreground)]">
                <span className="font-semibold text-[var(--foreground)]">
                  {suggestedUnitsTotal}
                </span>{" "}
                un. sugeridas no total
              </p>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
