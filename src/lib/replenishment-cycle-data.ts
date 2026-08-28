import { stockPlanningConfig } from "@/config/stock-planning";
import type { StockPlanningValues } from "@/config/stock-planning";
import { purchaseAnalysisConfig } from "@/config/purchase-analysis";
import type { PurchaseAnalysisValues } from "@/config/purchase-analysis";
import type {
  OperationCycleKind,
  ReplenishmentStatus,
} from "@/generated/prisma/client";
import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/db";
import { buildPurchasePlan, computePurchaseAnalysis } from "@/lib/purchase-analysis";
import {
  loadOperationalSettings,
  toPurchaseAnalysisValues,
  toStockPlanningValues,
} from "@/lib/operational-settings";
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

function listingCreateData(organizationId: string, item: ItemBody) {
  return {
    organizationId,
    mlItemId: item.id,
    ...listingUpsertData(item),
  };
}

async function upsertListingForItem(
  organizationId: string,
  item: ItemBody,
): Promise<void> {
  if (!item.id) return;
  await prisma.listing.upsert({
    where: { mlItemId: item.id },
    create: listingCreateData(organizationId, item),
    update: listingUpsertData(item),
  });
}

async function ensureListingsForItems(
  organizationId: string,
  items: ItemBody[],
): Promise<void> {
  const chunkSize = 25;
  for (let i = 0; i < items.length; i += chunkSize) {
    const chunk = items.slice(i, i + chunkSize);
    await Promise.all(
      chunk.map((item) => upsertListingForItem(organizationId, item)),
    );
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
  stockPlanning: StockPlanningValues = stockPlanningConfig,
  purchaseAnalysisValues: PurchaseAnalysisValues = purchaseAnalysisConfig,
): ItemPlanningContext {
  const mlQty = mlAvailableStockUnits(item);
  const w = stockPlanning.salesAverageWindowDays;
  const fullPlan = computeStockPlanningDisplay(
    mlQty,
    sold,
    w,
    stockPlanning,
    purchaseLead,
  );
  const purchasePlan = computeStockPlanningDisplay(
    mlQty + warehouseStock,
    sold,
    w,
    stockPlanning,
    purchaseLead,
  );
  const plan = buildPurchasePlan(
    mlQty + warehouseStock,
    sold,
    purchaseLead,
    stockPlanning,
  );
  const analysis = computePurchaseAnalysis(
    {
      unitsSoldInWindow: sold,
      totalStock: mlQty + warehouseStock,
      purchaseLeadTimeDays: purchaseLead,
      purchaseIsOverdue: plan.purchaseIsOverdue,
      needsPurchaseAttention: plan.needsPurchaseAttention,
      costProfile: null,
    },
    { stockPlanning, purchaseAnalysis: purchaseAnalysisValues },
  );

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

type LatestCycleRow = {
  id: string;
  ml_item_id: string;
  kind: OperationCycleKind;
  status: ReplenishmentStatus;
  trigger_ml_qty: number;
  trigger_warehouse_qty: number;
  trigger_lead_time_days: number | null;
  warehouse_qty_at_order: number | null;
  ml_qty_at_collection: number | null;
  completed_ml_qty: number | null;
  completed_warehouse_qty: number | null;
  completed_lead_time_days: number | null;
  completed_at: Date | null;
};

function rowToCycle(
  row: LatestCycleRow,
): NonNullable<CycleEntry["active"]> {
  return {
    id: row.id,
    mlItemId: row.ml_item_id,
    kind: row.kind,
    status: row.status,
    triggerMlQty: row.trigger_ml_qty,
    triggerWarehouseQty: row.trigger_warehouse_qty,
    triggerLeadTimeDays: row.trigger_lead_time_days,
    warehouseQtyAtOrder: row.warehouse_qty_at_order,
    mlQtyAtCollection: row.ml_qty_at_collection,
    completedMlQty: row.completed_ml_qty,
    completedWarehouseQty: row.completed_warehouse_qty,
    completedLeadTimeDays: row.completed_lead_time_days,
    completedAt: row.completed_at,
  } as NonNullable<CycleEntry["active"]>;
}

/**
 * Só o ciclo ativo (status != completed) e o completado mais recente por item
 * — via DISTINCT ON, mesmo padrão de loadLatestCatalogCompetitionSnapshots em
 * catalog-competition.ts. Um findMany simples traz o histórico inteiro de
 * ciclos por anúncio (nunca purgado), o que cresce sem limite e foi
 * identificado como fonte de egress alto no Supabase.
 */
async function getLatestCyclesByItemAndKind(
  organizationId: string,
  mlItemIds: string[],
  kind: OperationCycleKind,
): Promise<Map<string, CycleEntry>> {
  const map = new Map<string, CycleEntry>();
  for (const id of mlItemIds) {
    map.set(id, { active: null, latestCompleted: null });
  }
  if (mlItemIds.length === 0) return map;

  const columns = Prisma.sql`
      id, ml_item_id, kind, status, trigger_ml_qty, trigger_warehouse_qty,
      trigger_lead_time_days, warehouse_qty_at_order, ml_qty_at_collection,
      completed_ml_qty, completed_warehouse_qty, completed_lead_time_days,
      completed_at`;

  const rows = await prisma.$queryRaw<LatestCycleRow[]>(Prisma.sql`
    (SELECT DISTINCT ON (ml_item_id) ${columns}
    FROM replenishment_cycles
    WHERE organization_id = ${organizationId}
      AND ml_item_id IN (${Prisma.join(mlItemIds)})
      AND kind::text = ${kind}
      AND status::text != 'completed'
    ORDER BY ml_item_id, updated_at DESC)

    UNION ALL

    (SELECT DISTINCT ON (ml_item_id) ${columns}
    FROM replenishment_cycles
    WHERE organization_id = ${organizationId}
      AND ml_item_id IN (${Prisma.join(mlItemIds)})
      AND kind::text = ${kind}
      AND status::text = 'completed'
    ORDER BY ml_item_id, updated_at DESC)
  `);

  for (const row of rows) {
    const entry = map.get(row.ml_item_id);
    if (!entry) continue;
    const cycle = rowToCycle(row);
    if (row.status === "completed") {
      entry.latestCompleted = cycle;
    } else {
      entry.active = cycle;
    }
  }

  return map;
}

async function createCycleForItem(
  organizationId: string,
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
      create: listingCreateData(organizationId, { ...ctx.item, id: mlItemId }),
      update: listingUpsertData(ctx.item),
    });
    await tx.replenishmentCycle.create({
      data: {
        organizationId,
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
  organizationId: string,
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
    where: { id: active.id, organizationId },
    data: buildStatusTransition(record, "completed", snapshot),
  });
  return true;
}

async function maybeAutoCompleteFullCycle(
  organizationId: string,
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
    where: { id: active.id, organizationId },
    data: buildStatusTransition(record, "completed", snapshot),
  });
  return true;
}

export type OperationalPlanningSettings = {
  stockPlanning: StockPlanningValues;
  purchaseAnalysis: PurchaseAnalysisValues;
};

export async function syncPurchaseCyclesForItems(
  organizationId: string,
  items: ItemBody[],
  salesByItem: Record<string, number>,
  warehouseById: Record<
    string,
    { quantity: number; purchaseLeadTimeDays: number | null }
  >,
  settings?: OperationalPlanningSettings,
): Promise<void> {
  if (items.length === 0) return;

  const contexts = items.map((item) => {
    const warehouse = warehouseById[item.id];
    const warehouseStock = warehouse?.quantity ?? 0;
    const purchaseLead = warehouse?.purchaseLeadTimeDays ?? 0;
    const sold = salesByItem[item.id] ?? 0;
    return buildItemPlanningContext(
      item,
      warehouseStock,
      purchaseLead,
      sold,
      settings?.stockPlanning,
      settings?.purchaseAnalysis,
    );
  });

  const cycleMap = await getLatestCyclesByItemAndKind(
    organizationId,
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
      await maybeAutoCompletePurchaseCycle(organizationId, active, ctx, snapshot);
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

    await createCycleForItem(organizationId, "purchase", ctx, snapshot, "attention");
  }
}

export async function syncFullCyclesForItems(
  organizationId: string,
  items: ItemBody[],
  salesByItem: Record<string, number>,
  warehouseById: Record<
    string,
    { quantity: number; purchaseLeadTimeDays: number | null }
  >,
  settings?: OperationalPlanningSettings,
): Promise<void> {
  if (items.length === 0) return;

  const contexts = items.map((item) => {
    const warehouse = warehouseById[item.id];
    const warehouseStock = warehouse?.quantity ?? 0;
    const purchaseLead = warehouse?.purchaseLeadTimeDays ?? 0;
    const sold = salesByItem[item.id] ?? 0;
    return buildItemPlanningContext(
      item,
      warehouseStock,
      purchaseLead,
      sold,
      settings?.stockPlanning,
      settings?.purchaseAnalysis,
    );
  });

  const cycleMap = await getLatestCyclesByItemAndKind(
    organizationId,
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
      await maybeAutoCompleteFullCycle(organizationId, active, ctx, snapshot);
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

    await createCycleForItem(organizationId, "full", ctx, snapshot, "attention");
  }
}

export async function syncOperationCyclesForItems(
  organizationId: string,
  items: ItemBody[],
  salesByItem: Record<string, number>,
  warehouseById: Record<
    string,
    { quantity: number; purchaseLeadTimeDays: number | null }
  >,
  settings?: OperationalPlanningSettings,
): Promise<void> {
  return withReplenishmentSyncLock(async () => {
    if (items.length === 0) return;
    await ensureListingsForItems(organizationId, items);
    await syncPurchaseCyclesForItems(
      organizationId,
      items,
      salesByItem,
      warehouseById,
      settings,
    );
    await syncFullCyclesForItems(
      organizationId,
      items,
      salesByItem,
      warehouseById,
      settings,
    );
  });
}

export async function syncPurchaseCycleFromWarehouse(
  organizationId: string,
  mlItemId: string,
  warehouseQty: number,
  options?: { needsPurchaseAttention?: boolean },
): Promise<void> {
  const active = await prisma.replenishmentCycle.findFirst({
    where: {
      organizationId,
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
    where: { id: active.id, organizationId },
    data: buildStatusTransition(record, "completed", snapshot),
  });
}

function buildCardFromCycle(
  cycle: {
    id: string;
    mlItemId: string;
    kind: OperationCycleKind;
    status: ReplenishmentStatus;
    suggestedQty: number | null;
    notes: string | null;
    warehouseQtyAtOrder: number | null;
    mlQtyAtCollection: number | null;
  },
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
  // mlItemId já é único por org (item ML pertence a 1 seller, que pertence a
  // no máximo 1 org) — sem risco de cross-tenant mesmo sem filtro aqui.
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
  organizationId: string,
): Promise<OperationsBoardsData> {
  const operationalSettings = await loadOperationalSettings(organizationId);
  const stockPlanning = toStockPlanningValues(operationalSettings);
  const purchaseAnalysisValues = toPurchaseAnalysisValues(operationalSettings);
  const windowDays = stockPlanning.salesAverageWindowDays;
  const dateField = stockPlanning.salesWindowDateField;
  const listingIds = await fetchOperationalListingIds(token, userId, organizationId);

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
      where: { organizationId, mlItemId: { in: listingIds } },
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

  await syncOperationCyclesForItems(organizationId, items, salesByItem, warehouseById, {
    stockPlanning,
    purchaseAnalysis: purchaseAnalysisValues,
  });

  const activeCycles = await prisma.replenishmentCycle.findMany({
    where: {
      organizationId,
      mlItemId: { in: listingIds },
      status: { not: "completed" },
    },
    orderBy: { updatedAt: "desc" },
    select: {
      id: true,
      mlItemId: true,
      kind: true,
      status: true,
      suggestedQty: true,
      notes: true,
      warehouseQtyAtOrder: true,
      mlQtyAtCollection: true,
    },
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
      stockPlanning,
      purchaseAnalysisValues,
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

export async function loadOperationsSummaryFromDb(
  organizationId: string,
): Promise<OperationsSummaryCounts> {
  const cycles = await prisma.replenishmentCycle.findMany({
    where: { organizationId, status: { not: "completed" } },
    select: { kind: true, status: true },
  });
  return summarizeOperationsCounts(cycles);
}

export async function transitionReplenishmentCycle(
  organizationId: string,
  cycleId: string,
  nextStatus: ReplenishmentStatus,
  options?: { notes?: string | null; accessToken?: string },
): Promise<void> {
  const cycle = await prisma.replenishmentCycle.findFirst({
    where: { id: cycleId, organizationId },
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
    where: { id: cycleId, organizationId },
    data: {
      ...patch,
      ...(options?.notes !== undefined ? { notes: options.notes } : {}),
    },
  });
}

export async function advanceReplenishmentCycle(
  organizationId: string,
  cycleId: string,
  options?: { accessToken?: string },
): Promise<ReplenishmentStatus | null> {
  const cycle = await prisma.replenishmentCycle.findFirst({
    where: { id: cycleId, organizationId },
  });
  if (!cycle || !isActiveReplenishmentStatus(cycle.status)) {
    throw new Error("Cycle not found or inactive");
  }

  const nextStatus = nextStatusForKind(cycle.kind, cycle.status);
  if (!nextStatus) return null;

  await transitionReplenishmentCycle(organizationId, cycleId, nextStatus, {
    accessToken: options?.accessToken,
  });
  return nextStatus;
}
