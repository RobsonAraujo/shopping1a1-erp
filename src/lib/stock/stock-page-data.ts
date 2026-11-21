import { prisma } from "@/lib/db/db";
import type { StockMovementType, StockReviewKind } from "@/generated/prisma";
import { getSkuSupplier } from "@/lib/mercadolibre/item-sku";
import { computeEffectivePricingCost } from "@/lib/pricing/product-pricing";
import { stockChannelLabel } from "@/lib/stock/stock-channel";
import { computeStockPosition, type StockAlert } from "@/lib/stock/stock-position";
import { loadStockSyncStatus } from "@/lib/stock/stock-sync";

/**
 * Leituras do banco para as telas do estoque automático. Tudo serializável
 * (datas como ISO, sem `bigint`/`Decimal`) para ir direto para Client
 * Components. A tela não chama o ML ao abrir: os números do ML vêm da
 * última sincronização (`StockItemMlPosition`).
 */

export type StockListingChip = {
  mlItemId: string;
  listingTypeId: string | null;
  mlStatus: string | null;
  registered: boolean;
};

export type StockPositionRow = {
  stockItemId: string;
  title: string;
  sku: string | null;
  imageUrl: string | null;
  supplierName: string;
  primaryMlItemId: string | null;
  listings: StockListingChip[];
  hasFull: boolean;
  own: number;
  warehouse: number | null;
  deposit: number | null;
  fullAvailable: number | null;
  fullUnavailable: number | null;
  fullTotal: number | null;
  total: number | null;
  alerts: StockAlert[];
  mlReadAt: string | null;
  /** Custo unitário do lote vigente (efetivo: NF/ST + IPI), `null` sem custo. */
  unitCost: number | null;
  /** Custo do próximo lote, quando diferente do vigente. */
  nextUnitCost: number | null;
  /** Unidades do lote vigente que ainda faltam vender antes do próximo custo. */
  unitsBeforeNextCost: number | null;
  stockValue: number | null;
  openReviews: number;
  leadTimeDays: number | null;
};

export type StockOverview = {
  activatedAt: string;
  rows: StockPositionRow[];
  sync: {
    lastOrdersSyncAt: string | null;
    lastPositionsSyncAt: string | null;
    lastError: string | null;
    running: boolean;
  };
  openReviewsByKind: Record<StockReviewKind, number>;
};

/**
 * Custo unitário de um lote no mesmo critério da precificação (NF ou ST + IPI,
 * `computeEffectivePricingCost`) mais os custos extras — é o custo que a
 * Lucratividade e a Central usam por unidade.
 */
export function lotUnitCost(lot: {
  unitCostNf: unknown;
  purchaseIcmsPercent?: unknown;
  hasIcmsSt: boolean;
  purchaseCostWithSt: unknown;
  ipiPercent: unknown;
  extraCosts: unknown;
  costKnown: boolean;
}): number | null {
  if (!lot.costKnown) return null;
  const base = computeEffectivePricingCost({
    unitCostNf: Number(lot.unitCostNf),
    purchaseIcmsPercent: Number(lot.purchaseIcmsPercent ?? 0),
    hasIcmsSt: lot.hasIcmsSt,
    purchaseCostWithSt: lot.purchaseCostWithSt == null ? null : Number(lot.purchaseCostWithSt),
    ipiPercent: Number(lot.ipiPercent),
    isMonophasic: false,
    pisCofinsPercent: 0,
  });
  return base == null ? null : base + Number(lot.extraCosts);
}

export async function loadStockSettings(organizationId: string) {
  return prisma.stockSettings.findUnique({
    where: { organizationId },
    select: { activatedAt: true, legacyWarehouseIncludesMl: true },
  });
}

export async function loadStockOverview(organizationId: string): Promise<StockOverview | null> {
  const settings = await loadStockSettings(organizationId);
  if (!settings) return null;

  const [items, products, warehouse, lots, reviews, sync] = await Promise.all([
    prisma.stockItem.findMany({
      where: { organizationId },
      select: {
        id: true,
        title: true,
        sku: true,
        imageUrl: true,
        primaryMlItemId: true,
        balance: { select: { ownQty: true } },
        mlPosition: true,
        listings: {
          select: { mlItemId: true, listingTypeId: true, mlStatus: true, activeOnMl: true },
        },
      },
    }),
    prisma.product.findMany({
      where: { organizationId },
      select: { mlItemId: true, active: true, supplier: { select: { name: true } } },
    }),
    prisma.warehouseStock.findMany({
      where: { organizationId },
      select: { mlItemId: true, purchaseLeadTimeDays: true },
    }),
    prisma.stockLot.findMany({
      where: { organizationId, status: { in: ["active", "queued"] } },
      orderBy: { receivedAt: "asc" },
      select: {
        stockItemId: true,
        status: true,
        quantity: true,
        consumedQty: true,
        costKnown: true,
        unitCostNf: true,
        purchaseIcmsPercent: true,
        hasIcmsSt: true,
        purchaseCostWithSt: true,
        ipiPercent: true,
        extraCosts: true,
      },
    }),
    prisma.stockReviewItem.groupBy({
      by: ["kind", "stockItemId"],
      where: { organizationId, status: "open" },
      _count: { _all: true },
    }),
    loadStockSyncStatus(organizationId),
  ]);

  const productByMlb = new Map(products.map((p) => [p.mlItemId, p]));
  const leadByMlb = new Map(warehouse.map((w) => [w.mlItemId, w.purchaseLeadTimeDays]));
  const lotsByItem = new Map<string, typeof lots>();
  for (const lot of lots) {
    const list = lotsByItem.get(lot.stockItemId) ?? [];
    list.push(lot);
    lotsByItem.set(lot.stockItemId, list);
  }
  const reviewsByItem = new Map<string, number>();
  const openReviewsByKind: Record<StockReviewKind, number> = {
    unmapped_sale: 0,
    return_to_check: 0,
  };
  for (const r of reviews) {
    openReviewsByKind[r.kind] += r._count._all;
    if (r.stockItemId) reviewsByItem.set(r.stockItemId, (reviewsByItem.get(r.stockItemId) ?? 0) + r._count._all);
  }

  const rows: StockPositionRow[] = [];
  for (const item of items) {
    const listingProducts = item.listings.map((l) => productByMlb.get(l.mlItemId));
    const own = item.balance?.ownQty ?? 0;
    const anyLive = item.listings.some((l) => l.activeOnMl);
    const anyActiveProduct = listingProducts.some((p) => p?.active);
    const hasStock = own !== 0 || (item.mlPosition?.fullTotalQty ?? 0) > 0 || (item.mlPosition?.depositQty ?? 0) > 0;
    // Item sem anúncio vivo, sem cadastro ativo e sem estoque não polui a lista.
    if (!anyLive && !anyActiveProduct && !hasStock) continue;

    const hasFull =
      item.mlPosition?.fullTotalQty != null
        ? item.mlPosition.fullTotalQty > 0 || (item.mlPosition.fullAvailableQty ?? 0) > 0
        : false;
    const position = computeStockPosition({
      ownQty: own,
      ml: item.mlPosition
        ? {
            depositQty: item.mlPosition.depositQty,
            fullAvailableQty: item.mlPosition.fullAvailableQty,
            fullTransferQty: item.mlPosition.fullTransferQty,
            fullOtherQty: item.mlPosition.fullOtherQty,
            fullTotalQty: item.mlPosition.fullTotalQty,
            fetchedAt: item.mlPosition.fetchedAt,
            error: item.mlPosition.error,
          }
        : null,
      hasFull,
    });

    const itemLots = lotsByItem.get(item.id) ?? [];
    const activeLot = itemLots.find((l) => l.status === "active") ?? null;
    const nextLot = itemLots.find((l) => l.status === "queued") ?? null;
    const unitCost = activeLot ? lotUnitCost(activeLot) : null;
    const nextUnitCost = nextLot ? lotUnitCost(nextLot) : null;
    const primaryProduct =
      (item.primaryMlItemId ? productByMlb.get(item.primaryMlItemId) : undefined) ??
      listingProducts.find(Boolean);

    rows.push({
      stockItemId: item.id,
      title: item.title,
      sku: item.sku,
      imageUrl: item.imageUrl,
      supplierName: primaryProduct?.supplier?.name ?? getSkuSupplier(item.sku),
      primaryMlItemId: item.primaryMlItemId,
      listings: item.listings.map((l) => ({
        mlItemId: l.mlItemId,
        listingTypeId: l.listingTypeId,
        mlStatus: l.mlStatus,
        registered: productByMlb.has(l.mlItemId),
      })),
      hasFull,
      own: position.own,
      warehouse: position.warehouse,
      deposit: position.deposit,
      fullAvailable: position.fullAvailable,
      fullUnavailable: position.fullUnavailable,
      fullTotal: position.fullTotal,
      total: position.total,
      alerts: position.alerts,
      mlReadAt: item.mlPosition?.fetchedAt?.toISOString() ?? null,
      unitCost,
      nextUnitCost: nextUnitCost != null && unitCost != null && Math.abs(nextUnitCost - unitCost) >= 0.005 ? nextUnitCost : null,
      unitsBeforeNextCost: activeLot && nextLot ? Math.max(0, activeLot.quantity - activeLot.consumedQty) : null,
      stockValue: unitCost != null && position.total != null ? Math.max(0, position.total) * unitCost : null,
      openReviews: reviewsByItem.get(item.id) ?? 0,
      leadTimeDays: item.primaryMlItemId ? (leadByMlb.get(item.primaryMlItemId) ?? null) : null,
    });
  }

  rows.sort((a, b) =>
    a.supplierName.localeCompare(b.supplierName, "pt-BR", { sensitivity: "base" }) ||
    a.title.localeCompare(b.title, "pt-BR", { sensitivity: "base" }),
  );

  return {
    activatedAt: settings.activatedAt.toISOString(),
    rows,
    sync: {
      lastOrdersSyncAt: sync.lastOrdersSyncAt?.toISOString() ?? null,
      lastPositionsSyncAt: sync.lastPositionsSyncAt?.toISOString() ?? null,
      lastError: sync.lastError,
      running: sync.running,
    },
    openReviewsByKind,
  };
}

// ─── Extrato ─────────────────────────────────────────────────────────────

export const MOVEMENT_TYPE_LABEL: Record<StockMovementType, string> = {
  opening: "Saldo inicial",
  entry: "Entrada",
  entry_reversal: "Estorno de entrada",
  sale: "Venda",
  sale_reversal: "Venda cancelada",
  return_in: "Devolução",
  full_transfer: "Envio ao Full",
  full_return: "Voltou do Full",
  adjustment: "Ajuste",
  manual_out: "Saída manual",
  inventory_count: "Inventário",
};

export type StockMovementRow = {
  id: string;
  occurredAt: string;
  stockItemId: string;
  itemTitle: string;
  itemSku: string | null;
  type: StockMovementType;
  typeLabel: string;
  location: "own" | "full";
  quantity: number;
  channelLabel: string | null;
  listingMlItemId: string | null;
  sourceId: string;
  sourceType: string;
  reason: string | null;
  note: string | null;
};

export async function loadStockMovements(input: {
  organizationId: string;
  stockItemId?: string | null;
  types?: StockMovementType[] | null;
  location?: "own" | "full" | null;
  from?: Date | null;
  to?: Date | null;
  limit?: number;
  cursor?: string | null;
}): Promise<{ rows: StockMovementRow[]; nextCursor: string | null }> {
  const limit = Math.min(Math.max(input.limit ?? 100, 1), 500);
  const movements = await prisma.stockMovement.findMany({
    where: {
      organizationId: input.organizationId,
      ...(input.stockItemId ? { stockItemId: input.stockItemId } : {}),
      ...(input.types && input.types.length > 0 ? { type: { in: input.types } } : {}),
      ...(input.location ? { location: input.location } : {}),
      ...(input.from || input.to
        ? { occurredAt: { ...(input.from ? { gte: input.from } : {}), ...(input.to ? { lte: input.to } : {}) } }
        : {}),
    },
    orderBy: [{ occurredAt: "desc" }, { id: "desc" }],
    take: limit + 1,
    ...(input.cursor ? { cursor: { id: input.cursor }, skip: 1 } : {}),
    select: {
      id: true,
      occurredAt: true,
      stockItemId: true,
      type: true,
      location: true,
      quantity: true,
      channel: true,
      listingMlItemId: true,
      sourceId: true,
      sourceType: true,
      reason: true,
      note: true,
      stockItem: { select: { title: true, sku: true } },
    },
  });
  const page = movements.slice(0, limit);
  return {
    rows: page.map((m) => ({
      id: m.id,
      occurredAt: m.occurredAt.toISOString(),
      stockItemId: m.stockItemId,
      itemTitle: m.stockItem.title,
      itemSku: m.stockItem.sku,
      type: m.type,
      typeLabel: MOVEMENT_TYPE_LABEL[m.type],
      location: m.location,
      quantity: m.quantity,
      channelLabel: m.type === "sale" || m.type === "sale_reversal" ? stockChannelLabel(m.channel) : null,
      listingMlItemId: m.listingMlItemId,
      sourceId: m.sourceId,
      sourceType: m.sourceType,
      reason: m.reason,
      note: m.note,
    })),
    nextCursor: movements.length > limit ? (page[page.length - 1]?.id ?? null) : null,
  };
}

// ─── Pendências ──────────────────────────────────────────────────────────

export type StockReviewRow = {
  id: string;
  kind: StockReviewKind;
  quantity: number;
  detectedAt: string;
  stockItemId: string | null;
  itemTitle: string | null;
  itemSku: string | null;
  listingMlItemId: string | null;
  orderId: string | null;
  /** Título do anúncio vendido (venda sem item). */
  listingTitle: string | null;
  reason: string | null;
};

export async function loadOpenStockReviews(organizationId: string): Promise<StockReviewRow[]> {
  const reviews = await prisma.stockReviewItem.findMany({
    where: { organizationId, status: "open" },
    orderBy: { detectedAt: "desc" },
    take: 300,
  });
  const itemIds = [...new Set(reviews.map((r) => r.stockItemId).filter((v): v is string => Boolean(v)))];
  const items = await prisma.stockItem.findMany({
    where: { organizationId, id: { in: itemIds } },
    select: { id: true, title: true, sku: true },
  });
  const itemById = new Map(items.map((i) => [i.id, i]));
  return reviews.map((r) => {
    const payload = (r.payload ?? {}) as { title?: string | null; reason?: string | null };
    const item = r.stockItemId ? itemById.get(r.stockItemId) : undefined;
    return {
      id: r.id,
      kind: r.kind,
      quantity: r.quantity,
      detectedAt: r.detectedAt.toISOString(),
      stockItemId: r.stockItemId,
      itemTitle: item?.title ?? null,
      itemSku: item?.sku ?? null,
      listingMlItemId: r.listingMlItemId,
      orderId: r.orderId,
      listingTitle: payload.title ?? null,
      reason: payload.reason ?? null,
    };
  });
}

// ─── Entradas ────────────────────────────────────────────────────────────

export type StockEntryRow = {
  id: string;
  arrivedAt: string;
  supplierName: string | null;
  invoiceNumber: string | null;
  notes: string | null;
  status: "active" | "reversed";
  units: number;
  value: number | null;
  lines: Array<{
    lotId: string;
    stockItemId: string;
    itemTitle: string;
    itemSku: string | null;
    quantity: number;
    consumedQty: number;
    unitCost: number | null;
    lotStatus: "queued" | "active" | "depleted";
  }>;
  canReverse: boolean;
};

export async function loadStockEntries(organizationId: string, limit = 100): Promise<StockEntryRow[]> {
  const entries = await prisma.stockEntry.findMany({
    where: { organizationId },
    orderBy: [{ arrivedAt: "desc" }, { createdAt: "desc" }],
    take: limit,
    include: {
      supplier: { select: { name: true } },
      lots: {
        include: { stockItem: { select: { title: true, sku: true } } },
        orderBy: { createdAt: "asc" },
      },
    },
  });
  return entries.map((e) => {
    const lines = e.lots.map((lot) => ({
      lotId: lot.id,
      stockItemId: lot.stockItemId,
      itemTitle: lot.stockItem.title,
      itemSku: lot.stockItem.sku,
      quantity: lot.quantity,
      consumedQty: lot.consumedQty,
      unitCost: lotUnitCost(lot),
      lotStatus: lot.status,
    }));
    const values = lines.map((l) => (l.unitCost == null ? null : l.unitCost * l.quantity));
    return {
      id: e.id,
      arrivedAt: e.arrivedAt.toISOString(),
      supplierName: e.supplier?.name ?? null,
      invoiceNumber: e.invoiceNumber,
      notes: e.notes,
      status: e.status,
      units: lines.reduce((sum, l) => sum + l.quantity, 0),
      value: values.every((v) => v != null) ? values.reduce((sum, v) => sum + (v ?? 0), 0) : null,
      lines,
      canReverse: e.status === "active" && lines.every((l) => l.consumedQty === 0),
    };
  });
}

/** Itens para o seletor da entrada (título, SKU, custo vigente para pré-preencher). */
export type StockItemOption = {
  stockItemId: string;
  title: string;
  sku: string | null;
  imageUrl: string | null;
  supplierName: string | null;
  /** Em casa agora (para a saída avisar quando passa do que tem). */
  ownQty: number;
  /**
   * Unidades que ainda restam no lote do custo vigente (`null` sem lote com
   * custo conhecido) — a entrada com custo novo avisa que elas continuam no
   * custo atual até acabarem.
   */
  lotRemaining: number | null;
  cost: {
    unitCostNf: number;
    purchaseIcmsPercent: number;
    hasIcmsSt: boolean;
    purchaseCostWithSt: number | null;
    ipiPercent: number;
    extraCosts: number;
  } | null;
};

export async function loadStockItemOptions(organizationId: string): Promise<StockItemOption[]> {
  const [items, lots, products] = await Promise.all([
    prisma.stockItem.findMany({
      where: { organizationId },
      select: {
        id: true,
        title: true,
        sku: true,
        imageUrl: true,
        primaryMlItemId: true,
        balance: { select: { ownQty: true } },
        listings: { select: { mlItemId: true, activeOnMl: true } },
      },
      orderBy: { title: "asc" },
    }),
    prisma.stockLot.findMany({
      where: { organizationId, status: "active", costKnown: true },
      orderBy: { receivedAt: "asc" },
    }),
    prisma.product.findMany({
      where: { organizationId },
      select: {
        mlItemId: true,
        needsCostReview: true,
        unitCostNf: true,
        purchaseIcmsPercent: true,
        hasIcmsSt: true,
        purchaseCostWithSt: true,
        ipiPercent: true,
        extraCosts: true,
        supplier: { select: { name: true } },
      },
    }),
  ]);
  const lotByItem = new Map<string, (typeof lots)[number]>();
  for (const lot of lots) if (!lotByItem.has(lot.stockItemId)) lotByItem.set(lot.stockItemId, lot);
  const productByMlb = new Map(products.map((p) => [p.mlItemId, p]));

  return items.map((item) => {
    const product =
      (item.primaryMlItemId ? productByMlb.get(item.primaryMlItemId) : undefined) ??
      item.listings.map((l) => productByMlb.get(l.mlItemId)).find(Boolean);
    const lot = lotByItem.get(item.id);
    const source = lot ?? (product && !product.needsCostReview ? product : null);
    return {
      stockItemId: item.id,
      title: item.title,
      sku: item.sku,
      imageUrl: item.imageUrl,
      supplierName: product?.supplier?.name ?? null,
      ownQty: item.balance?.ownQty ?? 0,
      lotRemaining: lot ? Math.max(0, lot.quantity - lot.consumedQty) : null,
      cost: source
        ? {
            unitCostNf: Number(source.unitCostNf),
            purchaseIcmsPercent: Number(source.purchaseIcmsPercent),
            hasIcmsSt: source.hasIcmsSt,
            purchaseCostWithSt: source.purchaseCostWithSt == null ? null : Number(source.purchaseCostWithSt),
            ipiPercent: Number(source.ipiPercent),
            extraCosts: Number(source.extraCosts),
          }
        : null,
    };
  });
}

export async function loadSupplierOptions(organizationId: string) {
  return prisma.supplier.findMany({
    where: { organizationId, active: true },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });
}

// ─── Detalhe de um item (gaveta) ─────────────────────────────────────────

export type StockItemDetail = {
  lots: Array<{
    id: string;
    receivedAt: string;
    quantity: number;
    consumedQty: number;
    status: "queued" | "active" | "depleted";
    unitCost: number | null;
    entryId: string | null;
  }>;
  movements: StockMovementRow[];
};

export async function loadStockItemDetail(
  organizationId: string,
  stockItemId: string,
): Promise<StockItemDetail | null> {
  const item = await prisma.stockItem.findFirst({
    where: { id: stockItemId, organizationId },
    select: { id: true },
  });
  if (!item) return null;
  const [lots, movements] = await Promise.all([
    prisma.stockLot.findMany({
      where: { organizationId, stockItemId },
      orderBy: { receivedAt: "desc" },
      take: 20,
    }),
    loadStockMovements({ organizationId, stockItemId, limit: 50 }),
  ]);
  return {
    lots: lots.map((lot) => ({
      id: lot.id,
      receivedAt: lot.receivedAt.toISOString(),
      quantity: lot.quantity,
      consumedQty: lot.consumedQty,
      status: lot.status,
      unitCost: lotUnitCost(lot),
      entryId: lot.entryId,
    })),
    movements: movements.rows,
  };
}
