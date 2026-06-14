import { stockPlanningConfig } from "@/config/stock-planning";
import type { ReplenishmentStatus } from "@/generated/prisma/client";
import { prisma } from "@/lib/db";
import {
  buildPurchasePlan,
  computePurchaseAnalysis,
} from "@/lib/purchase-analysis";
import {
  buildStatusTransition,
  initialStatusForNewCycle,
  isActiveReplenishmentStatus,
  shouldAutoAdvanceToWarehouse,
  shouldCreateReplenishmentCycle,
  summarizeOperationsCounts,
  type OperationsSummaryCounts,
  type ReplenishmentSnapshot,
} from "@/lib/replenishment-cycle";
import {
  fetchItemsByIdsBatched,
  fetchOperationalListingIds,
  fetchUnitsSoldForItemsInWindowBatched,
} from "@/lib/mercadolibre/api";
import { bestItemImageUrl } from "@/lib/mercadolibre/item-image";
import { getItemSku, getSkuSupplier } from "@/lib/mercadolibre/item-sku";
import { mlAvailableStockUnits } from "@/lib/mercadolibre/ml-available-stock";
import { computeStockPlanningDisplay } from "@/lib/stock-planning";
import type { ItemBody } from "@/lib/mercadolibre/types";
import type { StockPlanningDisplay } from "@/lib/stock-planning";

export type ReplenishmentBoardCard = {
  cycleId: string;
  mlItemId: string;
  status: ReplenishmentStatus;
  title: string;
  sku: string | null;
  supplier: string;
  imageUrl: string | null;
  mlStock: number;
  warehouseStock: number;
  suggestedQty: number | null;
  purchaseIsOverdue: boolean;
  searchIsOverdue: boolean;
  purchaseStartsOn: string | null;
  searchStartsOn: string | null;
  needsSchedulingAttention: boolean;
  notes: string | null;
  warehouseQtyAtOrder: number | null;
};

export type ReplenishmentBoardData = {
  cards: ReplenishmentBoardCard[];
  summary: OperationsSummaryCounts;
};

function snapshotForItem(
  item: ItemBody,
  warehouseStock: number,
  purchaseLead: number,
): ReplenishmentSnapshot {
  return {
    mlQty: item.available_quantity,
    warehouseQty: warehouseStock,
    leadTimeDays: purchaseLead,
  };
}

type ItemPlanningContext = {
  item: ItemBody;
  warehouseStock: number;
  purchaseLead: number;
  sold: number;
  purchasePlan: StockPlanningDisplay;
  fullPlan: StockPlanningDisplay;
  suggestedQty: number | null;
};

function buildItemPlanningContext(
  item: ItemBody,
  warehouseStock: number,
  purchaseLead: number,
  sold: number,
): ItemPlanningContext {
  const w = stockPlanningConfig.salesAverageWindowDays;
  const fullPlan = computeStockPlanningDisplay(
    item.available_quantity,
    sold,
    w,
    stockPlanningConfig,
    purchaseLead,
  );
  const purchasePlan = computeStockPlanningDisplay(
    item.available_quantity + warehouseStock,
    sold,
    w,
    stockPlanningConfig,
    purchaseLead,
  );
  const plan = buildPurchasePlan(
    item.available_quantity + warehouseStock,
    sold,
    purchaseLead,
  );
  const analysis = computePurchaseAnalysis({
    unitsSoldInWindow: sold,
    totalStock: item.available_quantity + warehouseStock,
    purchaseLeadTimeDays: purchaseLead,
    purchaseIsOverdue: plan.purchaseIsOverdue,
    needsPurchaseAttention: plan.needsPurchaseAttention,
    mlPrice: item.price,
    costProfile: null,
  });

  return {
    item,
    warehouseStock,
    purchaseLead,
    sold,
    purchasePlan,
    fullPlan,
    suggestedQty:
      analysis.recommendation === "comprar" ? analysis.suggestedQty : null,
  };
}

function toCycleRecord(
  cycle: Awaited<ReturnType<typeof prisma.replenishmentCycle.findFirst>> & {},
) {
  return {
    id: cycle.id,
    mlItemId: cycle.mlItemId,
    status: cycle.status,
    triggerMlQty: cycle.triggerMlQty,
    triggerWarehouseQty: cycle.triggerWarehouseQty,
    triggerLeadTimeDays: cycle.triggerLeadTimeDays,
    warehouseQtyAtOrder: cycle.warehouseQtyAtOrder,
    completedMlQty: cycle.completedMlQty,
    completedWarehouseQty: cycle.completedWarehouseQty,
    completedLeadTimeDays: cycle.completedLeadTimeDays,
    completedAt: cycle.completedAt,
  };
}

async function getLatestCyclesByItem(mlItemIds: string[]) {
  const cycles = await prisma.replenishmentCycle.findMany({
    where: { mlItemId: { in: mlItemIds } },
    orderBy: { updatedAt: "desc" },
  });

  const map = new Map<
    string,
    {
      active: (typeof cycles)[number] | null;
      latestCompleted: (typeof cycles)[number] | null;
    }
  >();

  for (const id of mlItemIds) {
    map.set(id, { active: null, latestCompleted: null });
  }

  for (const cycle of cycles) {
    const entry = map.get(cycle.mlItemId);
    if (!entry) continue;
    if (isActiveReplenishmentStatus(cycle.status) && !entry.active) {
      entry.active = cycle;
    }
    if (cycle.status === "completed" && !entry.latestCompleted) {
      entry.latestCompleted = cycle;
    }
  }

  return map;
}

export async function syncReplenishmentCyclesForItems(
  items: ItemBody[],
  salesByItem: Record<string, number>,
  warehouseById: Record<
    string,
    { quantity: number; purchaseLeadTimeDays: number | null }
  >,
): Promise<void> {
  if (items.length === 0) return;

  const contexts = items.map((item) => {
    const warehouse = warehouseById[item.id];
    const warehouseStock = warehouse?.quantity ?? 0;
    const purchaseLead = warehouse?.purchaseLeadTimeDays ?? 0;
    const sold = salesByItem[item.id] ?? 0;
    return buildItemPlanningContext(item, warehouseStock, purchaseLead, sold);
  });

  const cycleMap = await getLatestCyclesByItem(items.map((item) => item.id));

  for (const ctx of contexts) {
    const { active, latestCompleted } =
      cycleMap.get(ctx.item.id) ?? { active: null, latestCompleted: null };
    const snapshot = snapshotForItem(
      ctx.item,
      ctx.warehouseStock,
      ctx.purchaseLead,
    );

    if (active) {
      if (
        shouldAutoAdvanceToWarehouse(
          toCycleRecord(active),
          ctx.warehouseStock,
        )
      ) {
        await prisma.replenishmentCycle.update({
          where: { id: active.id },
          data: buildStatusTransition(
            toCycleRecord(active),
            "in_warehouse",
            snapshot,
          ),
        });
      }
      continue;
    }

    const shouldCreate = shouldCreateReplenishmentCycle(
      {
        needsPurchaseAttention: ctx.purchasePlan.needsPurchaseAttention,
        needsSchedulingAttention: ctx.fullPlan.needsSchedulingAttention,
        snapshot,
        purchaseStartsAtMs: ctx.purchasePlan.purchaseStartsAtMs,
        suggestedQty: ctx.suggestedQty,
      },
      latestCompleted ? toCycleRecord(latestCompleted) : null,
    );

    if (!shouldCreate) continue;

    const initialStatus = initialStatusForNewCycle({
      needsPurchaseAttention: ctx.purchasePlan.needsPurchaseAttention,
      needsSchedulingAttention: ctx.fullPlan.needsSchedulingAttention,
    });
    if (!initialStatus) continue;

    await prisma.replenishmentCycle.create({
      data: {
        mlItemId: ctx.item.id,
        status: initialStatus,
        triggerMlQty: snapshot.mlQty,
        triggerWarehouseQty: snapshot.warehouseQty,
        triggerLeadTimeDays: snapshot.leadTimeDays,
        triggerPurchaseAt: ctx.purchasePlan.purchaseStartsAtMs
          ? new Date(ctx.purchasePlan.purchaseStartsAtMs)
          : null,
        suggestedQty: ctx.suggestedQty,
      },
    });
  }
}

export async function syncReplenishmentFromWarehouse(
  mlItemId: string,
  warehouseQty: number,
): Promise<void> {
  const active = await prisma.replenishmentCycle.findFirst({
    where: {
      mlItemId,
      status: { not: "completed" },
    },
    orderBy: { updatedAt: "desc" },
  });
  if (!active || active.status !== "ordered") return;
  if (active.warehouseQtyAtOrder === null) return;
  if (warehouseQty <= active.warehouseQtyAtOrder) return;

  const warehouse = await prisma.warehouseStock.findUnique({
    where: { mlItemId },
    select: { purchaseLeadTimeDays: true },
  });

  await prisma.replenishmentCycle.update({
    where: { id: active.id },
    data: buildStatusTransition(
      toCycleRecord(active),
      "in_warehouse",
      {
        mlQty: active.triggerMlQty,
        warehouseQty: warehouseQty,
        leadTimeDays: warehouse?.purchaseLeadTimeDays ?? 0,
      },
    ),
  });
}

export async function loadReplenishmentBoard(
  token: string,
  userId: number,
): Promise<ReplenishmentBoardData> {
  const windowDays = stockPlanningConfig.salesAverageWindowDays;
  const dateField = stockPlanningConfig.salesWindowDateField;
  const listingIds = await fetchOperationalListingIds(token, userId);

  const [items, salesByItem, warehouseStocks] = await Promise.all([
    fetchItemsByIdsBatched(token, listingIds),
    fetchUnitsSoldForItemsInWindowBatched(
      token,
      userId,
      listingIds,
      windowDays,
      dateField,
    ),
    prisma.warehouseStock.findMany({
      where: { mlItemId: { in: listingIds } },
      select: {
        mlItemId: true,
        quantity: true,
        purchaseLeadTimeDays: true,
      },
    }),
  ]);

  const warehouseById = Object.fromEntries(
    warehouseStocks.map((row) => [
      row.mlItemId,
      {
        quantity: row.quantity,
        purchaseLeadTimeDays: row.purchaseLeadTimeDays,
      },
    ]),
  );

  await syncReplenishmentCyclesForItems(items, salesByItem, warehouseById);

  const activeCycles = await prisma.replenishmentCycle.findMany({
    where: {
      mlItemId: { in: listingIds },
      status: { not: "completed" },
    },
    orderBy: { updatedAt: "desc" },
  });

  const itemById = new Map(items.map((item) => [item.id, item]));
  const cards: ReplenishmentBoardCard[] = [];

  for (const cycle of activeCycles) {
    const item = itemById.get(cycle.mlItemId);
    if (!item) continue;

    const warehouse = warehouseById[cycle.mlItemId];
    const warehouseStock = warehouse?.quantity ?? 0;
    const purchaseLead = warehouse?.purchaseLeadTimeDays ?? 0;
    const sold = salesByItem[cycle.mlItemId] ?? 0;
    const ctx = buildItemPlanningContext(
      item,
      warehouseStock,
      purchaseLead,
      sold,
    );
    const sku = getItemSku(item);

    cards.push({
      cycleId: cycle.id,
      mlItemId: cycle.mlItemId,
      status: cycle.status,
      title: item.title,
      sku,
      supplier: getSkuSupplier(sku),
      imageUrl: bestItemImageUrl(item) ?? null,
      mlStock: mlAvailableStockUnits(item),
      warehouseStock,
      suggestedQty: cycle.suggestedQty,
      purchaseIsOverdue: ctx.purchasePlan.purchaseIsOverdue,
      searchIsOverdue: ctx.fullPlan.searchIsOverdue,
      purchaseStartsOn: ctx.purchasePlan.purchaseStartsOn,
      searchStartsOn: ctx.fullPlan.searchStartsOn,
      needsSchedulingAttention: ctx.fullPlan.needsSchedulingAttention,
      notes: cycle.notes,
      warehouseQtyAtOrder: cycle.warehouseQtyAtOrder,
    });
  }

  return {
    cards,
    summary: summarizeOperationsCounts(cards.map((card) => card.status)),
  };
}

export async function loadOperationsSummary(
  token: string,
  userId: number,
): Promise<OperationsSummaryCounts> {
  const board = await loadReplenishmentBoard(token, userId);
  return board.summary;
}

export async function transitionReplenishmentCycle(
  cycleId: string,
  nextStatus: ReplenishmentStatus,
  options?: { notes?: string | null },
): Promise<void> {
  const cycle = await prisma.replenishmentCycle.findUnique({
    where: { id: cycleId },
  });
  if (!cycle) {
    throw new Error("Cycle not found");
  }
  if (!isActiveReplenishmentStatus(cycle.status)) {
    throw new Error("Cycle already completed");
  }

  const warehouse = await prisma.warehouseStock.findUnique({
    where: { mlItemId: cycle.mlItemId },
    select: { quantity: true, purchaseLeadTimeDays: true },
  });

  const patch = buildStatusTransition(
    toCycleRecord(cycle),
    nextStatus,
    {
      mlQty: cycle.triggerMlQty,
      warehouseQty: warehouse?.quantity ?? cycle.triggerWarehouseQty,
      leadTimeDays:
        warehouse?.purchaseLeadTimeDays ?? cycle.triggerLeadTimeDays ?? 0,
    },
  );

  await prisma.replenishmentCycle.update({
    where: { id: cycleId },
    data: {
      ...patch,
      ...(options?.notes !== undefined ? { notes: options.notes } : {}),
    },
  });
}

export async function advanceReplenishmentCycle(
  cycleId: string,
  options?: { skipFull?: boolean },
): Promise<ReplenishmentStatus | null> {
  const cycle = await prisma.replenishmentCycle.findUnique({
    where: { id: cycleId },
  });
  if (!cycle || !isActiveReplenishmentStatus(cycle.status)) {
    throw new Error("Cycle not found or inactive");
  }

  let nextStatus: ReplenishmentStatus | null = null;

  if (cycle.status === "in_warehouse") {
    nextStatus = options?.skipFull ? "completed" : "full_pending";
  } else {
    const order = [
      "attention",
      "analyzing",
      "quoted",
      "ordered",
      "in_warehouse",
      "full_pending",
      "completed",
    ] as const;
    const index = order.indexOf(cycle.status);
    nextStatus = order[index + 1] ?? null;
  }

  if (!nextStatus) return null;

  await transitionReplenishmentCycle(cycleId, nextStatus);
  return nextStatus;
}
