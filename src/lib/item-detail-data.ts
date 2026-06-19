import { stockPlanningConfig } from "@/config/stock-planning";
import type {
  OperationCycleKind,
  ReplenishmentStatus,
} from "@/generated/prisma/client";
import { prisma } from "@/lib/db";
import { loadFinancialEvaluationRows } from "@/lib/financial-evaluation-data";
import type { FinancialEvaluationRow } from "@/lib/financial-evaluation-data";
import {
  fetchCategoryById,
  fetchUnitsSoldForItemsInWindow,
} from "@/lib/mercadolibre/api";
import { mlAvailableStockUnits } from "@/lib/mercadolibre/ml-available-stock";
import type { ItemBody } from "@/lib/mercadolibre/types";
import {
  computeStockPlanningDisplay,
  type StockPlanningDisplay,
} from "@/lib/stock-planning";

export type ItemCatalogContext = {
  catalogStatus: string | null;
  catalogSellerPrice: number | null;
  catalogPriceToWin: number | null;
  catalogPolledAt: Date | null;
};

export type ItemOpenCycleContext = {
  id: string;
  kind: OperationCycleKind;
  status: ReplenishmentStatus;
};

export type ItemDetailContext = {
  mlStock: number;
  warehouseStock: number;
  totalStock: number;
  leadTimeDays: number;
  unitsSoldInWindow: number;
  windowDays: number;
  plan: StockPlanningDisplay;
  warehouseNotes: string | null;
  catalog: ItemCatalogContext | null;
  openCycle: ItemOpenCycleContext | null;
  financial: FinancialEvaluationRow | null;
  categoryName: string | null;
};

function decimalToNumber(value: unknown): number | null {
  if (value == null) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

export async function loadItemDetailContext(input: {
  accessToken: string;
  userId: number;
  itemId: string;
  item: ItemBody;
}): Promise<ItemDetailContext> {
  const { accessToken, userId, itemId, item } = input;
  const windowDays = stockPlanningConfig.salesAverageWindowDays;
  const dateField = stockPlanningConfig.salesWindowDateField;
  const mlStock = mlAvailableStockUnits(item);

  const [
    salesByItem,
    warehouseRow,
    listingRow,
    openCycle,
    financialRows,
    category,
  ] = await Promise.all([
    fetchUnitsSoldForItemsInWindow(
      accessToken,
      userId,
      [itemId],
      windowDays,
      dateField,
    ),
    prisma.warehouseStock.findUnique({
      where: { mlItemId: itemId },
      select: {
        quantity: true,
        purchaseLeadTimeDays: true,
        notes: true,
      },
    }),
    item.catalog_listing
      ? prisma.listing.findUnique({
          where: { mlItemId: itemId },
          select: {
            catalogStatus: true,
            catalogSellerPrice: true,
            catalogPriceToWin: true,
            catalogPolledAt: true,
          },
        })
      : Promise.resolve(null),
    prisma.replenishmentCycle.findFirst({
      where: {
        mlItemId: itemId,
        status: { not: "completed" },
      },
      orderBy: { updatedAt: "desc" },
      select: { id: true, kind: true, status: true },
    }),
    loadFinancialEvaluationRows(accessToken, userId, { itemIds: [itemId] }),
    item.category_id
      ? fetchCategoryById(accessToken, item.category_id).catch(() => null)
      : Promise.resolve(null),
  ]);

  const warehouseStock = warehouseRow?.quantity ?? 0;
  const leadTimeDays = warehouseRow?.purchaseLeadTimeDays ?? 0;
  const unitsSoldInWindow = salesByItem[itemId] ?? 0;
  const plan = computeStockPlanningDisplay(
    mlStock + warehouseStock,
    unitsSoldInWindow,
    windowDays,
    stockPlanningConfig,
    leadTimeDays,
  );

  return {
    mlStock,
    warehouseStock,
    totalStock: mlStock + warehouseStock,
    leadTimeDays,
    unitsSoldInWindow,
    windowDays,
    plan,
    warehouseNotes: warehouseRow?.notes ?? null,
    catalog: listingRow
      ? {
          catalogStatus: listingRow.catalogStatus,
          catalogSellerPrice: decimalToNumber(listingRow.catalogSellerPrice),
          catalogPriceToWin: decimalToNumber(listingRow.catalogPriceToWin),
          catalogPolledAt: listingRow.catalogPolledAt,
        }
      : null,
    openCycle: openCycle
      ? {
          id: openCycle.id,
          kind: openCycle.kind,
          status: openCycle.status,
        }
      : null,
    financial: financialRows[0] ?? null,
    categoryName: category?.name ?? null,
  };
}
