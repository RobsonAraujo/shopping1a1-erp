import { stockPlanningConfig } from "@/config/stock-planning";
import type { StockPlanningValues } from "@/config/stock-planning";
import { purchaseAnalysisConfig } from "@/config/purchase-analysis";
import type { PurchaseAnalysisValues } from "@/config/purchase-analysis";
import type {
  OperationCycleKind,
  ReplenishmentStatus,
} from "@/generated/prisma/client";
import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/db/db";
import { buildPurchasePlan, computePurchaseAnalysis } from "@/lib/compras/purchase-analysis";
import {
  loadOperationalSettings,
  toPurchaseAnalysisValues,
  toStockPlanningValues,
} from "@/lib/configuracoes/operational-settings";
import {
  buildStatusTransition,
  finalStatusForKind,
  isActiveReplenishmentStatus,
  isOverdueBadgeSuppressed,
  shouldAutoCompleteFullCycle,
  shouldAutoCompletePurchaseCycle,
  shouldCreateFullCycle,
  shouldCreatePurchaseCycle,
  summarizeBoardCounts,
  summarizeOperationsCounts,
  type OperationsSummaryCounts,
  type ReplenishmentSnapshot,
} from "@/lib/compras/replenishment-cycle";
import {
  firstColumn,
  lastColumn,
  loadOrMaterializeKanbanColumns,
  type KanbanColumnRow,
} from "@/lib/compras/kanban-columns-data";
import {
  fetchItemsByIdsBatched,
  fetchOperationalListingIds,
} from "@/lib/mercadolibre/api";
import {
  fetchUnitsSoldForItemsInWindowCached,
  readCachedUnitsSoldForItemsInWindow,
} from "@/lib/mercadolibre/sales-window-cache";
import { mapWithConcurrency } from "@/lib/mercadolibre/concurrency";
import { bestItemImageUrl } from "@/lib/mercadolibre/item-image";
import { getItemSku, getSkuSupplier, isKitItem } from "@/lib/mercadolibre/item-sku";
import {
  loadInactiveProductMlItemIds,
  loadSupplierNamesByMlItemId,
} from "@/lib/products/product-resolver";
import {
  upsertListingFromItem,
  upsertListingsFromItems,
} from "@/lib/mercadolibre/listing-sync";
import { mlAvailableStockUnits } from "@/lib/mercadolibre/ml-available-stock";
import {
  KANBAN_POSITION_GAP,
  renormalizedPositions,
} from "@/lib/kanban/kanban-position";
import { computeStockPlanningDisplay } from "@/lib/compras/stock-planning";
import type { ItemBody } from "@/lib/mercadolibre/types";
import type { StockPlanningDisplay } from "@/lib/compras/stock-planning";

/** Cada item do board sincroniza de forma independente (auto-completar ou
 * criar ciclo) — rodar em paralelo, com um teto, em vez de um `for await`
 * sequencial, evita que abrir o board vire N round-trips de banco em série
 * (N = itens ativos do seller) a cada carregamento. */
const SYNC_CONCURRENCY = 8;

async function ensureListingsForItems(
  organizationId: string,
  items: ItemBody[],
): Promise<void> {
  await upsertListingsFromItems(organizationId, items);
}

/** Chave = organizationId (+kind quando informado) — sync de orgs/kinds
 * diferentes não precisa esperar um no outro; só dois syncs do MESMO board
 * da MESMA org (duas abas, dois usuários) precisam serializar pra não
 * criar ciclo duplicado (não há unique constraint pra isso no schema). */
const replenishmentSyncTails = new Map<string, Promise<void>>();

function withReplenishmentSyncLock<T>(
  key: string,
  fn: () => Promise<T>,
): Promise<T> {
  const tail = replenishmentSyncTails.get(key) ?? Promise.resolve();
  const run = tail.then(fn);
  const settled = run.then(
    () => undefined,
    () => undefined,
  );
  replenishmentSyncTails.set(key, settled);
  void settled.then(() => {
    if (replenishmentSyncTails.get(key) === settled) {
      replenishmentSyncTails.delete(key);
    }
  });
  return run;
}

export type OperationsBoardCard = {
  cycleId: string;
  mlItemId: string;
  kind: OperationCycleKind;
  status: ReplenishmentStatus;
  /** Coluna do board (Kanban estilo Trello, por organização) — fonte da
   * verdade de onde o card aparece; `status` continua dirigindo a automação
   * (ver comentário no schema), mas não é mais 1:1 com a coluna visual. */
  columnId: string;
  columnLabel: string;
  /** Posição da coluna na ordem do board — usada por `supplier-board.ts`
   * pra decidir "fornecedor avançou ou regrediu" sem precisar conhecer o
   * board inteiro de novo. */
  columnPosition: number;
  /** Ordem manual dentro da coluna (`ReplenishmentCycle.position`) —
   * crescente = de cima pra baixo. Ver `lib/kanban/kanban-position.ts`. */
  position: number;
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
  /** Explica de onde vem `purchaseStartsOn`/`searchStartsOn` (esgotamento
   * previsto − lead time) — mesmo texto já usado em outras telas via
   * `MetricWithHint`, evita datas "soltas" sem contexto pro usuário. */
  purchaseStartsOnTooltip: string;
  searchStartsOnTooltip: string;
  needsSchedulingAttention: boolean;
  notes: string | null;
  warehouseQtyAtOrder: number | null;
  mlQtyAtCollection: number | null;
  /** ISO de `ReplenishmentCycle.updatedAt` — o client usa isso pra decidir
   * qual versão de um card é mais recente ao mesclar respostas concorrentes
   * (drag otimista confirmado vs. um resync em streaming que partiu antes
   * do drag terminar). */
  updatedAt: string;
  /** `true` quando os campos derivados de venda acima (`purchaseIsOverdue`,
   * `searchIsOverdue`, `purchaseStartsOn`, `searchStartsOn`, tooltips)
   * ainda não têm um valor de venda real por trás — nascem neutros (ver
   * `computeStockPlanningDisplay` com `unitsSoldInWindow <= 0`) até o
   * streaming trazer o valor de verdade e destravar a UI (`BlurredValue`).
   */
  salesPending: boolean;
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

/**
 * Card novo nasce **no topo** da primeira coluna, acima de tudo o que o
 * usuário já organizou. O sync cria ciclos em paralelo
 * (`mapWithConcurrency`), então ler o mínimo a cada criação daria a mesma
 * posição pra dois cards: aqui o mínimo é lido uma vez só (e só se algum
 * ciclo for de fato criado) e cada chamada reserva o próprio degrau de forma
 * síncrona, antes do `await`.
 */
function topPositionAllocator(
  organizationId: string,
  kind: OperationCycleKind,
  columnId: string,
): () => Promise<number> {
  let base: Promise<number> | null = null;
  let taken = 0;
  return async () => {
    base ??= prisma.replenishmentCycle
      .aggregate({
        where: { organizationId, kind, columnId, status: { not: "completed" } },
        _min: { position: true },
      })
      .then((result) => result._min.position ?? KANBAN_POSITION_GAP);
    taken += 1;
    const offset = taken;
    return (await base) - offset * KANBAN_POSITION_GAP;
  };
}

async function createCycleForItem(
  organizationId: string,
  kind: OperationCycleKind,
  ctx: ItemPlanningContext,
  snapshot: ReplenishmentSnapshot,
  initialStatus: ReplenishmentStatus,
  columnId: string,
  nextTopPosition: () => Promise<number>,
): Promise<void> {
  const mlItemId = ctx.item.id.trim();
  if (!mlItemId) return;
  const position = await nextTopPosition();

  await prisma.$transaction(async (tx) => {
    await upsertListingFromItem(organizationId, { ...ctx.item, id: mlItemId }, tx);
    await tx.replenishmentCycle.create({
      data: {
        organizationId,
        mlItemId,
        kind,
        status: initialStatus,
        columnId,
        position,
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

  const [cycleMap, columns] = await Promise.all([
    getLatestCyclesByItemAndKind(organizationId, items.map((item) => item.id), "purchase"),
    loadOrMaterializeKanbanColumns(organizationId, "purchase"),
  ]);
  const firstColumnId = firstColumn(columns)!.id;
  const nextTopPosition = topPositionAllocator(organizationId, "purchase", firstColumnId);

  await mapWithConcurrency(contexts, SYNC_CONCURRENCY, async (ctx) => {
    const { active, latestCompleted } =
      cycleMap.get(ctx.item.id) ?? { active: null, latestCompleted: null };
    const snapshot = snapshotForItem(
      ctx.item,
      ctx.warehouseStock,
      ctx.purchaseLead,
    );

    if (active) {
      await maybeAutoCompletePurchaseCycle(organizationId, active, ctx, snapshot);
      return;
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

    if (!shouldCreate || !ctx.item.id.trim()) return;

    await createCycleForItem(
      organizationId,
      "purchase",
      ctx,
      snapshot,
      "attention",
      firstColumnId,
      nextTopPosition,
    );
  });
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

  const [cycleMap, columns] = await Promise.all([
    getLatestCyclesByItemAndKind(organizationId, items.map((item) => item.id), "full"),
    loadOrMaterializeKanbanColumns(organizationId, "full"),
  ]);
  const firstColumnId = firstColumn(columns)!.id;
  const nextTopPosition = topPositionAllocator(organizationId, "full", firstColumnId);

  await mapWithConcurrency(contexts, SYNC_CONCURRENCY, async (ctx) => {
    const { active, latestCompleted } =
      cycleMap.get(ctx.item.id) ?? { active: null, latestCompleted: null };
    const snapshot = snapshotForItem(
      ctx.item,
      ctx.warehouseStock,
      ctx.purchaseLead,
    );

    if (active) {
      await maybeAutoCompleteFullCycle(organizationId, active, ctx, snapshot);
      return;
    }

    const shouldCreate = shouldCreateFullCycle(
      {
        needsSchedulingAttention: ctx.fullPlan.needsSchedulingAttention,
        snapshot,
      },
      latestCompleted ? toCycleRecord(latestCompleted) : null,
    );

    if (!shouldCreate || !ctx.item.id.trim()) return;

    await createCycleForItem(
      organizationId,
      "full",
      ctx,
      snapshot,
      "attention",
      firstColumnId,
      nextTopPosition,
    );
  });
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
  /** Sem valor = sincroniza os dois tipos (comportamento antigo). Passar um
   * tipo evita o loop de sync do outro board quando a página que chamou só
   * usa um dos dois (Compras só lê `purchase`, Operações Full só lê `full`). */
  kind?: OperationCycleKind,
): Promise<void> {
  const lockKey = `${organizationId}:${kind ?? "purchase+full"}`;
  return withReplenishmentSyncLock(lockKey, async () => {
    if (items.length === 0) return;
    await ensureListingsForItems(organizationId, items);
    if (kind === undefined || kind === "purchase") {
      await syncPurchaseCyclesForItems(
        organizationId,
        items,
        salesByItem,
        warehouseById,
        settings,
      );
    }
    if (kind === undefined || kind === "full") {
      await syncFullCyclesForItems(
        organizationId,
        items,
        salesByItem,
        warehouseById,
        settings,
      );
    }
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
    where: { mlItemId, organizationId },
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

type CycleForCard = {
  id: string;
  mlItemId: string;
  kind: OperationCycleKind;
  status: ReplenishmentStatus;
  columnId: string | null;
  position: number;
  suggestedQty: number | null;
  notes: string | null;
  warehouseQtyAtOrder: number | null;
  mlQtyAtCollection: number | null;
  updatedAt: Date;
};

/** Ordem do board: a manual (`position`), com o mais novo primeiro como
 * desempate estável. Nunca `updatedAt` — qualquer escrita no ciclo (um sync
 * mudando `suggestedQty`) faria o card pular pro topo. */
const BOARD_CYCLE_ORDER: Prisma.ReplenishmentCycleOrderByWithRelationInput[] = [
  { position: "asc" },
  { createdAt: "desc" },
];

const BOARD_CYCLE_SELECT = {
  id: true,
  mlItemId: true,
  kind: true,
  status: true,
  columnId: true,
  position: true,
  suggestedQty: true,
  notes: true,
  warehouseQtyAtOrder: true,
  mlQtyAtCollection: true,
  updatedAt: true,
} satisfies Prisma.ReplenishmentCycleSelect;

/** Resolve a coluna de um ciclo pro card — cai na primeira coluna do kind
 * (fallback defensivo) se `columnId` estiver nulo ou apontar pra uma coluna
 * que não existe mais nesse mapa (não deveria acontecer em operação normal:
 * `deleteKanbanColumn` sempre realoca os cards antes de excluir a coluna). */
function resolveCardColumn(
  cycle: Pick<CycleForCard, "kind" | "columnId">,
  columnsByKind: Map<OperationCycleKind, KanbanColumnRow[]>,
): KanbanColumnRow {
  const columns = columnsByKind.get(cycle.kind) ?? [];
  const found = cycle.columnId
    ? columns.find((c) => c.id === cycle.columnId)
    : undefined;
  return found ?? columns[0] ?? { id: "", kind: cycle.kind, label: "?", position: 0, isLocked: true };
}

function buildCardFromCycle(
  cycle: CycleForCard,
  ctx: ItemPlanningContext,
  item: ItemBody,
  supplierNames: Map<string, string>,
  salesPending: boolean,
  columnsByKind: Map<OperationCycleKind, KanbanColumnRow[]>,
): OperationsBoardCard {
  const sku = getItemSku(item);
  const column = resolveCardColumn(cycle, columnsByKind);
  return {
    cycleId: cycle.id,
    mlItemId: cycle.mlItemId,
    kind: cycle.kind,
    status: cycle.status,
    columnId: column.id,
    columnLabel: column.label,
    columnPosition: column.position,
    position: cycle.position,
    title: item.title,
    sku,
    supplier: supplierNames.get(item.id) ?? getSkuSupplier(sku),
    imageUrl: bestItemImageUrl(item) ?? null,
    mlStock: mlAvailableStockUnits(item),
    warehouseStock: ctx.warehouseStock,
    suggestedQty: cycle.suggestedQty,
    purchaseIsOverdue: isOverdueBadgeSuppressed(cycle.kind, cycle.status)
      ? false
      : ctx.purchasePlan.purchaseIsOverdue,
    searchIsOverdue: isOverdueBadgeSuppressed(cycle.kind, cycle.status)
      ? false
      : ctx.fullPlan.searchIsOverdue,
    purchaseStartsOn: ctx.purchasePlan.purchaseStartsOn,
    searchStartsOn: ctx.fullPlan.searchStartsOn,
    purchaseStartsOnTooltip: ctx.purchasePlan.tooltips.purchase,
    searchStartsOnTooltip: ctx.fullPlan.tooltips.search,
    needsSchedulingAttention: ctx.fullPlan.needsSchedulingAttention,
    notes: cycle.notes,
    warehouseQtyAtOrder: cycle.warehouseQtyAtOrder,
    mlQtyAtCollection: cycle.mlQtyAtCollection,
    updatedAt: cycle.updatedAt.toISOString(),
    salesPending,
  };
}

/** Reusado pelo caminho completo (`loadOperationsBoards`), pelo fast path
 * (`loadOperationsBoardsFast`) e pela fase final do streaming
 * (`streamOperationsBoardResync`) — só muda o que cada um passa em
 * `salesByItem`/`salesPendingIds`. */
function buildBoardCardsFromCycles(
  cycles: CycleForCard[],
  itemById: Map<string, ItemBody>,
  warehouseById: Record<
    string,
    { quantity: number; purchaseLeadTimeDays: number | null }
  >,
  salesByItem: Record<string, number>,
  supplierNames: Map<string, string>,
  stockPlanning: StockPlanningValues,
  purchaseAnalysisValues: PurchaseAnalysisValues,
  columnsByKind: Map<OperationCycleKind, KanbanColumnRow[]>,
  salesPendingIds?: Set<string>,
): { purchaseCards: OperationsBoardCard[]; fullCards: OperationsBoardCard[] } {
  const purchaseCards: OperationsBoardCard[] = [];
  const fullCards: OperationsBoardCard[] = [];

  for (const cycle of cycles) {
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
    const card = buildCardFromCycle(
      cycle,
      ctx,
      item,
      supplierNames,
      salesPendingIds?.has(cycle.mlItemId) ?? false,
      columnsByKind,
    );

    if (cycle.kind === "purchase") {
      purchaseCards.push(card);
    } else {
      fullCards.push(card);
    }
  }

  return { purchaseCards, fullCards };
}

/** Materializa as colunas do(s) kind(s) pedido(s) — sem `kind`, materializa
 * os dois (mesmo comportamento "board duplo" de `loadOperationsBoards` sem
 * `kind`). Uma chamada por load do board, não por card. */
async function loadColumnsByKind(
  organizationId: string,
  kind?: OperationCycleKind,
): Promise<Map<OperationCycleKind, KanbanColumnRow[]>> {
  const kinds: OperationCycleKind[] = kind ? [kind] : ["purchase", "full"];
  const entries = await Promise.all(
    kinds.map(
      async (k) => [k, await loadOrMaterializeKanbanColumns(organizationId, k)] as const,
    ),
  );
  return new Map(entries);
}

export async function loadOperationsBoards(
  token: string,
  userId: number,
  organizationId: string,
  /** Sem valor = computa os dois boards (compra + full), como antes. Compras
   * só usa `purchase`; Operações Full só usa `full` — passar o `kind` certo
   * evita sincronizar/consultar o board que a página não vai exibir. */
  kind?: OperationCycleKind,
): Promise<OperationsBoardsData> {
  const operationalSettings = await loadOperationalSettings(organizationId);
  const stockPlanning = toStockPlanningValues(operationalSettings);
  const purchaseAnalysisValues = toPurchaseAnalysisValues(operationalSettings);
  const windowDays = stockPlanning.salesAverageWindowDays;
  const dateField = stockPlanning.salesWindowDateField;
  const listingIds = await fetchOperationalListingIds(token, userId, organizationId);

  const [rawItems, salesByItem, warehouseStocks, supplierNames, inactiveIds] =
    await Promise.all([
      fetchItemsByIdsBatched(token, listingIds),
      fetchUnitsSoldForItemsInWindowCached(
        organizationId,
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
      loadSupplierNamesByMlItemId(organizationId, listingIds),
      loadInactiveProductMlItemIds(organizationId, listingIds),
    ]);
  // Produto inativado pelo usuário some do board (sem tocar o
  // ReplenishmentCycle já existente — reativar o produto traz o card de
  // volta sozinho no próximo load).
  const items = rawItems.filter(
    (item) => !isKitItem(item) && !inactiveIds.has(item.id),
  );

  const warehouseById = Object.fromEntries(
    warehouseStocks.map((row) => [
      row.mlItemId,
      {
        quantity: row.quantity,
        purchaseLeadTimeDays: row.purchaseLeadTimeDays,
      },
    ]),
  );

  await syncOperationCyclesForItems(
    organizationId,
    items,
    salesByItem,
    warehouseById,
    { stockPlanning, purchaseAnalysis: purchaseAnalysisValues },
    kind,
  );

  const [activeCycles, columnsByKind] = await Promise.all([
    prisma.replenishmentCycle.findMany({
      where: {
        organizationId,
        mlItemId: { in: listingIds },
        status: { not: "completed" },
        ...(kind ? { kind } : {}),
      },
      orderBy: BOARD_CYCLE_ORDER,
      select: BOARD_CYCLE_SELECT,
    }),
    loadColumnsByKind(organizationId, kind),
  ]);

  const itemById = new Map(items.map((item) => [item.id, item]));
  const { purchaseCards, fullCards } = buildBoardCardsFromCycles(
    activeCycles,
    itemById,
    warehouseById,
    salesByItem,
    supplierNames,
    stockPlanning,
    purchaseAnalysisValues,
    columnsByKind,
  );

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

function emptyOperationsBoardsData(): OperationsBoardsData {
  return {
    purchase: { cards: [], summary: summarizeBoardCounts("purchase", []) },
    full: { cards: [], summary: summarizeBoardCounts("full", []) },
    summary: summarizeOperationsCounts([]),
  };
}

/**
 * Render rápido inicial dos kanbans (Compras/Operações Full) — sem
 * `fetchOperationalListingIds` (varredura ao vivo do catálogo ML inteiro) e
 * sem `syncOperationCyclesForItems`. Lê os ciclos já persistidos (a coluna
 * do kanban é 100% derivada de `ReplenishmentCycle.status`, nunca de venda)
 * e só os itens que JÁ têm ciclo ativo — tipicamente bem menor que o
 * catálogo inteiro. Vendas vêm só do cache (`readCachedUnitsSoldForItemsInWindow`,
 * sem busca ao vivo); cache-miss vira `salesPending: true` no card, pra UI
 * borrar até `streamOperationsBoardResync` completar o resto em background.
 */
export async function loadOperationsBoardsFast(
  organizationId: string,
  token: string,
  kind: OperationCycleKind,
  /** Colunas que a página já está carregando — sem isso a página e este
   * loader materializavam as colunas duas vezes em paralelo (e, numa org
   * nova, concorriam para criar as colunas padrão). */
  columnsPromise?: Promise<KanbanColumnRow[]>,
): Promise<OperationsBoardsData> {
  const activeCycles = await prisma.replenishmentCycle.findMany({
    where: { organizationId, kind, status: { not: "completed" } },
    orderBy: BOARD_CYCLE_ORDER,
    select: BOARD_CYCLE_SELECT,
  });

  if (activeCycles.length === 0) return emptyOperationsBoardsData();

  const mlItemIds = [...new Set(activeCycles.map((c) => c.mlItemId))];

  const operationalSettings = await loadOperationalSettings(organizationId);
  const stockPlanning = toStockPlanningValues(operationalSettings);
  const purchaseAnalysisValues = toPurchaseAnalysisValues(operationalSettings);
  const windowDays = stockPlanning.salesAverageWindowDays;
  const dateField = stockPlanning.salesWindowDateField;

  const [rawItems, warehouseStocks, supplierNames, cachedSales, inactiveIds, columnsByKind] =
    await Promise.all([
      fetchItemsByIdsBatched(token, mlItemIds),
      prisma.warehouseStock.findMany({
        where: { organizationId, mlItemId: { in: mlItemIds } },
        select: { mlItemId: true, quantity: true, purchaseLeadTimeDays: true },
      }),
      loadSupplierNamesByMlItemId(organizationId, mlItemIds),
      readCachedUnitsSoldForItemsInWindow(organizationId, mlItemIds, windowDays, dateField),
      loadInactiveProductMlItemIds(organizationId, mlItemIds),
      columnsPromise
        ? columnsPromise.then((columns) => new Map([[kind, columns]]))
        : loadColumnsByKind(organizationId, kind),
    ]);
  const items = rawItems.filter(
    (item) => !isKitItem(item) && !inactiveIds.has(item.id),
  );

  const warehouseById = Object.fromEntries(
    warehouseStocks.map((row) => [
      row.mlItemId,
      { quantity: row.quantity, purchaseLeadTimeDays: row.purchaseLeadTimeDays },
    ]),
  );

  const salesPendingIds = new Set(mlItemIds.filter((id) => !(id in cachedSales)));

  const itemById = new Map(items.map((item) => [item.id, item]));
  const { purchaseCards, fullCards } = buildBoardCardsFromCycles(
    activeCycles,
    itemById,
    warehouseById,
    cachedSales,
    supplierNames,
    stockPlanning,
    purchaseAnalysisValues,
    columnsByKind,
    salesPendingIds,
  );

  const summary = summarizeOperationsCounts(
    activeCycles.map((cycle) => ({ kind: cycle.kind, status: cycle.status })),
  );

  return {
    purchase: {
      cards: purchaseCards,
      summary: summarizeBoardCounts("purchase", purchaseCards.map((c) => c.status)),
    },
    full: {
      cards: fullCards,
      summary: summarizeBoardCounts("full", fullCards.map((c) => c.status)),
    },
    summary,
  };
}

export type OperationsCardSalesPatch = Pick<
  OperationsBoardCard,
  | "purchaseIsOverdue"
  | "searchIsOverdue"
  | "purchaseStartsOn"
  | "searchStartsOn"
  | "purchaseStartsOnTooltip"
  | "searchStartsOnTooltip"
> & { salesPending: false };

/**
 * Contraparte em background de `loadOperationsBoardsFast` — o pipeline
 * completo de sempre (`fetchOperationalListingIds` + varredura de vendas +
 * `syncOperationCyclesForItems`), só que reporta cada venda resolvida via
 * `onCardPatch` conforme chega (em vez de fazer o caller esperar tudo),
 * pra rota de streaming poder emitir um evento SSE por item. Itens/estoque/
 * fornecedor são aguardados ANTES de disparar a busca de vendas (o
 * callback precisa de `itemById`/`warehouseById` prontos) — essas 3 buscas
 * já são baratas (bateladas), o custo dominante é `fetchOperationalListingIds`,
 * que já é serial em ambos os casos.
 */
export async function streamOperationsBoardResync(
  token: string,
  userId: number,
  organizationId: string,
  kind: OperationCycleKind,
  onCardPatch: (mlItemId: string, patch: OperationsCardSalesPatch) => void,
  /** Cliente desistiu (fechou a página, StrictMode remontou): pula o sync de
   * ciclos e o snapshot final — o próximo load do board refaz tudo. */
  signal?: AbortSignal,
): Promise<SingleBoardData | null> {
  const operationalSettings = await loadOperationalSettings(organizationId);
  const stockPlanning = toStockPlanningValues(operationalSettings);
  const purchaseAnalysisValues = toPurchaseAnalysisValues(operationalSettings);
  const windowDays = stockPlanning.salesAverageWindowDays;
  const dateField = stockPlanning.salesWindowDateField;
  const listingIds = await fetchOperationalListingIds(token, userId, organizationId);

  const [rawItems, warehouseStocks, supplierNames, inactiveIds] = await Promise.all([
    fetchItemsByIdsBatched(token, listingIds),
    prisma.warehouseStock.findMany({
      where: { organizationId, mlItemId: { in: listingIds } },
      select: { mlItemId: true, quantity: true, purchaseLeadTimeDays: true },
    }),
    loadSupplierNamesByMlItemId(organizationId, listingIds),
    loadInactiveProductMlItemIds(organizationId, listingIds),
  ]);
  const items = rawItems.filter(
    (item) => !isKitItem(item) && !inactiveIds.has(item.id),
  );
  const itemById = new Map(items.map((item) => [item.id, item]));

  const warehouseById = Object.fromEntries(
    warehouseStocks.map((row) => [
      row.mlItemId,
      { quantity: row.quantity, purchaseLeadTimeDays: row.purchaseLeadTimeDays },
    ]),
  );

  // Snapshot leve do status atual (pré-sync) só para a badge "Urgente" do
  // patch em streaming não reaparecer num card já além da etapa de ação
  // (ex.: "Coletado"/"Comprado") — o card final, montado depois do sync em
  // `buildCardFromCycle`, já recalcula isso com o status mais fresco.
  const cycleStatusById = new Map(
    (
      await prisma.replenishmentCycle.findMany({
        where: {
          organizationId,
          mlItemId: { in: listingIds },
          kind,
          status: { not: "completed" },
        },
        select: { mlItemId: true, status: true },
      })
    ).map((c) => [c.mlItemId, c.status]),
  );

  const salesByItem = await fetchUnitsSoldForItemsInWindowCached(
    organizationId,
    token,
    userId,
    listingIds,
    windowDays,
    dateField,
    (mlItemId, unitsSold) => {
      // Só itens que já são card neste board: a varredura cobre o catálogo
      // inteiro, e um evento por anúncio sem card era só tráfego e
      // re-render à toa no client. Ciclo criado pelo sync abaixo chega
      // completo no evento `done`.
      const status = cycleStatusById.get(mlItemId);
      if (!status) return;
      const item = itemById.get(mlItemId);
      if (!item) return;
      const warehouse = warehouseById[mlItemId];
      const ctx = buildItemPlanningContext(
        item,
        warehouse?.quantity ?? 0,
        warehouse?.purchaseLeadTimeDays ?? 0,
        unitsSold,
        stockPlanning,
        purchaseAnalysisValues,
      );
      const suppressOverdue = isOverdueBadgeSuppressed(kind, status);
      onCardPatch(mlItemId, {
        purchaseIsOverdue: suppressOverdue ? false : ctx.purchasePlan.purchaseIsOverdue,
        searchIsOverdue: suppressOverdue ? false : ctx.fullPlan.searchIsOverdue,
        purchaseStartsOn: ctx.purchasePlan.purchaseStartsOn,
        searchStartsOn: ctx.fullPlan.searchStartsOn,
        purchaseStartsOnTooltip: ctx.purchasePlan.tooltips.purchase,
        searchStartsOnTooltip: ctx.fullPlan.tooltips.search,
        salesPending: false,
      });
    },
  );

  if (signal?.aborted) return null;

  await syncOperationCyclesForItems(
    organizationId,
    items,
    salesByItem,
    warehouseById,
    { stockPlanning, purchaseAnalysis: purchaseAnalysisValues },
    kind,
  );

  const [activeCycles, columnsByKind] = await Promise.all([
    prisma.replenishmentCycle.findMany({
      where: {
        organizationId,
        mlItemId: { in: listingIds },
        status: { not: "completed" },
        kind,
      },
      orderBy: BOARD_CYCLE_ORDER,
      select: BOARD_CYCLE_SELECT,
    }),
    loadColumnsByKind(organizationId, kind),
  ]);

  const { purchaseCards, fullCards } = buildBoardCardsFromCycles(
    activeCycles,
    itemById,
    warehouseById,
    salesByItem,
    supplierNames,
    stockPlanning,
    purchaseAnalysisValues,
    columnsByKind,
  );

  const cards = kind === "purchase" ? purchaseCards : fullCards;
  return {
    cards,
    summary: summarizeBoardCounts(kind, cards.map((c) => c.status)),
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

export type MovedCycleRow = {
  cycleId: string;
  columnId: string;
  status: ReplenishmentStatus;
  position: number;
  updatedAt: string;
  warehouseQtyAtOrder: number | null;
  mlQtyAtCollection: number | null;
};

export type MoveCyclesResult =
  | { ok: true; rows: MovedCycleRow[] }
  | { ok: false; error: "not_found" | "mixed_kinds" | "invalid_column" };

type CycleRow = NonNullable<Awaited<ReturnType<typeof prisma.replenishmentCycle.findFirst>>>;

/**
 * Escreve o movimento de `cycles` para `target` — o núcleo comum do drag
 * (`moveReplenishmentCycles`) e da exclusão de coluna
 * (`relocateColumnCycles`), pra regra de status nunca divergir entre os dois:
 *
 * - Ciclo que **já está** na coluna alvo: só `position` (reordenar dentro da
 *   coluna nunca reescreve status — inclusive na coluna final).
 * - Ciclo que **muda** de coluna: entrar na última coluna (travada) do kind
 *   vira o status final e captura o snapshot (`buildStatusTransition`);
 *   qualquer outra coluna vira `"attention"` — ver comentário no schema.
 *
 * O snapshot sai do banco (estoque do galpão), sem rede. A única exceção é o
 * Full entrando na coluna final pela primeira vez: `mlQtyAtCollection` é a
 * linha de base que detecta a chegada no Full, então vale o estoque ML ao
 * vivo — e só dos itens que precisam disso.
 *
 * Fecha renumerando a coluna alvo quando o ponto médio ficou apertado demais
 * (`renormalizedPositions`), na mesma transação.
 */
async function writeCycleMoves(
  organizationId: string,
  kind: OperationCycleKind,
  cycles: CycleRow[],
  columns: KanbanColumnRow[],
  target: KanbanColumnRow,
  positionFor: (cycle: CycleRow, index: number) => number,
  accessToken?: string,
): Promise<MovedCycleRow[]> {
  const isFinal = target.id === lastColumn(columns)?.id;
  const nextStatus = isFinal ? finalStatusForKind(kind) : "attention";
  const changing = cycles.filter((c) => c.columnId !== target.id);
  const changingItemIds = [...new Set(changing.map((c) => c.mlItemId))];

  const needsLiveMlQty =
    kind === "full" && isFinal && Boolean(accessToken) &&
    changing.some((c) => c.mlQtyAtCollection === null);
  const [warehouseRows, liveItems] = await Promise.all([
    changingItemIds.length > 0
      ? prisma.warehouseStock.findMany({
          where: { organizationId, mlItemId: { in: changingItemIds } },
          select: { mlItemId: true, quantity: true, purchaseLeadTimeDays: true },
        })
      : Promise.resolve([]),
    needsLiveMlQty && accessToken
      ? fetchItemsByIdsBatched(
          accessToken,
          changing.filter((c) => c.mlQtyAtCollection === null).map((c) => c.mlItemId),
        )
      : Promise.resolve([] as ItemBody[]),
  ]);
  const warehouseByItem = new Map(warehouseRows.map((w) => [w.mlItemId, w]));
  const liveMlQtyByItem = new Map(liveItems.map((item) => [item.id, mlAvailableStockUnits(item)]));

  const touchedIds = await prisma.$transaction(async (tx) => {
    await Promise.all(
      cycles.map((cycle, index) => {
        const position = positionFor(cycle, index);
        if (cycle.columnId === target.id) {
          return tx.replenishmentCycle.update({
            where: { id: cycle.id, organizationId },
            data: { position },
          });
        }
        const warehouse = warehouseByItem.get(cycle.mlItemId);
        const snapshot: ReplenishmentSnapshot = {
          mlQty: liveMlQtyByItem.get(cycle.mlItemId) ?? cycle.triggerMlQty,
          warehouseQty: warehouse?.quantity ?? cycle.triggerWarehouseQty,
          leadTimeDays: warehouse?.purchaseLeadTimeDays ?? cycle.triggerLeadTimeDays ?? 0,
        };
        return tx.replenishmentCycle.update({
          where: { id: cycle.id, organizationId },
          data: {
            ...buildStatusTransition(toCycleRecord(cycle), nextStatus, snapshot),
            columnId: target.id,
            position,
          },
        });
      }),
    );

    const ids = new Set(cycles.map((c) => c.id));
    const inColumn = await tx.replenishmentCycle.findMany({
      where: { organizationId, columnId: target.id, status: { not: "completed" } },
      select: { id: true, position: true },
    });
    const renumbered = renormalizedPositions(inColumn.map((c) => c.position));
    if (renumbered) {
      const changed = inColumn.filter((c) => renumbered.get(c.position) !== c.position);
      await Promise.all(
        changed.map((c) =>
          tx.replenishmentCycle.update({
            where: { id: c.id, organizationId },
            data: { position: renumbered.get(c.position)! },
          }),
        ),
      );
      for (const c of changed) ids.add(c.id);
    }
    return [...ids];
  });

  const rows = await prisma.replenishmentCycle.findMany({
    where: { organizationId, id: { in: touchedIds } },
    select: {
      id: true,
      columnId: true,
      status: true,
      position: true,
      updatedAt: true,
      warehouseQtyAtOrder: true,
      mlQtyAtCollection: true,
    },
  });
  return rows.map((row) => ({
    cycleId: row.id,
    columnId: row.columnId ?? target.id,
    status: row.status,
    position: row.position,
    updatedAt: row.updatedAt.toISOString(),
    warehouseQtyAtOrder: row.warehouseQtyAtOrder,
    mlQtyAtCollection: row.mlQtyAtCollection,
  }));
}

/**
 * Drag-and-drop no board: põe `cycleIds` na coluna `columnId`, na posição
 * `position` (já calculada pelo client entre os vizinhos visíveis — ver
 * `kanban-dnd.ts`). Em Operações Full é 1 ciclo; em Compras são os ciclos do
 * fornecedor que terminam naquela coluna (todos compartilham a posição, o
 * card do fornecedor é o agregado deles). Ciclos já completados ou de outra
 * org são ignorados — podem ter sido concluídos por outra aba entre o load e
 * o drag.
 */
export async function moveReplenishmentCycles(
  organizationId: string,
  cycleIds: string[],
  columnId: string,
  position: number,
  options?: { accessToken?: string },
): Promise<MoveCyclesResult> {
  const cycles = (
    await prisma.replenishmentCycle.findMany({
      where: { id: { in: [...new Set(cycleIds)] }, organizationId },
    })
  ).filter((c) => isActiveReplenishmentStatus(c.status));
  if (cycles.length === 0) return { ok: false, error: "not_found" };

  const kind = cycles[0].kind;
  if (!cycles.every((c) => c.kind === kind)) return { ok: false, error: "mixed_kinds" };

  const columns = await loadOrMaterializeKanbanColumns(organizationId, kind);
  const target = columns.find((c) => c.id === columnId);
  if (!target) return { ok: false, error: "invalid_column" };

  const rows = await writeCycleMoves(
    organizationId,
    kind,
    cycles,
    columns,
    target,
    () => position,
    options?.accessToken,
  );
  return { ok: true, rows };
}

/**
 * Antes de excluir uma coluna: leva os cards dela pro **fim** de `toColumnId`,
 * na mesma ordem relativa, aplicando a mesma regra de status do drag —
 * realocar para a última coluna vira o status final, como se cada card
 * tivesse sido arrastado. Sem isso, os cards chegavam na coluna final ainda
 * como `"attention"` (badge Urgente e auto-complete inconsistentes).
 */
export async function relocateColumnCycles(
  organizationId: string,
  fromColumnId: string,
  toColumnId: string,
  options?: { accessToken?: string },
): Promise<MoveCyclesResult> {
  if (fromColumnId === toColumnId) return { ok: false, error: "invalid_column" };
  const from = await prisma.kanbanColumn.findFirst({
    where: { id: fromColumnId, organizationId },
    select: { kind: true },
  });
  if (!from) return { ok: false, error: "invalid_column" };

  const columns = await loadOrMaterializeKanbanColumns(organizationId, from.kind);
  const target = columns.find((c) => c.id === toColumnId);
  if (!target) return { ok: false, error: "invalid_column" };

  const [cycles, destination] = await Promise.all([
    prisma.replenishmentCycle.findMany({
      where: { organizationId, columnId: fromColumnId, status: { not: "completed" } },
      orderBy: BOARD_CYCLE_ORDER,
    }),
    prisma.replenishmentCycle.aggregate({
      where: { organizationId, columnId: toColumnId, status: { not: "completed" } },
      _max: { position: true },
    }),
  ]);
  if (cycles.length === 0) return { ok: true, rows: [] };

  const base = destination._max.position ?? 0;
  const rows = await writeCycleMoves(
    organizationId,
    from.kind,
    cycles,
    columns,
    target,
    (_cycle, index) => base + (index + 1) * KANBAN_POSITION_GAP,
    options?.accessToken,
  );
  return { ok: true, rows };
}
