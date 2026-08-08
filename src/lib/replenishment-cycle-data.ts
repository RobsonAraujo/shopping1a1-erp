import { stockPlanningConfig } from "@/config/stock-planning";
import type {
  OperationCycleKind,
  ReplenishmentStatus,
} from "@/generated/prisma/client";
import { prisma } from "@/lib/db";
import {
  buildPurchasePlan,
  computePurchaseAnalysis,
} from "@/lib/purchase-analysis";
import {
  buildStatusTransition,
  isActiveReplenishmentStatus,
  nextStatusForKind,
  shouldAutoCompleteFullCycle,
  shouldAutoCompletePurchaseCycle,
  shouldCreateFullCycle,
  shouldCreatePurchaseCycle,
  summarizeBoardCounts,
  summarizeOperationsCounts,
  type OperationsSummaryCounts,
  type ReplenishmentSnapshot,
} from "@/lib/replenishment-cycle";
import {
  fetchItemById,
  fetchItemsByIdsBatched,
  fetchOperationalListingIds,
  fetchUnitsSoldForItemsInWindowBatched,
} from "@/lib/mercadolibre/api";
import { bestItemImageUrl } from "@/lib/mercadolibre/item-image";
import { getItemSku, getSkuSupplier, isKitItem } from "@/lib/mercadolibre/item-sku";
import { mlAvailableStockUnits } from "@/lib/mercadolibre/ml-available-stock";
import { computeStockPlanningDisplay } from "@/lib/stock-planning";
import type { ItemBody } from "@/lib/mercadolibre/types";
import type { StockPlanningDisplay } from "@/lib/stock-planning";

function listingUpsertData(item: ItemBody) {
  const activeOnMl = item.status === "active" || item.status === "paused";
  return {
    titleSnapshot: item.title,
    catalogListing: item.catalog_listing ?? null,
    lastSyncedAt: new Date(),
    activeOnMl,
    mlStatus: item.status ?? null,
  };
}

function listingCreateData(item: ItemBody) {
  return {
    mlItemId: item.id,
    ...listingUpsertData(item),
  };
}

async function upsertListingForItem(item: ItemBody): Promise<void> {
  if (!item.id) return;
  await prisma.listing.upsert({
    where: { mlItemId: item.id },
    create: listingCreateData(item),
    update: listingUpsertData(item),
  });
}

async function ensureListingsForItems(items: ItemBody[]): Promise<void> {
  const chunkSize = 25;
  for (let i = 0; i < items.length; i += chunkSize) {
    const chunk = items.slice(i, i + chunkSize);
    await Promise.all(chunk.map((item) => upsertListingForItem(item)));
  }
}

let replenishmentSyncTail: Promise<void> = Promise.resolve();

function withReplenishmentSyncLock<T>(fn: () => Promise<T>): Promise<T> {
  const run = replenishmentSyncTail.then(fn);
  replenishmentSyncTail = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

export type OperationsBoardCard = {
  cycleId: string;
  mlItemId: string;
  kind: OperationCycleKind;
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
  mlQtyAtCollection: number | null;
};

export type SingleBoardData = {
  cards: OperationsBoardCard[];
  summary: ReturnType<typeof summarizeBoardCounts>;
};

export type OperationsBoardsData = {
  purchase: SingleBoardData;
  full: SingleBoardData;
  summary: OperationsSummaryCounts;
};

/** @deprecated Use OperationsBoardCard */
export type ReplenishmentBoardCard = OperationsBoardCard;

/** @deprecated Use OperationsBoardsData */
export type ReplenishmentBoardData = OperationsBoardsData;

function snapshotForItem(
  item: ItemBody,
  warehouseStock: number,
  purchaseLead: number,
): ReplenishmentSnapshot {
  const mlQty = mlAvailableStockUnits(item);
  return {
    mlQty,
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
  const mlQty = mlAvailableStockUnits(item);
  const w = stockPlanningConfig.salesAverageWindowDays;
  const fullPlan = computeStockPlanningDisplay(
    mlQty,
    sold,
    w,
    stockPlanningConfig,
    purchaseLead,
  );
  const purchasePlan = computeStockPlanningDisplay(
    mlQty + warehouseStock,
    sold,
    w,
    stockPlanningConfig,
    purchaseLead,
  );
  const plan = buildPurchasePlan(
    mlQty + warehouseStock,
    sold,
    purchaseLead,
  );
  const analysis = computePurchaseAnalysis({
    unitsSoldInWindow: sold,
    totalStock: mlQty + warehouseStock,
    purchaseLeadTimeDays: purchaseLead,
    purchaseIsOverdue: plan.purchaseIsOverdue,
    needsPurchaseAttention: plan.needsPurchaseAttention,
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
  cycle: NonNullable<
    Awaited<ReturnType<typeof prisma.replenishmentCycle.findFirst>>
  >,
) {
  return {
    id: cycle.id,
    mlItemId: cycle.mlItemId,
    kind: cycle.kind,
    status: cycle.status,
    triggerMlQty: cycle.triggerMlQty,
    triggerWarehouseQty: cycle.triggerWarehouseQty,
    triggerLeadTimeDays: cycle.triggerLeadTimeDays,
    warehouseQtyAtOrder: cycle.warehouseQtyAtOrder,
    mlQtyAtCollection: cycle.mlQtyAtCollection,
    completedMlQty: cycle.completedMlQty,
    completedWarehouseQty: cycle.completedWarehouseQty,
    completedLeadTimeDays: cycle.completedLeadTimeDays,
    completedAt: cycle.completedAt,
  };
}

type CycleEntry = {
  active: Awaited<ReturnType<typeof prisma.replenishmentCycle.findFirst>>;
  latestCompleted: Awaited<ReturnType<typeof prisma.replenishmentCycle.findFirst>>;
};

async function getLatestCyclesByItemAndKind(
  mlItemIds: string[],
  kind: OperationCycleKind,
): Promise<Map<string, CycleEntry>> {
  const cycles = await prisma.replenishmentCycle.findMany({
    where: { mlItemId: { in: mlItemIds }, kind },
    orderBy: { updatedAt: "desc" },
  });

  const map = new Map<string, CycleEntry>();
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

async function createCycleForItem(
  kind: OperationCycleKind,
  ctx: ItemPlanningContext,
  snapshot: ReplenishmentSnapshot,
  initialStatus: ReplenishmentStatus,
): Promise<void> {
  const mlItemId = ctx.item.id.trim();
  if (!mlItemId) return;

  await prisma.$transaction(async (tx) => {
    await tx.listing.upsert({
      where: { mlItemId },
      create: listingCreateData({ ...ctx.item, id: mlItemId }),
      update: listingUpsertData(ctx.item),
    });
    await tx.replenishmentCycle.create({
      data: {
        mlItemId,
        kind,
        status: initialStatus,
        triggerMlQty: snapshot.mlQty,
        triggerWarehouseQty: snapshot.warehouseQty,
        triggerLeadTimeDays: snapshot.leadTimeDays,
        triggerPurchaseAt:
          kind === "purchase" && ctx.purchasePlan.purchaseStartsAtMs
            ? new Date(ctx.purchasePlan.purchaseStartsAtMs)
            : null,
        suggestedQty: kind === "purchase" ? ctx.suggestedQty : null,
      },
    });
  });
}

async function maybeAutoCompletePurchaseCycle(
  active: NonNullable<CycleEntry["active"]>,
  ctx: ItemPlanningContext,
  snapshot: ReplenishmentSnapshot,
): Promise<boolean> {
  const record = toCycleRecord(active);
  if (
    !shouldAutoCompletePurchaseCycle(
      record,
      snapshot,
      ctx.purchasePlan.needsPurchaseAttention,
    )
  ) {
    return false;
  }

  await prisma.replenishmentCycle.update({
    where: { id: active.id },
    data: buildStatusTransition(record, "completed", snapshot),
  });
  return true;
}

async function maybeAutoCompleteFullCycle(
  active: NonNullable<CycleEntry["active"]>,
  ctx: ItemPlanningContext,
  snapshot: ReplenishmentSnapshot,
): Promise<boolean> {
  const record = toCycleRecord(active);
  if (
    !shouldAutoCompleteFullCycle(
      record,
      snapshot,
      ctx.fullPlan.needsSchedulingAttention,
    )
  ) {
    return false;
  }

  await prisma.replenishmentCycle.update({
    where: { id: active.id },
    data: buildStatusTransition(record, "completed", snapshot),
  });
  return true;
}

export async function syncPurchaseCyclesForItems(
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

  const cycleMap = await getLatestCyclesByItemAndKind(
    items.map((item) => item.id),
    "purchase",
  );

  for (const ctx of contexts) {
    const { active, latestCompleted } =
      cycleMap.get(ctx.item.id) ?? { active: null, latestCompleted: null };
    const snapshot = snapshotForItem(
      ctx.item,
      ctx.warehouseStock,
      ctx.purchaseLead,
    );

    if (active) {
      await maybeAutoCompletePurchaseCycle(active, ctx, snapshot);
      continue;
    }

    const shouldCreate = shouldCreatePurchaseCycle(
      {
        needsPurchaseAttention: ctx.purchasePlan.needsPurchaseAttention,
        snapshot,
        purchaseStartsAtMs: ctx.purchasePlan.purchaseStartsAtMs,
        suggestedQty: ctx.suggestedQty,
      },
      latestCompleted ? toCycleRecord(latestCompleted) : null,
    );

    if (!shouldCreate || !ctx.item.id.trim()) continue;

    await createCycleForItem("purchase", ctx, snapshot, "attention");
  }
}

export async function syncFullCyclesForItems(
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

  const cycleMap = await getLatestCyclesByItemAndKind(
    items.map((item) => item.id),
    "full",
  );

  for (const ctx of contexts) {
    const { active, latestCompleted } =
      cycleMap.get(ctx.item.id) ?? { active: null, latestCompleted: null };
    const snapshot = snapshotForItem(
      ctx.item,
      ctx.warehouseStock,
      ctx.purchaseLead,
    );

    if (active) {
      await maybeAutoCompleteFullCycle(active, ctx, snapshot);
      continue;
    }

    const shouldCreate = shouldCreateFullCycle(
      {
        needsSchedulingAttention: ctx.fullPlan.needsSchedulingAttention,
        snapshot,
      },
      latestCompleted ? toCycleRecord(latestCompleted) : null,
    );

    if (!shouldCreate || !ctx.item.id.trim()) continue;

    await createCycleForItem("full", ctx, snapshot, "attention");
  }
}

export async function syncOperationCyclesForItems(
  items: ItemBody[],
  salesByItem: Record<string, number>,
  warehouseById: Record<
    string,
    { quantity: number; purchaseLeadTimeDays: number | null }
  >,
): Promise<void> {
  return withReplenishmentSyncLock(async () => {
    if (items.length === 0) return;
    await ensureListingsForItems(items);
    await syncPurchaseCyclesForItems(items, salesByItem, warehouseById);
    await syncFullCyclesForItems(items, salesByItem, warehouseById);
  });
}

/** @deprecated Use syncOperationCyclesForItems */
export async function syncReplenishmentCyclesForItems(
  items: ItemBody[],
  salesByItem: Record<string, number>,
  warehouseById: Record<
    string,
    { quantity: number; purchaseLeadTimeDays: number | null }
  >,
): Promise<void> {
  return syncOperationCyclesForItems(items, salesByItem, warehouseById);
}

export async function syncPurchaseCycleFromWarehouse(
  mlItemId: string,
  warehouseQty: number,
  options?: { needsPurchaseAttention?: boolean },
): Promise<void> {
  const active = await prisma.replenishmentCycle.findFirst({
    where: {
      mlItemId,
      kind: "purchase",
      status: { not: "completed" },
    },
    orderBy: { updatedAt: "desc" },
  });
  if (!active) return;

  const warehouse = await prisma.warehouseStock.findUnique({
    where: { mlItemId },
    select: { purchaseLeadTimeDays: true },
  });

  const snapshot: ReplenishmentSnapshot = {
    mlQty: active.triggerMlQty,
    warehouseQty: warehouseQty,
    leadTimeDays:
      warehouse?.purchaseLeadTimeDays ?? active.triggerLeadTimeDays ?? 0,
  };

  const record = toCycleRecord(active);
  const needsPurchaseAttention = options?.needsPurchaseAttention ?? true;

  if (
    !shouldAutoCompletePurchaseCycle(
      record,
      snapshot,
      needsPurchaseAttention,
    )
  ) {
    return;
  }

  await prisma.replenishmentCycle.update({
    where: { id: active.id },
    data: buildStatusTransition(record, "completed", snapshot),
  });
}

/** @deprecated Use syncPurchaseCycleFromWarehouse */
export async function syncReplenishmentFromWarehouse(
  mlItemId: string,
  warehouseQty: number,
): Promise<void> {
  return syncPurchaseCycleFromWarehouse(mlItemId, warehouseQty);
}

function buildCardFromCycle(
  cycle: Awaited<ReturnType<typeof prisma.replenishmentCycle.findMany>>[number],
  ctx: ItemPlanningContext,
  item: ItemBody,
): OperationsBoardCard {
  const sku = getItemSku(item);
  return {
    cycleId: cycle.id,
    mlItemId: cycle.mlItemId,
    kind: cycle.kind,
    status: cycle.status,
    title: item.title,
    sku,
    supplier: getSkuSupplier(sku),
    imageUrl: bestItemImageUrl(item) ?? null,
    mlStock: mlAvailableStockUnits(item),
    warehouseStock: ctx.warehouseStock,
    suggestedQty: cycle.suggestedQty,
    purchaseIsOverdue: ctx.purchasePlan.purchaseIsOverdue,
    searchIsOverdue: ctx.fullPlan.searchIsOverdue,
    purchaseStartsOn: ctx.purchasePlan.purchaseStartsOn,
    searchStartsOn: ctx.fullPlan.searchStartsOn,
    needsSchedulingAttention: ctx.fullPlan.needsSchedulingAttention,
    notes: cycle.notes,
    warehouseQtyAtOrder: cycle.warehouseQtyAtOrder,
    mlQtyAtCollection: cycle.mlQtyAtCollection,
  };
}

async function resolveCycleSnapshot(
  cycle: {
    mlItemId: string;
    triggerMlQty: number;
    triggerWarehouseQty: number;
    triggerLeadTimeDays: number | null;
  },
  accessToken?: string,
): Promise<ReplenishmentSnapshot> {
  const warehouse = await prisma.warehouseStock.findUnique({
    where: { mlItemId: cycle.mlItemId },
    select: { quantity: true, purchaseLeadTimeDays: true },
  });

  if (accessToken) {
    const item = await fetchItemById(accessToken, cycle.mlItemId);
    if (item) {
      return {
        mlQty: mlAvailableStockUnits(item),
        warehouseQty: warehouse?.quantity ?? cycle.triggerWarehouseQty,
        leadTimeDays:
          warehouse?.purchaseLeadTimeDays ?? cycle.triggerLeadTimeDays ?? 0,
      };
    }
  }

  return {
    mlQty: cycle.triggerMlQty,
    warehouseQty: warehouse?.quantity ?? cycle.triggerWarehouseQty,
    leadTimeDays:
      warehouse?.purchaseLeadTimeDays ?? cycle.triggerLeadTimeDays ?? 0,
  };
}

export async function loadOperationsBoards(
  token: string,
  userId: number,
): Promise<OperationsBoardsData> {
  const windowDays = stockPlanningConfig.salesAverageWindowDays;
  const dateField = stockPlanningConfig.salesWindowDateField;
  const listingIds = await fetchOperationalListingIds(token, userId);

  const [rawItems, salesByItem, warehouseStocks] = await Promise.all([
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
  const items = rawItems.filter((item) => !isKitItem(item));

  const warehouseById = Object.fromEntries(
    warehouseStocks.map((row) => [
      row.mlItemId,
      {
        quantity: row.quantity,
        purchaseLeadTimeDays: row.purchaseLeadTimeDays,
      },
    ]),
  );

  await syncOperationCyclesForItems(items, salesByItem, warehouseById);

  const activeCycles = await prisma.replenishmentCycle.findMany({
    where: {
      mlItemId: { in: listingIds },
      status: { not: "completed" },
    },
    orderBy: { updatedAt: "desc" },
  });

  const itemById = new Map(items.map((item) => [item.id, item]));
  const purchaseCards: OperationsBoardCard[] = [];
  const fullCards: OperationsBoardCard[] = [];

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
    const card = buildCardFromCycle(cycle, ctx, item);

    if (cycle.kind === "purchase") {
      purchaseCards.push(card);
    } else {
      fullCards.push(card);
    }
  }

  const summary = summarizeOperationsCounts(
    activeCycles.map((cycle) => ({ kind: cycle.kind, status: cycle.status })),
  );

  return {
    purchase: {
      cards: purchaseCards,
      summary: summarizeBoardCounts(
        "purchase",
        purchaseCards.map((c) => c.status),
      ),
    },
    full: {
      cards: fullCards,
      summary: summarizeBoardCounts(
        "full",
        fullCards.map((c) => c.status),
      ),
    },
    summary,
  };
}

/** @deprecated Use loadOperationsBoards */
export async function loadReplenishmentBoard(
  token: string,
  userId: number,
): Promise<OperationsBoardsData> {
  return loadOperationsBoards(token, userId);
}

export async function loadOperationsSummaryFromDb(): Promise<OperationsSummaryCounts> {
  const cycles = await prisma.replenishmentCycle.findMany({
    where: { status: { not: "completed" } },
    select: { kind: true, status: true },
  });
  return summarizeOperationsCounts(cycles);
}

export async function loadOperationsSummary(
  token: string,
  userId: number,
): Promise<OperationsSummaryCounts> {
  const boards = await loadOperationsBoards(token, userId);
  return boards.summary;
}

export async function transitionReplenishmentCycle(
  cycleId: string,
  nextStatus: ReplenishmentStatus,
  options?: { notes?: string | null; accessToken?: string },
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

  const snapshot = await resolveCycleSnapshot(cycle, options?.accessToken);

  const patch = buildStatusTransition(
    toCycleRecord(cycle),
    nextStatus,
    snapshot,
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
  options?: { accessToken?: string },
): Promise<ReplenishmentStatus | null> {
  const cycle = await prisma.replenishmentCycle.findUnique({
    where: { id: cycleId },
  });
  if (!cycle || !isActiveReplenishmentStatus(cycle.status)) {
    throw new Error("Cycle not found or inactive");
  }

  const nextStatus = nextStatusForKind(cycle.kind, cycle.status);
  if (!nextStatus) return null;

  await transitionReplenishmentCycle(cycleId, nextStatus, {
    accessToken: options?.accessToken,
  });
  return nextStatus;
}
