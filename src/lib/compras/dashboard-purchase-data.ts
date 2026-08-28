import { loadLatestCatalogCompetitionSnapshots } from "@/lib/catalog-competition";
import {
  fetchCategoriesByIds,
  fetchOperationalListingIds,
  fetchItemsByIdsBatched,
  fetchUnitsSoldForItemsInWindowBatched,
} from "@/lib/mercadolibre/api";
import { formatCategoryPath } from "@/lib/mercadolibre/category-labels";
import { mlAvailableStockUnits } from "@/lib/mercadolibre/ml-available-stock";
import { getItemSku, getSkuSupplier, isKitItem } from "@/lib/mercadolibre/item-sku";
import {
  buildPurchasePlan,
  computePurchaseAnalysis,
  type PurchaseAnalysisSettings,
} from "@/lib/purchase-analysis";
import {
  loadOperationalSettings,
  toPurchaseAnalysisValues,
  toStockPlanningValues,
} from "@/lib/operational-settings";
import type {
  PurchaseAnalysisItemRow,
} from "@/lib/purchase-analysis-rows";
import { prisma } from "@/lib/db";
import { Prisma } from "@/generated/prisma/client";
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
export { buildSupplierSummaries } from "@/lib/purchase-analysis-rows";
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

type LatestPurchaseCycleRow = {
  ml_item_id: string;
  status: string;
  completed_ml_qty: number | null;
  completed_warehouse_qty: number | null;
  completed_lead_time_days: number | null;
  updated_at: Date;
};

/**
 * Só o ciclo de compra ativo e o completado mais recente por item — via
 * DISTINCT ON, evitando trazer o histórico inteiro de `replenishment_cycles`
 * (nunca purgado, cresce sem limite) a cada carregamento do dashboard de
 * Compras. Mesmo padrão de loadLatestCatalogCompetitionSnapshots.
 */
async function loadLatestPurchaseCyclesByItem(
  organizationId: string,
  mlItemIds: string[],
) {
  if (mlItemIds.length === 0) return [];

  const columns = Prisma.sql`
      ml_item_id, status, completed_ml_qty, completed_warehouse_qty,
      completed_lead_time_days, updated_at`;

  const rows = await prisma.$queryRaw<LatestPurchaseCycleRow[]>(Prisma.sql`
    (SELECT DISTINCT ON (ml_item_id) ${columns}
    FROM replenishment_cycles
    WHERE organization_id = ${organizationId}
      AND ml_item_id IN (${Prisma.join(mlItemIds)})
      AND kind::text = 'purchase'
      AND status::text != 'completed'
    ORDER BY ml_item_id, updated_at DESC)

    UNION ALL

    (SELECT DISTINCT ON (ml_item_id) ${columns}
    FROM replenishment_cycles
    WHERE organization_id = ${organizationId}
      AND ml_item_id IN (${Prisma.join(mlItemIds)})
      AND kind::text = 'purchase'
      AND status::text = 'completed'
    ORDER BY ml_item_id, updated_at DESC)
  `);

  return rows.map((row) => ({
    mlItemId: row.ml_item_id,
    status: row.status,
    completedMlQty: row.completed_ml_qty,
    completedWarehouseQty: row.completed_warehouse_qty,
    completedLeadTimeDays: row.completed_lead_time_days,
    updatedAt: row.updated_at,
  }));
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
  organizationId: string,
) {
  const operationalSettings = await loadOperationalSettings(organizationId);
  const stockPlanning = toStockPlanningValues(operationalSettings);
  const purchaseAnalysisSettings: PurchaseAnalysisSettings = {
    stockPlanning,
    purchaseAnalysis: toPurchaseAnalysisValues(operationalSettings),
  };
  const windowDays = stockPlanning.salesAverageWindowDays;
  const dateField = stockPlanning.salesWindowDateField;

  const allIds = await fetchOperationalListingIds(token, userId, organizationId);
  const [rawItems, salesByItem, warehouseStocks, replenishmentCycles, latestSnapshotById] =
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
        where: { organizationId, mlItemId: { in: allIds } },
        select: {
          mlItemId: true,
          quantity: true,
          purchaseLeadTimeDays: true,
          targetCoverageDays: true,
        },
      }),
      loadLatestPurchaseCyclesByItem(organizationId, allIds),
      loadLatestCatalogCompetitionSnapshots(allIds),
    ]);
  const items = rawItems.filter((item) => !isKitItem(item));

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
    Object.entries(latestSnapshotById).map(([mlItemId, s]) => [mlItemId, s.status]),
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
    const plan = buildPurchasePlan(totalStock, unitsSold, purchaseLead, stockPlanning);
    const analysis = computePurchaseAnalysis(
      {
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
      },
      purchaseAnalysisSettings,
    );

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
    purchaseAnalysisSettings,
  };
}

