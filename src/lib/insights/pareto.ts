import type { TaxReportPayload } from "@/lib/tax-report/types";
import type { ParetoRow } from "./types";

export function buildParetoRows(payload: TaxReportPayload): ParetoRow[] {
  const receitaTotal = payload.porSku.reduce((s, sku) => s + sku.receitaTotal, 0);
  if (receitaTotal <= 0) return [];

  const sorted = [...payload.porSku].sort((a, b) => b.receitaTotal - a.receitaTotal);

  let acumulado = 0;
  return sorted.map((sku) => {
    const receitaPercent = (sku.receitaTotal / receitaTotal) * 100;
    acumulado += receitaPercent;
    return {
      sku: sku.sku,
      receitaTotal: sku.receitaTotal,
      unidadesVendidas: sku.unidadesVendidas,
      impostoTotal: sku.impostoTotal,
      receitaPercent,
      receitaAcumuladaPercent: acumulado,
    };
  });
}

export function paretoConcentration(rows: ParetoRow[]): {
  top3Percent: number;
  skusFor80Percent: number;
} {
  const top3Percent = rows.slice(0, 3).reduce((s, r) => s + r.receitaPercent, 0);
  const skusFor80Percent = rows.findIndex((r) => r.receitaAcumuladaPercent >= 80) + 1;
  return { top3Percent, skusFor80Percent: skusFor80Percent > 0 ? skusFor80Percent : rows.length };
}
