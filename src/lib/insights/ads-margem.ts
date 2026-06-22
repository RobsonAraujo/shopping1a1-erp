import type { FinancialEvaluationRow } from "@/lib/financial-evaluation-data";
import type { AdsMargem } from "./types";

export function buildAdsMargem(rows: FinancialEvaluationRow[]): AdsMargem[] {
  return rows
    .filter((row) => {
      if (!row.hasActiveAds) return false;
      const tacos = row.tacosPercent;
      const baseMargin = row.breakdown?.marginPercent ?? null;
      if (tacos === null || baseMargin === null) return false;
      return tacos > baseMargin;
    })
    .map((row) => ({
      mlItemId: row.mlItemId,
      title: row.title,
      sku: row.sku,
      salePrice: row.salePrice,
      tacosPercent: row.tacosPercent,
      marginAfterAdsPercent: row.marginAfterAdsPercent,
      marginAfterAdsValue: row.marginAfterAdsValue,
      hasActiveAds: row.hasActiveAds,
      baseMarginPercent: row.breakdown?.marginPercent ?? null,
    }))
    .sort((a, b) => {
      const wasted = (b.tacosPercent ?? 0) - (b.baseMarginPercent ?? 0);
      const wastedA = (a.tacosPercent ?? 0) - (a.baseMarginPercent ?? 0);
      return wasted - wastedA;
    });
}
