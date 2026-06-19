import { stockPlanningConfig } from "@/config/stock-planning";
import {
  fetchCategoriesByIds,
  fetchOperationalListingIds,
  fetchItemsByIdsBatched,
  fetchUnitsSoldForItemsInWindowBatched,
} from "@/lib/mercadolibre/api";
import { formatCategoryPath } from "@/lib/mercadolibre/category-labels";
import { mlAvailableStockUnits } from "@/lib/mercadolibre/ml-available-stock";
import { getItemSku, getSkuSupplier } from "@/lib/mercadolibre/item-sku";
import {
  buildPurchasePlan,
  computePurchaseAnalysis,
} from "@/lib/purchase-analysis";
import type {
  PurchaseAnalysisItemRow,
  SupplierSummary,
} from "@/lib/purchase-analysis-rows";
import { prisma } from "@/lib/db";
import {
  isActiveReplenishmentStatus,
  isCompletedCycleStillValid,
} from "@/lib/replenishment-cycle";
import type { ReplenishmentStatus } from "@/generated/prisma/client";
import type { ItemBody } from "@/lib/mercadolibre/types";

export type {
  PurchaseAnalysisItemRow,
  SupplierSummary,
} from "@/lib/purchase-analysis-rows";
export {
  filterRowsBySupplier,
  mergeSupplierRevenueIntoRows,
  sumSupplierRevenue,
} from "@/lib/purchase-analysis-rows";

export type WarehouseStockRow = {
  quantity: number;
  purchaseLeadTimeDays: number | null;
  targetCoverageDays: number | null;
};

function hasActiveReplenishmentBeyondAttention(
  mlItemId: string,
  cyclesByItem: Map<
    string,
    { activeStatus: string | null; latestCompleted: {
      completedMlQty: number | null;
      completedWarehouseQty: number | null;
      completedLeadTimeDays: number | null;
      status: string;
    } | null }
  >,
  item: ItemBody,
  warehouseStock: number,
  purchaseLead: number,
): boolean {
  const entry = cyclesByItem.get(mlItemId);
  if (!entry?.activeStatus) {
    if (entry?.latestCompleted) {
      const completed = entry.latestCompleted;
      if (
        completed.status === "completed" &&
        completed.completedMlQty !== null &&
        completed.completedWarehouseQty !== null &&
        isCompletedCycleStillValid(
          {
            id: "",
            mlItemId,
            kind: "purchase",
            status: "completed",
            triggerMlQty: 0,
            triggerWarehouseQty: 0,
            triggerLeadTimeDays: null,
            warehouseQtyAtOrder: null,
            mlQtyAtCollection: null,
            completedMlQty: completed.completedMlQty,
            completedWarehouseQty: completed.completedWarehouseQty,
            completedLeadTimeDays: completed.completedLeadTimeDays,
            completedAt: new Date(),
          },
          {
            mlQty: mlAvailableStockUnits(item),
            warehouseQty: warehouseStock,
            leadTimeDays: purchaseLead,
          },
        )
      ) {
        return true;
      }
    }
    return false;
  }
  return entry.activeStatus !== "attention";
}

function buildCyclesByItem(
  cycles: Array<{
    mlItemId: string;
    status: string;
    completedMlQty: number | null;
    completedWarehouseQty: number | null;
    completedLeadTimeDays: number | null;
    updatedAt: Date;
  }>,
) {
  const map = new Map<
    string,
    {
      activeStatus: string | null;
      latestCompleted: (typeof cycles)[number] | null;
    }
  >();

  const sorted = [...cycles].sort(
    (a, b) => b.updatedAt.getTime() - a.updatedAt.getTime(),
  );

  for (const cycle of sorted) {
    let entry = map.get(cycle.mlItemId);
    if (!entry) {
      entry = { activeStatus: null, latestCompleted: null };
      map.set(cycle.mlItemId, entry);
    }
    if (
      isActiveReplenishmentStatus(cycle.status as ReplenishmentStatus) &&
      !entry.activeStatus
    ) {
      entry.activeStatus = cycle.status;
    }
    if (cycle.status === "completed" && !entry.latestCompleted) {
      entry.latestCompleted = cycle;
    }
  }

  return map;
}

export async function loadDashboardPurchaseData(
  token: string,
  userId: number,
) {
  const windowDays = stockPlanningConfig.salesAverageWindowDays;
  const dateField = stockPlanningConfig.salesWindowDateField;

  const allIds = await fetchOperationalListingIds(token, userId);
  const [items, salesByItem, warehouseStocks, replenishmentCycles, snapshots] =
    await Promise.all([
      fetchItemsByIdsBatched(token, allIds),
      fetchUnitsSoldForItemsInWindowBatched(
        token,
        userId,
        allIds,
        windowDays,
        dateField,
      ),
      prisma.warehouseStock.findMany({
        where: { mlItemId: { in: allIds } },
        select: {
          mlItemId: true,
          quantity: true,
          purchaseLeadTimeDays: true,
          targetCoverageDays: true,
        },
      }),
      prisma.replenishmentCycle.findMany({
        where: { mlItemId: { in: allIds }, kind: "purchase" },
        select: {
          mlItemId: true,
          status: true,
          completedMlQty: true,
          completedWarehouseQty: true,
          completedLeadTimeDays: true,
          updatedAt: true,
        },
        orderBy: { updatedAt: "desc" },
      }),
      prisma.catalogCompetitionSnapshot.findMany({
        where: { mlItemId: { in: allIds } },
        orderBy: { snapshotAt: "desc" },
        distinct: ["mlItemId"],
        select: { mlItemId: true, status: true },
      }),
    ]);

  const warehouseById = Object.fromEntries(
    warehouseStocks.map((s) => [
      s.mlItemId,
      {
        quantity: s.quantity,
        purchaseLeadTimeDays: s.purchaseLeadTimeDays,
        targetCoverageDays: s.targetCoverageDays,
      } satisfies WarehouseStockRow,
    ]),
  );
  const catalogStatusById = Object.fromEntries(
    snapshots.map((s) => [s.mlItemId, s.status]),
  );

  const categoryIds = [
    ...new Set(
      items
        .map((item) => item.category_id)
        .filter((id): id is string => Boolean(id)),
    ),
  ];
  const categoriesById = await fetchCategoriesByIds(token, categoryIds);

  const cyclesByItem = buildCyclesByItem(replenishmentCycles);

  const rows: PurchaseAnalysisItemRow[] = items.map((item) => {
    const sku = getItemSku(item);
    const supplier = getSkuSupplier(sku);
    const warehouse = warehouseById[item.id];
    const warehouseStock = warehouse?.quantity ?? 0;
    const purchaseLead = warehouse?.purchaseLeadTimeDays ?? 0;
    const mlStock = mlAvailableStockUnits(item);
    const totalStock = mlStock + warehouseStock;
    const unitsSold = salesByItem[item.id] ?? 0;
    const plan = buildPurchasePlan(totalStock, unitsSold, purchaseLead);
    const analysis = computePurchaseAnalysis({
      unitsSoldInWindow: unitsSold,
      totalStock,
      purchaseLeadTimeDays: purchaseLead,
      purchaseIsOverdue: plan.purchaseIsOverdue,
      needsPurchaseAttention: plan.needsPurchaseAttention,
      costProfile: warehouse
        ? {
            targetCoverageDays: warehouse.targetCoverageDays,
          }
        : null,
    });

    const category = item.category_id
      ? categoriesById[item.category_id]
      : undefined;

    return {
      item,
      sku,
      supplier,
      mlStock,
      warehouseStock,
      totalStock,
      unitsSold,
      purchaseLeadTimeDays: purchaseLead,
      plan,
      analysis,
      catalogStatus: catalogStatusById[item.id] ?? null,
      categoryName: category?.name ?? item.category_id ?? null,
      categoryPath: category
        ? formatCategoryPath(category)
        : (item.category_id ?? null),
      revenueLastMonth: 0,
      revenueCurrentMonth: 0,
      unitsSoldLastMonth: 0,
      unitsSoldCurrentMonth: 0,
      targetCoverageDays: warehouse?.targetCoverageDays ?? null,
    };
  });

  function needsPurchase(row: PurchaseAnalysisItemRow): boolean {
    const purchaseLead =
      warehouseById[row.item.id]?.purchaseLeadTimeDays ?? 0;
    if (
      hasActiveReplenishmentBeyondAttention(
        row.item.id,
        cyclesByItem,
        row.item,
        row.warehouseStock,
        purchaseLead,
      )
    ) {
      return false;
    }
    return row.plan.needsPurchaseAttention;
  }

  return {
    items,
    salesByItem,
    warehouseById,
    rows,
    needsPurchase,
  };
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

