import type { PurchaseAnalysisItemRow } from "@/lib/purchase-analysis-rows";
import type { SlowMoverRow } from "./types";

export const DEFAULT_SLOW_MOVER_THRESHOLD_DAYS = 30;

function toSlowMoverRow(row: PurchaseAnalysisItemRow): SlowMoverRow {
  return {
    mlItemId: row.item.id,
    title: (row.item.title as string | undefined) ?? row.sku ?? row.item.id,
    sku: row.sku,
    totalStock: row.totalStock,
    purchaseLeadTimeDays: row.purchaseLeadTimeDays,
    coverageDays: row.analysis.coverageDays,
    dailyAvg: row.analysis.dailyAvg,
    unitsSoldInWindow: row.analysis.unitsSoldInWindow,
    performanceTier: row.analysis.performanceTier,
  };
}

/** Mapeia todos os rows para SlowMoverRow (sem filtro) — usado pelo client component. */
export function mapToSlowMoverRows(rows: PurchaseAnalysisItemRow[]): SlowMoverRow[] {
  return rows.map(toSlowMoverRow);
}

/** Filtra rows com cobertura acima do threshold ou sem vendas. */
export function buildSlowMoverRows(
  rows: PurchaseAnalysisItemRow[],
  thresholdDays: number,
): SlowMoverRow[] {
  return rows
    .filter((row) => {
      const { coverageDays, performanceTier } = row.analysis;
      if (performanceTier === "zero") return true;
      return coverageDays !== null && coverageDays > thresholdDays;
    })
    .map(toSlowMoverRow)
    .sort((a, b) => {
      if (a.coverageDays === null && b.coverageDays === null) return 0;
      if (a.coverageDays === null) return -1;
      if (b.coverageDays === null) return 1;
      return b.coverageDays - a.coverageDays;
    });
}
