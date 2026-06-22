import type { PurchaseAnalysisItemRow } from "@/lib/purchase-analysis-rows";
import type { RupturaRow } from "./types";

export function buildRupturaRows(rows: PurchaseAnalysisItemRow[]): RupturaRow[] {
  return rows
    .filter((row) => {
      const { coverageDays } = row.analysis;
      if (coverageDays === null) return false;
      const lead = row.purchaseLeadTimeDays;
      return lead > 0 && coverageDays < lead;
    })
    .map((row) => ({
      mlItemId: row.item.id,
      title: (row.item.title as string | undefined) ?? row.sku ?? row.item.id,
      sku: row.sku,
      totalStock: row.totalStock,
      purchaseLeadTimeDays: row.purchaseLeadTimeDays,
      coverageDays: row.analysis.coverageDays,
      dailyAvg: row.analysis.dailyAvg,
      unitsSoldInWindow: row.analysis.unitsSoldInWindow,
      performanceTier: row.analysis.performanceTier,
      catalogListing: row.item.catalog_listing ?? false,
    }))
    .sort((a, b) => {
      const da = a.coverageDays ?? 0;
      const db = b.coverageDays ?? 0;
      return da - db;
    });
}
