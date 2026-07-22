/**
 * Capital de giro necessário: quanto custa comprar estoque suficiente para
 * cobrir N dias de vendas dos produtos ATIVOS (pausados e produtos excluídos
 * da simulação de potencial de faturamento não entram). O custo unitário
 * usado é o já cadastrado em "Meus produtos" — ver `stockReportUnitCostFromProduct`
 * em `src/lib/inventory-stock-report.ts` para a regra NF vs compra+ST.
 */
import { getSkuSupplier } from "@/lib/mercadolibre/item-sku";
import type { WorkingCapitalRow } from "@/lib/insights/types";

export type WorkingCapitalInputRow = {
  mlItemId: string;
  sku: string | null;
  title: string;
  status: string;
  effectiveDailyAvg: number;
  unitCost: number | null;
  hasIcmsSt: boolean;
  isExcluded: boolean;
};

export function buildWorkingCapitalRows(
  rows: WorkingCapitalInputRow[],
  periodDays: number,
  installmentsBySupplier: Record<string, number>,
): {
  rows: WorkingCapitalRow[];
  totalCapital: number;
  missingCostSkus: string[];
} {
  const considered = rows.filter(
    (r) => r.status === "active" && !r.isExcluded,
  );

  const missingCostSkus = considered
    .filter((r) => r.unitCost === null)
    .map((r) => r.sku ?? r.mlItemId);

  const workingCapitalRows: WorkingCapitalRow[] = considered
    .filter((r): r is WorkingCapitalInputRow & { unitCost: number } => r.unitCost !== null)
    .map((r) => {
      const supplier = getSkuSupplier(r.sku);
      const installments = Math.max(1, installmentsBySupplier[supplier] ?? 1);
      const unitsNeeded = Math.ceil(r.effectiveDailyAvg * periodDays);
      const grossCapital = unitsNeeded * r.unitCost;
      const effectiveCapital = grossCapital / installments;

      return {
        mlItemId: r.mlItemId,
        sku: r.sku,
        title: r.title,
        supplier,
        dailyAvg: r.effectiveDailyAvg,
        periodDays,
        unitsNeeded,
        unitCost: r.unitCost,
        hasIcmsSt: r.hasIcmsSt,
        grossCapital,
        installments,
        effectiveCapital,
      };
    });

  workingCapitalRows.sort((a, b) => b.effectiveCapital - a.effectiveCapital);

  const totalCapital = workingCapitalRows.reduce(
    (sum, r) => sum + r.effectiveCapital,
    0,
  );

  return { rows: workingCapitalRows, totalCapital, missingCostSkus };
}
