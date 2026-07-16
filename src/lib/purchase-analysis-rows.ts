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

export function buildSupplierSummaries(
  rows: PurchaseAnalysisItemRow[],
  needsPurchase: (row: PurchaseAnalysisItemRow) => boolean,
): SupplierSummary[] {
  const bySupplier = new Map<string, PurchaseAnalysisItemRow[]>();
  for (const row of rows) {
    const group = bySupplier.get(row.supplier) ?? [];
    group.push(row);
    bySupplier.set(row.supplier, group);
  }

  type SortableSummary = SupplierSummary & {
    hasActiveAlert: boolean;
    urgentForSort: number;
  };

  const sortable: SortableSummary[] = [...bySupplier.entries()].map(
    ([supplier, supplierRows]) => {
      const urgentRows = supplierRows.filter(
        (r) => needsPurchase(r) && r.analysis.purchaseStatus === "urgente",
      );
      const highRotation = supplierRows.filter(
        (r) => r.analysis.performanceTier === "alta",
      );
      const noSales = supplierRows.filter(
        (r) => r.analysis.performanceTier === "zero",
      );
      const suggestedUnitsTotal = supplierRows
        .filter((r) => r.analysis.recommendation === "comprar")
        .reduce((sum, r) => sum + r.analysis.suggestedQty, 0);

      return {
        supplier,
        totalProducts: supplierRows.length,
        urgentCount: urgentRows.length,
        highRotationCount: highRotation.length,
        noSalesCount: noSales.length,
        suggestedUnitsTotal,
        hasActiveAlert: supplierRows.some(needsPurchase),
        urgentForSort: urgentRows.length,
      };
    },
  );

  sortable.sort((a, b) => {
    if (a.hasActiveAlert !== b.hasActiveAlert) {
      return a.hasActiveAlert ? -1 : 1;
    }
    if (b.urgentForSort !== a.urgentForSort) {
      return b.urgentForSort - a.urgentForSort;
    }
    return a.supplier.localeCompare(b.supplier, "pt-BR", {
      sensitivity: "base",
    });
  });

  return sortable.map(
    ({
      supplier,
      totalProducts,
      urgentCount,
      highRotationCount,
      noSalesCount,
      suggestedUnitsTotal,
      hasActiveAlert,
    }) => ({
      supplier,
      totalProducts,
      urgentCount,
      highRotationCount,
      noSalesCount,
      suggestedUnitsTotal,
      hasActiveAlert,
    }),
  );
}
