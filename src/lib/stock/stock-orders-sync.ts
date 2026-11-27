import { prisma } from "@/lib/db/db";
import type { Prisma } from "@/generated/prisma";
import { fetchItemsByIdsBatched } from "@/lib/mercadolibre/api";
import { getMercadoLibreConfig } from "@/lib/mercadolibre/config";
import { mapWithConcurrency } from "@/lib/mercadolibre/concurrency";
import { MlApiFetchError, fetchWithRetry } from "@/lib/mercadolibre/fetch-with-retry";
import { itemUserProductId } from "@/lib/mercadolibre/listing-sync";
import { forEachOrdersSearchPage, type OrdersSearchPage } from "@/lib/mercadolibre/orders-search";
import type { OrderSearchOrder } from "@/lib/mercadolibre/types";
import { storedChannelFromShipment } from "@/lib/stock/stock-channel";
import { insertMovements, LEDGER_TX_OPTIONS, lockOrganizationLedger, type MovementInput } from "@/lib/stock/stock-ledger";
import { ensureStockItemsForItems, loadListingTargetIndex } from "@/lib/stock/stock-items";
import {
  orderNeedsShipment,
  planOrderStockEffects,
  type ListingStockTarget,
  type OrderShipmentInfo,
  type OrderStockPlan,
} from "@/lib/stock/stock-order-effects";

/**
 * Sincronização de vendas → estoque. Lê os pedidos alterados desde o
 * cursor (`order.date_last_updated`, que o `/orders/search` respeita —
 * conferido em nov/2026; `order.last_updated` é ignorado pelo ML) e aplica
 * `planOrderStockEffects` em cada um.
 *
 * - Volta 10 minutos no cursor a cada leitura: um pedido alterado na virada
 *   não escapa, e a chave única impede baixa dupla.
 * - MLB desconhecido (opção de venda nova, kit novo): busca o anúncio, liga
 *   pelo UP e planeja de novo — sem ninguém cadastrar nada.
 * - O envio só é lido quando precisa: linha sem nó conhecido, cancelamento
 *   (saber se saiu) ou venda de casa (canal Flex/Agência…).
 */

const CURSOR_OVERLAP_MS = 10 * 60 * 1000;
const SHIPMENT_CONCURRENCY = 6;

export type OrdersSyncResult = {
  ordersRead: number;
  movementsCreated: number;
  reviewsCreated: number;
  /** Itens de estoque com movimentação nova (a leitura do ML deles é refeita). */
  touchedStockItemIds: string[];
  cursor: Date;
};

type ReviewInput = {
  kind: "unmapped_sale" | "return_to_check";
  sourceKey: string;
  stockItemId: string | null;
  listingMlItemId: string | null;
  orderId: string;
  quantity: number;
  detectedAt: Date;
  payload: Record<string, unknown>;
};

async function fetchShipmentInfo(
  accessToken: string,
  shipmentId: string,
  signal?: AbortSignal,
): Promise<OrderShipmentInfo | null> {
  const { apiBase } = getMercadoLibreConfig();
  try {
    const res = await fetchWithRetry(
      `${apiBase}/shipments/${encodeURIComponent(shipmentId)}`,
      {
        headers: { Authorization: `Bearer ${accessToken}`, "x-format-new": "true" },
        cache: "no-store",
        signal,
      },
      { maxAttempts: 4, backoffMs: [1000, 2500, 5000] },
    );
    const body = (await res.json()) as {
      status?: string;
      tags?: string[];
      logistic?: { type?: string | null } | null;
      logistic_type?: string | null;
    };
    return {
      logisticType: body.logistic?.type ?? body.logistic_type ?? null,
      status: body.status ?? null,
      tags: Array.isArray(body.tags) ? body.tags.map(String) : [],
    };
  } catch (err) {
    if (err instanceof MlApiFetchError && err.status === 404) return null;
    throw err;
  }
}

async function fetchOrdersUpdatedBetween(
  accessToken: string,
  sellerId: number,
  from: Date,
  to: Date,
  signal?: AbortSignal,
): Promise<OrderSearchOrder[]> {
  const { apiBase } = getMercadoLibreConfig();
  const orders: OrderSearchOrder[] = [];
  await forEachOrdersSearchPage({
    from,
    to,
    signal,
    fetchPage: async (range, offset, limit) => {
      const u = new URL(`${apiBase}/orders/search`);
      u.searchParams.set("seller", String(sellerId));
      u.searchParams.set("order.date_last_updated.from", range.from.toISOString());
      u.searchParams.set("order.date_last_updated.to", range.to.toISOString());
      u.searchParams.set("offset", String(offset));
      u.searchParams.set("limit", String(limit));
      u.searchParams.set("sort", "date_desc");
      const res = await fetchWithRetry(
        u.toString(),
        { headers: { Authorization: `Bearer ${accessToken}` }, cache: "no-store", signal },
        { maxAttempts: 4, backoffMs: [1000, 2500, 5000] },
      );
      return (await res.json()) as OrdersSearchPage;
    },
    onOrders: (page) => orders.push(...page),
  });
  return orders;
}

function lineItemIds(order: OrderSearchOrder): string[] {
  return (order.order_items ?? [])
    .map((line) => line.item?.id ?? line.item_id)
    .filter((id): id is string => typeof id === "string" && id.length > 0);
}

/** Uma fatia de vendas: lê os pedidos alterados em [from, to] e grava os efeitos. */
async function processOrdersWindow(input: {
  organizationId: string;
  sellerId: number;
  accessToken: string;
  activatedAt: Date;
  from: Date;
  to: Date;
  sellerNodeIds: string[];
  now: Date;
  signal?: AbortSignal;
}): Promise<OrdersSyncResult> {
  const { organizationId, sellerId, accessToken, activatedAt, signal, now, from, to } = input;
  const orders = await fetchOrdersUpdatedBetween(accessToken, sellerId, from, to, signal);
  if (orders.length === 0) {
    return { ordersRead: 0, movementsCreated: 0, reviewsCreated: 0, touchedStockItemIds: [], cursor: to };
  }

  // Anúncios desconhecidos: busca e liga pelo UP antes de planejar.
  let index = await loadListingTargetIndex(organizationId);
  const unknown = [
    ...new Set(orders.flatMap(lineItemIds).filter((id) => !index.byMlItemId.has(id))),
  ];
  if (unknown.length > 0) {
    const items = await fetchItemsByIdsBatched(accessToken, unknown);
    await ensureStockItemsForItems(organizationId, items);
    index = await loadListingTargetIndex(organizationId);
    // Anúncio que continua sem destino mas tem UP conhecido (ex.: opção de
    // venda nova de um kit): resolve pelo UP.
    for (const item of items) {
      if (index.byMlItemId.has(item.id)) continue;
      const up = itemUserProductId(item);
      const viaUp = up ? index.byUserProductId.get(up) : undefined;
      if (viaUp) index.byMlItemId.set(item.id, viaUp);
    }
  }
  const resolveListing = (mlItemId: string): ListingStockTarget | null =>
    index.byMlItemId.get(mlItemId) ?? null;

  const sellerNodes = new Set(input.sellerNodeIds);
  const plans = new Map<string, { order: OrderSearchOrder; plan: OrderStockPlan; shipment: OrderShipmentInfo | null }>();
  for (const order of orders) {
    const plan = planOrderStockEffects({
      order,
      activatedAt,
      sellerNodeIds: sellerNodes,
      shipment: null,
      resolveListing,
      // Sem envio do ML, a venda saiu do vendedor (retirada, a combinar).
      assumeOwnWhenUnknown: !order.shipping?.id,
    });
    if (plan.phase === "paid" || plan.phase === "cancelled") {
      plans.set(plan.orderId, { order, plan, shipment: null });
    }
  }
  if (plans.size === 0) {
    return { ordersRead: orders.length, movementsCreated: 0, reviewsCreated: 0, touchedStockItemIds: [], cursor: to };
  }

  // Vendas já gravadas destes pedidos (para estorno e devolução).
  const orderIds = [...plans.keys()];
  const existingSales = await prisma.stockMovement.findMany({
    where: {
      organizationId,
      sourceType: "ml_order",
      sourceId: { in: orderIds },
      type: "sale",
    },
    select: {
      sourceId: true,
      sourceLineKey: true,
      stockItemId: true,
      location: true,
      quantity: true,
      listingMlItemId: true,
      channel: true,
      shipmentId: true,
      nodeId: true,
    },
  });
  const salesByOrder = new Map<string, typeof existingSales>();
  for (const sale of existingSales) {
    const list = salesByOrder.get(sale.sourceId) ?? [];
    list.push(sale);
    salesByOrder.set(sale.sourceId, list);
  }

  // Envio só de quem precisa.
  const needShipment = [...plans.values()].filter(({ plan, order }) => {
    if (!order.shipping?.id) return false;
    if (plan.phase === "cancelled") return (salesByOrder.get(plan.orderId)?.length ?? 0) > 0;
    return orderNeedsShipment(plan);
  });
  await mapWithConcurrency(needShipment, SHIPMENT_CONCURRENCY, async (entry) => {
    signal?.throwIfAborted();
    const shipment = await fetchShipmentInfo(accessToken, String(entry.order.shipping?.id), signal);
    entry.shipment = shipment;
    entry.plan = planOrderStockEffects({
      order: entry.order,
      activatedAt,
      sellerNodeIds: sellerNodes,
      shipment,
      resolveListing,
      assumeOwnWhenUnknown: true,
    });
  });

  const movements: MovementInput[] = [];
  const reviews: ReviewInput[] = [];
  for (const { order, plan, shipment } of plans.values()) {
    const occurredAt = plan.occurredAt ?? now;
    const shipmentId = order.shipping?.id != null ? String(order.shipping.id) : null;
    const channel = storedChannelFromShipment(shipment?.logisticType, shipment?.tags);

    if (plan.phase === "paid") {
      for (const sale of plan.sales) {
        movements.push({
          stockItemId: sale.stockItemId,
          type: "sale",
          location: sale.location,
          quantity: -sale.units,
          occurredAt,
          sourceType: "ml_order",
          sourceId: plan.orderId,
          sourceLineKey: sale.sourceLineKey,
          listingMlItemId: sale.listingMlItemId,
          channel: channel ?? (sale.location === "full" ? "fulfillment" : null),
          shipmentId,
          nodeId: sale.nodeId,
        });
      }
      for (const line of plan.unmapped) {
        reviews.push({
          kind: "unmapped_sale",
          sourceKey: `${plan.orderId}:${line.listingMlItemId}`,
          stockItemId: null,
          listingMlItemId: line.listingMlItemId,
          orderId: plan.orderId,
          quantity: line.units,
          detectedAt: now,
          payload: {
            title: line.title,
            location: line.location,
            channel,
            shipmentId,
            occurredAt: occurredAt.toISOString(),
          },
        });
      }
      const ownSales = plan.sales.filter((s) => s.location === "own");
      if (plan.returnSignaled && ownSales.length > 0) {
        reviews.push({
          kind: "return_to_check",
          sourceKey: `${plan.orderId}:return`,
          stockItemId: ownSales[0].stockItemId,
          listingMlItemId: ownSales[0].listingMlItemId,
          orderId: plan.orderId,
          quantity: ownSales.reduce((sum, s) => sum + s.units, 0),
          detectedAt: now,
          payload: {
            reason: "returned",
            lines: ownSales.map((s) => ({
              stockItemId: s.stockItemId,
              units: s.units,
              listingMlItemId: s.listingMlItemId,
            })),
          },
        });
      }
      continue;
    }

    // Cancelado: só mexe no que já foi baixado.
    const recorded = salesByOrder.get(plan.orderId) ?? [];
    if (recorded.length === 0) continue;
    const dispatched = plan.dispatched;
    const returnLines: Array<{ stockItemId: string; units: number; listingMlItemId: string | null }> = [];
    for (const sale of recorded) {
      if (dispatched === true) {
        if (sale.location === "own") {
          returnLines.push({
            stockItemId: sale.stockItemId,
            units: -sale.quantity,
            listingMlItemId: sale.listingMlItemId,
          });
        }
        continue;
      }
      movements.push({
        stockItemId: sale.stockItemId,
        type: "sale_reversal",
        location: sale.location,
        quantity: -sale.quantity,
        occurredAt: order.date_last_updated ? new Date(order.date_last_updated) : now,
        sourceType: "ml_order",
        sourceId: plan.orderId,
        sourceLineKey: sale.sourceLineKey,
        listingMlItemId: sale.listingMlItemId,
        channel: sale.channel,
        shipmentId: sale.shipmentId,
        nodeId: sale.nodeId,
        reason: "Venda cancelada antes do envio",
      });
    }
    if (returnLines.length > 0) {
      reviews.push({
        kind: "return_to_check",
        sourceKey: `${plan.orderId}:cancel`,
        stockItemId: returnLines[0].stockItemId,
        listingMlItemId: returnLines[0].listingMlItemId,
        orderId: plan.orderId,
        quantity: returnLines.reduce((sum, l) => sum + l.units, 0),
        detectedAt: now,
        payload: { reason: "cancelled_after_dispatch", lines: returnLines },
      });
    }
  }

  const { created, reviewsCreated } = await prisma.$transaction(async (tx) => {
    await lockOrganizationLedger(tx, organizationId);
    const createdMovements = await insertMovements(tx, organizationId, movements);
    let createdReviews = 0;
    if (reviews.length > 0) {
      const result = await tx.stockReviewItem.createMany({
        data: reviews.map((r) => ({
          organizationId,
          kind: r.kind,
          sourceKey: r.sourceKey,
          stockItemId: r.stockItemId,
          listingMlItemId: r.listingMlItemId,
          orderId: r.orderId,
          quantity: r.quantity,
          detectedAt: r.detectedAt,
          payload: r.payload as Prisma.InputJsonValue,
        })),
        skipDuplicates: true,
      });
      createdReviews = result.count;
    }
    return { created: createdMovements, reviewsCreated: createdReviews };
  }, LEDGER_TX_OPTIONS);

  return {
    ordersRead: orders.length,
    movementsCreated: created.length,
    reviewsCreated,
    touchedStockItemIds: [...new Set(created.map((m) => m.stockItemId))],
    cursor: to,
  };
}

/** Tamanho de cada fatia de leitura de vendas. */
const SLICE_MS = 6 * 60 * 60 * 1000;

/**
 * Sincronização de vendas → estoque, em fatias de 6 h da mais antiga para a
 * mais nova. Cada fatia grava os efeitos e avança o cursor (`onSliceDone`)
 * antes da próxima. Passado o orçamento de tempo, para e devolve o cursor da
 * última fatia concluída: a próxima rodada continua dali, sem perder nem
 * repetir nada (a chave única impede baixa dupla). A janela normal, de
 * minutos, é uma fatia só.
 */
export async function syncStockOrders(input: {
  organizationId: string;
  sellerId: number;
  accessToken: string;
  activatedAt: Date;
  cursor: Date;
  sellerNodeIds: string[];
  now: Date;
  /** Para depois deste tempo (fatia em andamento termina). Sem valor: lê tudo. */
  budgetMs?: number;
  signal?: AbortSignal;
  onSliceDone?: (cursor: Date) => Promise<void>;
}): Promise<OrdersSyncResult & { complete: boolean }> {
  const startedAt = Date.now();
  let from = new Date(
    Math.max(input.activatedAt.getTime(), input.cursor.getTime() - CURSOR_OVERLAP_MS),
  );
  const total: OrdersSyncResult = {
    ordersRead: 0,
    movementsCreated: 0,
    reviewsCreated: 0,
    touchedStockItemIds: [],
    cursor: input.cursor,
  };
  const touched = new Set<string>();
  for (;;) {
    const to = new Date(Math.min(input.now.getTime(), from.getTime() + SLICE_MS));
    const slice = await processOrdersWindow({ ...input, from, to });
    total.ordersRead += slice.ordersRead;
    total.movementsCreated += slice.movementsCreated;
    total.reviewsCreated += slice.reviewsCreated;
    for (const id of slice.touchedStockItemIds) touched.add(id);
    total.cursor = to;
    await input.onSliceDone?.(to);
    if (to.getTime() >= input.now.getTime()) {
      return { ...total, touchedStockItemIds: [...touched], complete: true };
    }
    if (input.budgetMs != null && Date.now() - startedAt > input.budgetMs) {
      return { ...total, touchedStockItemIds: [...touched], complete: false };
    }
    from = to;
  }
}
