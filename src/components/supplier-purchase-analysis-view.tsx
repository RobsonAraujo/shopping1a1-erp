"use client";

import { useMemo } from "react";
import type { PurchaseAnalysisItemRow } from "@/lib/dashboard-purchase-data";
import {
  buildPurchaseAnalysisInputFromRow,
  computePurchaseAnalysis,
} from "@/lib/purchase-analysis";
import {
  PurchaseCoverageBufferControl,
  usePurchaseCoverageBufferDays,
} from "@/components/purchase-coverage-buffer";
import { SupplierPurchaseAnalysisTable } from "@/components/supplier-purchase-analysis-table";
import { Card, CardContent } from "@/components/ui/card";

type SupplierPurchaseAnalysisViewProps = {
  rows: PurchaseAnalysisItemRow[];
};

function recomputeRowsWithBuffer(
  rows: PurchaseAnalysisItemRow[],
  coverageBufferDays: number,
): PurchaseAnalysisItemRow[] {
  return rows.map((row) => ({
    ...row,
    analysis: computePurchaseAnalysis(
      buildPurchaseAnalysisInputFromRow(row, coverageBufferDays),
    ),
  }));
}

export function SupplierPurchaseAnalysisView({
  rows,
}: SupplierPurchaseAnalysisViewProps) {
  const { bufferDays, setBufferDays } = usePurchaseCoverageBufferDays();

  const computedRows = useMemo(
    () => recomputeRowsWithBuffer(rows, bufferDays),
    [rows, bufferDays],
  );

  const urgentCount = computedRows.filter(
    (r) => r.analysis.purchaseStatus === "urgente",
  ).length;
  const highRotationCount = computedRows.filter(
    (r) => r.analysis.performanceTier === "alta",
  ).length;
  const noSalesCount = computedRows.filter(
    (r) => r.analysis.performanceTier === "zero",
  ).length;
  const suggestedUnitsTotal = computedRows
    .filter((r) => r.analysis.recommendation === "comprar")
    .reduce((sum, r) => sum + r.analysis.suggestedQty, 0);

  return (
    <div className="space-y-6">
      <PurchaseCoverageBufferControl
        bufferDays={bufferDays}
        onBufferDaysChange={setBufferDays}
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardContent className="p-4">
            <p className="text-sm text-[var(--muted-foreground)]">Á Comprar</p>
            <p className="text-2xl font-bold tabular-nums text-rose-900">
              {urgentCount}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-sm text-[var(--muted-foreground)]">
              Boa rotação
            </p>
            <p className="text-2xl font-bold tabular-nums">
              {highRotationCount}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-sm text-[var(--muted-foreground)]">Sem vendas</p>
            <p className="text-2xl font-bold tabular-nums">{noSalesCount}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-sm text-[var(--muted-foreground)]">
              Un. sugeridas
            </p>
            <p className="text-2xl font-bold tabular-nums">
              {suggestedUnitsTotal}
            </p>
          </CardContent>
        </Card>
      </div>

      <SupplierPurchaseAnalysisTable rows={computedRows} />
    </div>
  );
}
