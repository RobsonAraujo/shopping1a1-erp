import { stockPlanningConfig } from "@/config/stock-planning";
import {
  fetchAllUserItemIds,
  fetchCategoriesByIds,
  fetchItemsByIdsBatched,
  fetchUnitsSoldForItemsInWindowBatched,
} from "@/lib/mercadolibre/api";
import { formatCategoryPath } from "@/lib/mercadolibre/category-labels";
import { mlAvailableStockUnits } from "@/lib/mercadolibre/ml-available-stock";
import { getItemSku, getSkuSupplier } from "@/lib/mercadolibre/item-sku";
import {
  buildPurchasePlan,
  comparePurchaseAnalysisRows,
  computePurchaseAnalysis,
  decodeSupplierParam,
  type PurchaseAnalysisResult,
} from "@/lib/purchase-analysis";
import { prisma } from "@/lib/db";
import type { ItemBody } from "@/lib/mercadolibre/types";
import type { StockAttentionAcknowledgementView } from "@/components/dashboard-attention-panel";

export type WarehouseStockRow = {
  quantity: number;
  purchaseLeadTimeDays: number | null;
  lastPurchasePrice: number | null;
  minAcceptablePrice: number | null;
  targetCoverageDays: number | null;
};

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

function hasValidPurchaseAck(
  item: ItemBody,
  warehouseStock: number,
  purchaseLead: number,
  acknowledgements: StockAttentionAcknowledgementView[],
  optimisticHidden?: Set<string>,
): boolean {
  const key = `purchase:${item.id}`;
  if (optimisticHidden?.has(key)) return true;
  const ack = acknowledgements.find(
    (a) => a.mlItemId === item.id && a.kind === "purchase",
  );
  if (!ack) return false;
  return (
    ack.mlAvailableQuantity === item.available_quantity &&
    ack.warehouseQuantity === warehouseStock &&
    (ack.purchaseLeadTimeDays ?? 0) === purchaseLead
  );
}

function decimalToNumber(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

export async function loadDashboardPurchaseData(
  token: string,
  userId: number,
) {
  const windowDays = stockPlanningConfig.salesAverageWindowDays;
  const dateField = stockPlanningConfig.salesWindowDateField;

  const allIds = await fetchAllUserItemIds(token, userId, { status: "active" });
  const [items, salesByItem, warehouseStocks, acknowledgements, snapshots] =
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
          lastPurchasePrice: true,
          minAcceptablePrice: true,
          targetCoverageDays: true,
        },
      }),
      prisma.stockAttentionAcknowledgement.findMany({
        where: { mlItemId: { in: allIds }, kind: "purchase" },
        select: {
          mlItemId: true,
          kind: true,
          mlAvailableQuantity: true,
          warehouseQuantity: true,
          purchaseLeadTimeDays: true,
        },
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
        lastPurchasePrice: decimalToNumber(s.lastPurchasePrice),
        minAcceptablePrice: decimalToNumber(s.minAcceptablePrice),
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
      mlPrice: item.price,
      costProfile: warehouse
        ? {
            lastPurchasePrice: warehouse.lastPurchasePrice,
            minAcceptablePrice: warehouse.minAcceptablePrice,
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
      lastPurchasePrice: warehouse?.lastPurchasePrice ?? null,
      minAcceptablePrice: warehouse?.minAcceptablePrice ?? null,
      targetCoverageDays: warehouse?.targetCoverageDays ?? null,
    };
  });

  function needsPurchase(row: PurchaseAnalysisItemRow): boolean {
    const purchaseLead =
      warehouseById[row.item.id]?.purchaseLeadTimeDays ?? 0;
    return (
      row.plan.needsPurchaseAttention &&
      !hasValidPurchaseAck(
        row.item,
        row.warehouseStock,
        purchaseLead,
        acknowledgements,
      )
    );
  }

  return {
    items,
    salesByItem,
    warehouseById,
    acknowledgements,
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

  return sortable.map(({ urgentForSort: _urgentForSort, ...summary }) => summary);
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
