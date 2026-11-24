import { isFulfillmentListing } from "@/lib/mercadolibre/fulfillment-stock";
import { automaticWarehouseQtyByListing } from "@/lib/stock/stock-bridge";
import type {
  OperationCycleKind,
  ReplenishmentStatus,
} from "@/generated/prisma/client";
import { prisma } from "@/lib/db/db";
import { loadFinancialEvaluationRows } from "@/lib/lucratividade/financial-evaluation-data";
import type { FinancialEvaluationRow } from "@/lib/lucratividade/financial-evaluation-data";
import {
  fetchCategoryById,
  fetchItemsByIdsBatched,
  fetchUnitsSoldForItemsInWindow,
} from "@/lib/mercadolibre/api";
import { pooledMlStock } from "@/lib/compras/sale-options-fold";
import { loadListingGroups, type ListingOption } from "@/lib/products/listing-groups";
import { mlAvailableStockUnits } from "@/lib/mercadolibre/ml-available-stock";
import type { ItemBody } from "@/lib/mercadolibre/types";
import {
  computeStockPlanningDisplay,
  type StockPlanningDisplay,
} from "@/lib/compras/stock-planning";
import {
  loadOperationalSettings,
  toStockPlanningValues,
} from "@/lib/configuracoes/operational-settings";
import { loadOrMaterializeKanbanColumns } from "@/lib/compras/kanban-columns-data";

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
  /** Label da coluna atual do Kanban (dinâmica por organização) — não dá
   * mais pra derivar só do `status` (ver comentário no schema). */
  columnLabel: string;
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
  /**
   * Opções de venda do produto (só quando há mais de uma). Estoque, venda e
   * planejamento acima são do **produto** (todas as opções); preço, margem e
   * catálogo continuam deste anúncio.
   */
  options?: ListingOption[];
};

function decimalToNumber(value: unknown): number | null {
  if (value == null) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

export async function loadItemDetailContext(input: {
  accessToken: string;
  userId: number;
  organizationId: string;
  itemId: string;
  item: ItemBody;
}): Promise<ItemDetailContext> {
  const { accessToken, userId, organizationId, itemId, item } = input;
  const stockPlanning = toStockPlanningValues(
    await loadOperationalSettings(organizationId),
  );
  const windowDays = stockPlanning.salesAverageWindowDays;
  const dateField = stockPlanning.salesWindowDateField;

  // Opções de venda: o estoque e a venda são do produto físico. As outras
  // opções ativas ou pausadas entram na conta (o estoque do ML uma vez).
  const groups = await loadListingGroups(organizationId, { extraItems: [item] });
  const groupOptions = groups.optionsOf(itemId);
  const otherIds = groupOptions
    .filter((o) => o.mlItemId !== itemId && (o.mlStatus === "active" || o.mlStatus === "paused"))
    .map((o) => o.mlItemId);
  const otherItems =
    otherIds.length > 0
      ? (await fetchItemsByIdsBatched(accessToken, otherIds)).filter(
          (other) => (other.variations?.length ?? 0) === 0,
        )
      : [];
  const members = (item.variations?.length ?? 0) > 0 ? [item] : [item, ...otherItems];
  const memberIds = members.map((member) => member.id);
  const mlStock = members.length > 1 ? pooledMlStock(members) : mlAvailableStockUnits(item);

  const [
    salesByItem,
    warehouseRows,
    listingRow,
    openCycle,
    financialRows,
    category,
  ] = await Promise.all([
    fetchUnitsSoldForItemsInWindow(
      accessToken,
      userId,
      memberIds,
      windowDays,
      dateField,
    ),
    prisma.warehouseStock.findMany({
      where: { mlItemId: { in: memberIds }, organizationId },
      select: {
        mlItemId: true,
        quantity: true,
        purchaseLeadTimeDays: true,
        notes: true,
      },
    }),
    item.catalog_listing
      ? prisma.listing.findFirst({
          where: { mlItemId: itemId, organizationId },
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
        organizationId,
        mlItemId: { in: [...new Set([...memberIds, groups.principalOf(itemId)])] },
        status: { not: "completed" },
      },
      orderBy: { updatedAt: "desc" },
      select: { id: true, kind: true, status: true, columnId: true },
    }),
    loadFinancialEvaluationRows(accessToken, userId, organizationId, {
      itemIds: [itemId],
    }),
    item.category_id
      ? fetchCategoryById(accessToken, item.category_id).catch(() => null)
      : Promise.resolve(null),
  ]);

  const openCycleColumnLabel = openCycle
    ? await (async () => {
        const columns = await loadOrMaterializeKanbanColumns(organizationId, openCycle.kind);
        return (
          columns.find((c) => c.id === openCycle.columnId)?.label ??
          columns[0]?.label ??
          "?"
        );
      })()
    : null;

  // Estoque automático: galpão do livro de estoque (sem somar o depósito duas
  // vezes) — o anúncio aberto responde pelo produto. Sem automático: o
  // galpão digitado somado entre as opções, como na ativação do Estoque.
  const autoWarehouse = await automaticWarehouseQtyByListing(organizationId, [
    { mlItemId: itemId, isFulfillment: members.every((member) => isFulfillmentListing(member)) },
  ]);
  const warehouseRow = warehouseRows.find((row) => row.mlItemId === itemId) ?? null;
  const warehouseStock = autoWarehouse
    ? (autoWarehouse.get(itemId) ?? 0)
    : warehouseRows.reduce((sum, row) => sum + row.quantity, 0);
  const leadTimeDays =
    warehouseRow?.purchaseLeadTimeDays ??
    warehouseRows.find((row) => row.purchaseLeadTimeDays != null)?.purchaseLeadTimeDays ??
    0;
  const unitsSoldInWindow = memberIds.reduce((sum, id) => sum + (salesByItem[id] ?? 0), 0);
  const plan = computeStockPlanningDisplay(
    mlStock + warehouseStock,
    unitsSoldInWindow,
    windowDays,
    stockPlanning,
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
          columnLabel: openCycleColumnLabel ?? "?",
        }
      : null,
    financial: financialRows[0] ?? null,
    categoryName: category?.name ?? null,
    options: groupOptions.length > 1 ? groupOptions : undefined,
  };
}
