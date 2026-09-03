import { bestItemImageUrl } from "@/lib/mercadolibre/item-image";
import type { PurchaseAnalysisItemRow } from "@/lib/compras/purchase-analysis-rows";
import type { SlowMoverRow } from "./types";

export const DEFAULT_SLOW_MOVER_THRESHOLD_DAYS = 30;
export const MIN_LISTING_AGE_DAYS = 15;

function listingAgeDays(dateCreated: string | undefined): number | null {
  if (!dateCreated) return null;
  const created = new Date(dateCreated).getTime();
  if (Number.isNaN(created)) return null;
  return (Date.now() - created) / (1000 * 60 * 60 * 24);
}

function toSlowMoverRow(row: PurchaseAnalysisItemRow): SlowMoverRow {
  return {
    mlItemId: row.item.id,
    title: (row.item.title as string | undefined) ?? row.sku ?? row.item.id,
    imageUrl: bestItemImageUrl(row.item) ?? null,
    sku: row.sku,
    totalStock: row.totalStock,
    purchaseLeadTimeDays: row.purchaseLeadTimeDays,
    coverageDays: row.analysis.coverageDays,
    dailyAvg: row.analysis.dailyAvg,
    unitsSoldInWindow: row.analysis.unitsSoldInWindow,
    performanceTier: row.analysis.performanceTier,
    catalogListing: row.item.catalog_listing ?? false,
  };
}

/**
 * Mapeia todos os rows para SlowMoverRow (sem filtro de threshold) — apenas anúncios
 * ativos com pelo menos MIN_LISTING_AGE_DAYS dias de vida (evita alarme falso em anúncios recém-criados).
 */
export function mapToSlowMoverRows(rows: PurchaseAnalysisItemRow[]): SlowMoverRow[] {
  return rows
    .filter((r) => r.item.status === "active")
    .filter((r) => {
      const age = listingAgeDays(r.item.date_created);
      return age === null || age >= MIN_LISTING_AGE_DAYS;
    })
    .map(toSlowMoverRow);
}

/** Filtra `SlowMoverRow[]` já mapeados por threshold de cobertura (ou sem vendas). */
export function filterSlowMoverRows(rows: SlowMoverRow[], thresholdDays: number): SlowMoverRow[] {
  return rows.filter((r) => {
    if (r.performanceTier === "zero") return true;
    return r.coverageDays !== null && r.coverageDays > thresholdDays;
  });
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
