import type { ItemBody } from "@/lib/mercadolibre/types";
import {
  buildPurchasePlan,
  comparePurchaseAnalysisRows,
  decodeSupplierParam,
  type PurchaseAnalysisResult,
} from "@/lib/purchase-analysis";

export type PurchaseAnalysisItemRow = {
  item: ItemBody;
  sku: string | null;
  supplier: string;
  mlStock: number;
  warehouseStock: number;
  totalStock: number;
  unitsSold: number;
  purchaseLeadTimeDays: number;
  plan: ReturnType<typeof buildPurchasePlan>;
  analysis: PurchaseAnalysisResult;
  catalogStatus: string | null;
  categoryName: string | null;
  categoryPath: string | null;
  revenueLastMonth: number;
  revenueCurrentMonth: number;
  unitsSoldLastMonth: number;
  unitsSoldCurrentMonth: number;
  lastPurchasePrice: number | null;
  minAcceptablePrice: number | null;
  targetCoverageDays: number | null;
};

export type SupplierSummary = {
  supplier: string;
  totalProducts: number;
  urgentCount: number;
  highRotationCount: number;
  noSalesCount: number;
  suggestedUnitsTotal: number;
  hasActiveAlert: boolean;
};

export function mergeSupplierRevenueIntoRows(
  rows: PurchaseAnalysisItemRow[],
  lastMonth: Record<string, number>,
  currentMonth: Record<string, number>,
  unitsLastMonth: Record<string, number> = {},
  unitsCurrentMonth: Record<string, number> = {},
): PurchaseAnalysisItemRow[] {
  return rows.map((row) => ({
    ...row,
    revenueLastMonth: lastMonth[row.item.id] ?? 0,
    revenueCurrentMonth: currentMonth[row.item.id] ?? 0,
    unitsSoldLastMonth: unitsLastMonth[row.item.id] ?? 0,
    unitsSoldCurrentMonth: unitsCurrentMonth[row.item.id] ?? 0,
  }));
}

export function sumSupplierRevenue(rows: PurchaseAnalysisItemRow[]): {
  lastMonth: number;
  currentMonth: number;
} {
  return {
    lastMonth: rows.reduce((sum, row) => sum + row.revenueLastMonth, 0),
    currentMonth: rows.reduce((sum, row) => sum + row.revenueCurrentMonth, 0),
  };
}

export function filterRowsBySupplier(
  rows: PurchaseAnalysisItemRow[],
  supplierParam: string,
): PurchaseAnalysisItemRow[] {
  const supplier = decodeSupplierParam(supplierParam);
  return rows
    .filter((row) => row.supplier === supplier)
    .sort((a, b) =>
      comparePurchaseAnalysisRows(
        {
          purchaseIsOverdue: a.plan.purchaseIsOverdue,
          unitsSoldInWindow: a.unitsSold,
          suggestedQty: a.analysis.suggestedQty,
        },
        {
          purchaseIsOverdue: b.plan.purchaseIsOverdue,
          unitsSoldInWindow: b.unitsSold,
          suggestedQty: b.analysis.suggestedQty,
        },
      ),
    );
}
