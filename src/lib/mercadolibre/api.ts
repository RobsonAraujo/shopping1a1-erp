import { reportsConfig } from "@/config/reports";
import { stockPlanningConfig } from "@/config/stock-planning";
import { prisma } from "@/lib/db/db";
import { roundMoney } from "@/lib/pricing/financial-margin";
import { zonedYmd } from "@/lib/report-timezone";
import { getMercadoLibreConfig } from "./config";
import { fetchWithRetry } from "./fetch-with-retry";
import { mapWithConcurrency } from "./concurrency";
import {
  forEachOrdersSearchPage,
  type ForEachOrdersSearchPageOptions,
} from "./orders-search";
import {
  aggregateFulfillmentSnapshots,
  collectInventoryIdsFromItem,
  emptyFulfillmentStock,
  isFulfillmentListing,
  parseFulfillmentStockResponse,
  type FulfillmentStockSnapshot,
  type ItemFulfillmentStock,
} from "./fulfillment-stock";
import {
  getCalendarMonthLabels,
  getCalendarMonthRanges,
  type CalendarMonthLabels,
} from "./revenue-periods";
import type {
  CatalogProductItem,
  CatalogProductItemsResponse,
  CategoryBody,
  ItemBody,
  ItemPriceToWinResponse,
  ItemBulkEntry,
  ItemsSearchResponse,
  OrderSearchOrder,
  OrderSearchResponse,
  UserMe,
} from "./types";

export async function fetchMe(accessToken: string): Promise<UserMe> {
  const { apiBase } = getMercadoLibreConfig();
  const res = await fetch(`${apiBase}/users/me`, {
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: "no-store",
  });
  if (!res.ok) {
    throw new Error(`users/me failed: ${res.status}`);
  }
  return res.json() as Promise<UserMe>;
}

export async function fetchUserItemsSearch(
  accessToken: string,
  userId: number,
  offset: number,
  limit: number,
  options?: { status?: string; catalog_listing?: boolean; tags?: string },
): Promise<ItemsSearchResponse> {
  const { apiBase } = getMercadoLibreConfig();
  const u = new URL(`${apiBase}/users/${userId}/items/search`);
  u.searchParams.set("offset", String(offset));
  u.searchParams.set("limit", String(limit));
  u.searchParams.set("status", options?.status ?? "active");
  if (options?.catalog_listing !== undefined) {
    u.searchParams.set(
      "catalog_listing",
      options.catalog_listing ? "true" : "false",
    );
  }
  if (options?.tags) u.searchParams.set("tags", options.tags);

  const res = await fetch(u.toString(), {
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: "no-store",
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`items/search failed: ${res.status} ${t}`);
  }
  return res.json() as Promise<ItemsSearchResponse>;
}

/** Máximo de ids por chamada do `/items/bulk` (acima disso, 400 "Too many IDs"). */
export const ITEMS_BULK_MAX_IDS = 20;

/** Só entradas com sucesso: as de erro (`{ id, status_code: 404, error }`) não são anúncio. */
function normalizeItemBulkEntry(entry: ItemBulkEntry): ItemBody | null {
  if (!entry || typeof entry !== "object") return null;
  const status = entry.status_code ?? entry.code;
  if (typeof status === "number" && (status < 200 || status >= 300)) return null;
  const body = entry.body;
  if (!body || typeof body !== "object" || !body.id) return null;
  return body;
}

async function fetchItemsBulkChunk(
  accessToken: string,
  ids: string[],
): Promise<ItemBody[]> {
  const { apiBase } = getMercadoLibreConfig();
  const u = new URL(`${apiBase}/items/bulk`);
  u.searchParams.set("ids", ids.join(","));

  const res = await fetch(u.toString(), {
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: "no-store",
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`items multiget failed: ${res.status} ${t}`);
  }

  const data = (await res.json()) as ItemBulkEntry[];
  if (!Array.isArray(data)) return [];
  return data
    .map((entry) => normalizeItemBulkEntry(entry))
    .filter((x): x is ItemBody => x !== null);
}

/**
 * Multiget de anúncios via `/items/bulk?ids=`. O ML aposentou o `/items?ids=`
 * (migração pedida até 25/10/2026; em 2026-11-06 ele já respondia, de forma
 * intermitente, 403 `ResourceDeprecated` "client no longer allowed to consume
 * this resource"). O corpo de cada anúncio é o mesmo; o envelope muda para
 * `{ id, status_code, body | error }` e a ordem da resposta não é garantida —
 * devolvemos na ordem pedida, sem os ids que falharam.
 */
export async function fetchItemsByIds(
  accessToken: string,
  ids: string[],
): Promise<ItemBody[]> {
  if (ids.length === 0) return [];
  const items: ItemBody[] = [];
  for (let i = 0; i < ids.length; i += ITEMS_BULK_MAX_IDS) {
    items.push(
      ...(await fetchItemsBulkChunk(accessToken, ids.slice(i, i + ITEMS_BULK_MAX_IDS))),
    );
  }
  const position = new Map(ids.map((id, index) => [id, index] as const));
  return items.sort(
    (a, b) =>
      (position.get(a.id) ?? Number.MAX_SAFE_INTEGER) -
      (position.get(b.id) ?? Number.MAX_SAFE_INTEGER),
  );
}

export async function fetchItemById(
  accessToken: string,
  id: string,
): Promise<ItemBody | null> {
  const items = await fetchItemsByIds(accessToken, [id]);
  return items[0] ?? null;
}

export async function fetchCategoryById(
  accessToken: string,
  categoryId: string,
): Promise<CategoryBody | null> {
  const { apiBase } = getMercadoLibreConfig();
  const res = await fetch(`${apiBase}/categories/${categoryId}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: "no-store",
  });
  if (!res.ok) return null;
  return res.json() as Promise<CategoryBody>;
}

export async function fetchCategoriesByIds(
  accessToken: string,
  categoryIds: string[],
): Promise<Record<string, CategoryBody>> {
  const unique = [...new Set(categoryIds.filter(Boolean))];
  const entries = await Promise.all(
    unique.map(async (id) => {
      const category = await fetchCategoryById(accessToken, id);
      return category ? ([id, category] as const) : null;
    }),
  );
  return Object.fromEntries(
    entries.filter((entry): entry is [string, CategoryBody] => entry !== null),
  );
}

export async function fetchItemPriceToWin(
  accessToken: string,
  itemId: string,
): Promise<ItemPriceToWinResponse> {
  const { apiBase } = getMercadoLibreConfig();
  const res = await fetchWithRetry(`${apiBase}/items/${itemId}/price_to_win`, {
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: "no-store",
  });
  return res.json() as Promise<ItemPriceToWinResponse>;
}

/** Teto de ofertas lidas por produto: o mais barato quase sempre está no começo. */
/**
 * Até 3 páginas (o ML devolve 100 por página). A ordem da lista é quase por
 * preço, mas não estrita (no probe de 2026-11-12, ofertas de R$ 61,90 e
 * R$ 69,49 vieram no fim de uma página que ia até R$ 136,85): cortar na
 * primeira página poderia esconder o concorrente mais barato.
 */
const CATALOG_PRODUCT_ITEMS_MAX = 300;

/**
 * As ofertas (todos os vendedores, inclusive o próprio) de um produto de
 * catálogo, paginando até `CATALOG_PRODUCT_ITEMS_MAX`. Lança em erro HTTP (via
 * `fetchWithRetry`): quem chama decide que falha não vira dado.
 */
export async function fetchCatalogProductItems(
  accessToken: string,
  catalogProductId: string,
): Promise<CatalogProductItem[]> {
  const { apiBase } = getMercadoLibreConfig();
  const items: CatalogProductItem[] = [];
  let offset = 0;
  while (items.length < CATALOG_PRODUCT_ITEMS_MAX) {
    const url = new URL(`${apiBase}/products/${encodeURIComponent(catalogProductId)}/items`);
    if (offset > 0) url.searchParams.set("offset", String(offset));
    const res = await fetchWithRetry(url.toString(), {
      headers: { Authorization: `Bearer ${accessToken}` },
      cache: "no-store",
    });
    const body = (await res.json()) as CatalogProductItemsResponse;
    const results = Array.isArray(body.results) ? body.results : [];
    items.push(...results);
    const total = body.paging?.total ?? items.length;
    const limit = body.paging?.limit ?? results.length;
    if (results.length === 0 || limit <= 0) break;
    offset += limit;
    if (offset >= total) break;
  }
  return items.slice(0, CATALOG_PRODUCT_ITEMS_MAX);
}

export type SalesWindowDateField = "date_closed" | "date_created";

function setOrderDateRange(
  u: URL,
  field: SalesWindowDateField,
  fromIso: string,
  toIso: string,
) {
  const prefix =
    field === "date_closed" ? "order.date_closed" : "order.date_created";
  u.searchParams.set(`${prefix}.from`, fromIso);
  u.searchParams.set(`${prefix}.to`, toIso);
}

function listingIdFromOrderLine(line: {
  item?: { id?: string };
  item_id?: string;
}): string | undefined {
  const id = line.item?.id ?? line.item_id;
  return id ?? undefined;
}

function quantityFromOrderLine(line: { quantity?: unknown }): number {
  const q = line.quantity;
  if (typeof q === "number" && Number.isFinite(q)) return Math.max(0, q);
  if (typeof q === "string") {
    const n = parseInt(q, 10);
    return Number.isFinite(n) ? Math.max(0, n) : 0;
  }
  return 0;
}

function revenueFromOrderLine(line: {
  quantity?: unknown;
  unit_price?: unknown;
}): number {
  const qty = quantityFromOrderLine(line);
  const price = line.unit_price;
  if (typeof price !== "number" || !Number.isFinite(price) || price < 0) {
    return 0;
  }
  return price * qty;
}

export type ItemOrderMetricsByListing = {
  revenueByItem: Record<string, number>;
  unitsByItem: Record<string, number>;
};

export type PaidOrderLine = {
  itemId: string;
  quantity: number;
  revenue: number;
  /** Data do pedido em YYYY-MM-DD (date_closed/date_created conforme janela). */
  orderDateYmd?: string | null;
  orderId?: string | null;
  packId?: string | null;
};

function identityKey(value: unknown): string | null {
  if (value == null) return null;
  const s = String(value).trim();
  if (!s || s === "undefined" || s === "null" || s === "NaN") return null;
  return s;
}

export function orderIdentityKeys(order: OrderSearchOrder): string[] {
  const keys: string[] = [];
  const add = (value: unknown) => {
    const key = identityKey(value);
    if (key) keys.push(key);
  };
  add(order.id);
  add(order.pack_id);
  return keys;
}

export function splitOrderLinesByCancelledOrderIds(
  lines: PaidOrderLine[],
  cancelledOrderIds: ReadonlySet<string>,
): {
  activeLines: PaidOrderLine[];
  returnedOnInvoiceLines: PaidOrderLine[];
} {
  const activeLines: PaidOrderLine[] = [];
  const returnedOnInvoiceLines: PaidOrderLine[] = [];
  for (const line of lines) {
    const hit =
      (line.orderId != null && cancelledOrderIds.has(line.orderId)) ||
      (line.packId != null && cancelledOrderIds.has(line.packId));
    if (hit) {
      returnedOnInvoiceLines.push(line);
    } else {
      activeLines.push(line);
    }
  }
  return { activeLines, returnedOnInvoiceLines };
}

/**
 * `not_delivered` é o estado normal de todo pedido ainda em trânsito — o ML só
 * troca para `delivered` na entrega. Sozinho, ele só indica devolução quando o
 * pedido já passou do prazo de qualquer entrega: antes disso, tratar como
 * devolvido tirava do Custo produto/Impostos as vendas do fim do mês (no sync
 * do mês corrente ou logo após o fechamento) e as jogava em Canceladas.
 */
const NOT_DELIVERED_RETURN_MIN_AGE_DAYS = 30;
const DAY_MS = 24 * 60 * 60 * 1000;

function orderAgeDays(order: OrderSearchOrder, now: Date): number | null {
  const raw = order.date_closed || order.date_created;
  if (!raw) return null;
  const time = new Date(raw).getTime();
  if (Number.isNaN(time)) return null;
  return (now.getTime() - time) / DAY_MS;
}

function orderLooksReturnedWhilePaid(
  order: OrderSearchOrder,
  now: Date,
): boolean {
  if (order.order_request?.return) return true;
  const tags = (order.tags ?? []).map(String);
  if (tags.includes("returned")) return true;
  if (tags.includes("not_delivered")) {
    const age = orderAgeDays(order, now);
    if (age !== null && age >= NOT_DELIVERED_RETURN_MIN_AGE_DAYS) return true;
  }
  return (order.payments ?? []).some(
    (payment) =>
      payment.status === "refunded" || payment.status === "charged_back",
  );
}

export function returnedPaidOrderIdsFromOrders(
  orders: OrderSearchOrder[],
  now: Date = new Date(),
): Set<string> {
  const ids = new Set<string>();
  for (const order of orders) {
    if (order.status === "cancelled") continue;
    if (!orderLooksReturnedWhilePaid(order, now)) continue;
    for (const key of orderIdentityKeys(order)) ids.add(key);
  }
  return ids;
}

/**
 * `fetchPage` de `forEachOrdersSearchPage` para `/orders/search` do seller —
 * o fatiamento por data (teto de offset do ML) fica no paginador.
 */
function ordersSearchPageFetcher(
  accessToken: string,
  sellerId: number,
  query: {
    dateField: SalesWindowDateField;
    orderStatus?: string;
    signal?: AbortSignal;
  },
): ForEachOrdersSearchPageOptions["fetchPage"] {
  const { apiBase } = getMercadoLibreConfig();
  return async (range, offset, limit) => {
    const u = new URL(`${apiBase}/orders/search`);
    u.searchParams.set("seller", String(sellerId));
    if (query.orderStatus) {
      u.searchParams.set("order.status", query.orderStatus);
    }
    setOrderDateRange(
      u,
      query.dateField,
      range.from.toISOString(),
      range.to.toISOString(),
    );
    u.searchParams.set("offset", String(offset));
    u.searchParams.set("limit", String(limit));
    u.searchParams.set("sort", "date_desc");
    u.searchParams.set("display", "complete");

    const res = await fetchWithRetry(u.toString(), {
      headers: { Authorization: `Bearer ${accessToken}` },
      cache: "no-store",
      signal: query.signal,
    });
    return (await res.json()) as OrderSearchResponse;
  };
}

export async function fetchOrdersInDateRange(
  accessToken: string,
  sellerId: number,
  from: Date,
  to: Date,
  options: {
    dateField?: SalesWindowDateField;
    orderStatus?: string;
    /** Chamado a cada página — progresso de buscas longas (ex.: 90 dias). */
    onPage?: (progress: { fetched: number; total: number | null }) => void;
    /** Interrompe a paginação (ex.: o client trocou de período). */
    signal?: AbortSignal;
  } = {},
): Promise<OrderSearchOrder[]> {
  const orders: OrderSearchOrder[] = [];
  await forEachOrdersSearchPage({
    from,
    to,
    fetchPage: ordersSearchPageFetcher(accessToken, sellerId, {
      dateField: options.dateField ?? stockPlanningConfig.salesWindowDateField,
      orderStatus: options.orderStatus,
      signal: options.signal,
    }),
    onOrders: (batch) => {
      orders.push(...batch);
    },
    signal: options.signal,
    onProgress: options.onPage,
  });
  return orders;
}

/**
 * Dia civil do pedido no fuso do relatório (São Paulo) — usado para casar o
 * pedido com o período do nivelamento de custo. Não usar `getDate()`: no
 * servidor (UTC) um pedido das 21h–24h BRT caía no dia seguinte.
 */
export function orderDateYmdFromOrder(order: {
  date_closed?: string;
  date_created?: string;
}): string | null {
  const raw = order.date_closed || order.date_created;
  if (!raw) return null;
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString("en-CA", {
    timeZone: reportsConfig.catalogCompetitionTimezone,
  });
}

export function paidOrderLinesFromOrders(orders: OrderSearchOrder[]): PaidOrderLine[] {
  const lines: PaidOrderLine[] = [];
  for (const order of orders) {
    if (order.status === "cancelled") continue;
    const orderDateYmd = orderDateYmdFromOrder(order);
    const orderId = identityKey(order.id);
    const packId = identityKey(order.pack_id);
    for (const line of order.order_items ?? []) {
      const itemId = listingIdFromOrderLine(line);
      if (!itemId) continue;
      const quantity = quantityFromOrderLine(line);
      const revenue = revenueFromOrderLine(line);
      if (quantity <= 0 && revenue <= 0) continue;
      lines.push({ itemId, quantity, revenue, orderDateYmd, orderId, packId });
    }
  }
  return lines;
}

export async function fetchPaidOrderLinesInDateRange(
  accessToken: string,
  sellerId: number,
  from: Date,
  to: Date,
  dateField: SalesWindowDateField = stockPlanningConfig.salesWindowDateField,
): Promise<PaidOrderLine[]> {
  const orders = await fetchPaidOrdersByPeriod(
    accessToken,
    sellerId,
    from,
    to,
    dateField,
  );
  return paidOrderLinesFromOrders(orders);
}

/** Pedidos pagos no período com paginação completa (`display=complete`). */
export async function fetchPaidOrdersByPeriod(
  accessToken: string,
  sellerId: number,
  from: Date,
  to: Date,
  dateField: SalesWindowDateField = stockPlanningConfig.salesWindowDateField,
  options: {
    onPage?: (progress: { fetched: number; total: number | null }) => void;
    signal?: AbortSignal;
  } = {},
): Promise<OrderSearchOrder[]> {
  const orders = await fetchOrdersInDateRange(accessToken, sellerId, from, to, {
    dateField,
    orderStatus: "paid",
    onPage: options.onPage,
    signal: options.signal,
  });
  return orders.filter((order) => order.status === "paid");
}

export async function fetchCancelledOrderRevenueInDateRange(
  accessToken: string,
  sellerId: number,
  from: Date,
  to: Date,
  dateField: SalesWindowDateField = stockPlanningConfig.salesWindowDateField,
): Promise<number> {
  const lines = await fetchCancelledOrderLinesInDateRange(
    accessToken,
    sellerId,
    from,
    to,
    dateField,
  );
  return roundMoney(lines.reduce((sum, line) => sum + line.revenue, 0));
}

export async function fetchCancelledOrderLinesInDateRange(
  accessToken: string,
  sellerId: number,
  from: Date,
  to: Date,
  dateField: SalesWindowDateField = stockPlanningConfig.salesWindowDateField,
): Promise<PaidOrderLine[]> {
  const orders = await fetchOrdersInDateRange(accessToken, sellerId, from, to, {
    dateField,
    orderStatus: "cancelled",
  });
  const lines: PaidOrderLine[] = [];
  for (const order of orders) {
    const orderDateYmd = orderDateYmdFromOrder(order);
    const orderId = identityKey(order.id);
    const packId = identityKey(order.pack_id);
    for (const line of order.order_items ?? []) {
      const itemId = listingIdFromOrderLine(line);
      if (!itemId) continue;
      lines.push({
        itemId,
        quantity: quantityFromOrderLine(line),
        revenue: revenueFromOrderLine(line),
        orderDateYmd,
        orderId,
        packId,
      });
    }
  }
  return lines;
}

/**
 * Faturamento bruto e unidades vendidas por anúncio em pedidos pagos na janela,
 * via `/orders/search` paginado (sem filtro por item).
 */
export async function fetchOrderMetricsByItemInDateRange(
  accessToken: string,
  sellerId: number,
  from: Date,
  to: Date,
  dateField: SalesWindowDateField = stockPlanningConfig.salesWindowDateField,
): Promise<ItemOrderMetricsByListing> {
  const revenueByItem: Record<string, number> = {};
  const unitsByItem: Record<string, number> = {};

  await forEachOrdersSearchPage({
    from,
    to,
    fetchPage: ordersSearchPageFetcher(accessToken, sellerId, {
      dateField,
      orderStatus: "paid",
    }),
    onOrders: (batch) => {
      for (const order of batch) {
        if (order.status === "cancelled") continue;
        for (const line of order.order_items ?? []) {
          const itemId = listingIdFromOrderLine(line);
          if (!itemId) continue;
          const qty = quantityFromOrderLine(line);
          if (qty > 0) {
            unitsByItem[itemId] = (unitsByItem[itemId] ?? 0) + qty;
          }
          const lineRevenue = revenueFromOrderLine(line);
          if (lineRevenue > 0) {
            revenueByItem[itemId] = (revenueByItem[itemId] ?? 0) + lineRevenue;
          }
        }
      }
    },
  });

  return { revenueByItem, unitsByItem };
}

/** Unidades vendidas por anúncio, agrupadas por dia (data ISO `YYYY-MM-DD`). */
export type DailyUnitsSoldByItem = Record<string, Record<string, number>>;

/**
 * Soma as unidades de `orders` em `target`, por anúncio e por dia civil no
 * fuso do relatório (São Paulo). Não usar `rawDate.slice(0, 10)`: o ML devolve
 * `...-04:00`, e uma venda das 23h30 BRT caía no dia seguinte.
 */
export function addOrdersToDailyUnits(
  target: DailyUnitsSoldByItem,
  orders: OrderSearchOrder[],
  dateField: SalesWindowDateField,
): void {
  for (const order of orders) {
    if (order.status === "cancelled") continue;
    const rawDate =
      dateField === "date_closed" ? order.date_closed : order.date_created;
    if (!rawDate) continue;
    const date = new Date(rawDate);
    if (Number.isNaN(date.getTime())) continue;
    const dayKey = zonedYmd(date);

    for (const line of order.order_items ?? []) {
      const itemId = listingIdFromOrderLine(line);
      if (!itemId) continue;
      const qty = quantityFromOrderLine(line);
      if (qty <= 0) continue;
      const byDay = (target[itemId] ??= {});
      byDay[dayKey] = (byDay[dayKey] ?? 0) + qty;
    }
  }
}

/**
 * Igual a `fetchOrderMetricsByItemInDateRange`, mas mantém a granularidade
 * diária em vez de somar tudo — usado para ancorar médias de venda no
 * período em que o anúncio realmente vendia (não no calendário corrido).
 */
export async function fetchDailyUnitsSoldByItemInDateRange(
  accessToken: string,
  sellerId: number,
  from: Date,
  to: Date,
  dateField: SalesWindowDateField = stockPlanningConfig.salesWindowDateField,
): Promise<DailyUnitsSoldByItem> {
  const dailyByItem: DailyUnitsSoldByItem = {};
  await forEachOrdersSearchPage({
    from,
    to,
    fetchPage: ordersSearchPageFetcher(accessToken, sellerId, {
      dateField,
      orderStatus: "paid",
    }),
    onOrders: (batch) => addOrdersToDailyUnits(dailyByItem, batch, dateField),
    // Só a 1ª página de cada fatia é sequencial (pra saber o total); o resto
    // busca em paralelo — evita centenas de round-trips um-a-um.
    concurrency: 6,
  });
  return dailyByItem;
}

/** Faturamento bruto por anúncio na janela. */
export async function fetchRevenueByItemInDateRange(
  accessToken: string,
  sellerId: number,
  from: Date,
  to: Date,
  dateField: SalesWindowDateField = stockPlanningConfig.salesWindowDateField,
): Promise<Record<string, number>> {
  const metrics = await fetchOrderMetricsByItemInDateRange(
    accessToken,
    sellerId,
    from,
    to,
    dateField,
  );
  return metrics.revenueByItem;
}

export type ItemOrderMetricsByCalendarMonths = {
  revenueLastMonth: Record<string, number>;
  revenueCurrentMonth: Record<string, number>;
  unitsLastMonth: Record<string, number>;
  unitsCurrentMonth: Record<string, number>;
  monthLabels: CalendarMonthLabels;
};

export type RevenueByCalendarMonths = {
  lastMonth: Record<string, number>;
  currentMonth: Record<string, number>;
  monthLabels: CalendarMonthLabels;
};

export async function fetchItemOrderMetricsForCalendarMonths(
  accessToken: string,
  sellerId: number,
): Promise<ItemOrderMetricsByCalendarMonths> {
  const ranges = getCalendarMonthRanges();
  const [lastMonthMetrics, currentMonthMetrics] = await Promise.all([
    fetchOrderMetricsByItemInDateRange(
      accessToken,
      sellerId,
      ranges.lastMonth.from,
      ranges.lastMonth.to,
    ),
    fetchOrderMetricsByItemInDateRange(
      accessToken,
      sellerId,
      ranges.currentMonth.from,
      ranges.currentMonth.to,
    ),
  ]);

  return {
    revenueLastMonth: lastMonthMetrics.revenueByItem,
    revenueCurrentMonth: currentMonthMetrics.revenueByItem,
    unitsLastMonth: lastMonthMetrics.unitsByItem,
    unitsCurrentMonth: currentMonthMetrics.unitsByItem,
    monthLabels: getCalendarMonthLabels(ranges),
  };
}

export async function fetchRevenueByItemForCalendarMonths(
  accessToken: string,
  sellerId: number,
): Promise<RevenueByCalendarMonths> {
  const metrics = await fetchItemOrderMetricsForCalendarMonths(
    accessToken,
    sellerId,
  );
  return {
    lastMonth: metrics.revenueLastMonth,
    currentMonth: metrics.revenueCurrentMonth,
    monthLabels: metrics.monthLabels,
  };
}

/**
 * Soma **unidades** (soma de `quantity` em cada linha de `order_items`) de **um**
 * anúncio na janela.
 *
 * - Por padrão, exclui `status === "cancelled"`.
 * - Com `includeCancelled: true`, conta todos os pedidos retornados pela API.
 */
async function fetchUnitsSoldForOneItem(
  accessToken: string,
  sellerId: number,
  itemId: string,
  fromStr: string,
  toStr: string,
  dateField: SalesWindowDateField,
  options?: { includeCancelled?: boolean },
): Promise<number> {
  const { apiBase } = getMercadoLibreConfig();
  let sum = 0;
  let offset = 0;
  const limit = 50;
  let total = Infinity;

  while (offset < total) {
    const u = new URL(`${apiBase}/orders/search`);
    u.searchParams.set("seller", String(sellerId));
    u.searchParams.set("item", itemId);
    setOrderDateRange(u, dateField, fromStr, toStr);
    u.searchParams.set("offset", String(offset));
    u.searchParams.set("limit", String(limit));
    u.searchParams.set("sort", "date_desc");
    u.searchParams.set("display", "complete");

    const res = await fetchWithRetry(u.toString(), {
      headers: { Authorization: `Bearer ${accessToken}` },
      cache: "no-store",
    });

    const data = (await res.json()) as OrderSearchResponse;
    const reported = data.paging?.total;
    total =
      reported != null && reported >= 0
        ? reported
        : ((data.results?.length ?? 0) > 0 ? Infinity : 0);

    const batch = data.results ?? [];
    for (const order of batch) {
      if (!options?.includeCancelled && order.status === "cancelled") continue;
      for (const line of order.order_items ?? []) {
        if (listingIdFromOrderLine(line) !== itemId) continue;
        sum += quantityFromOrderLine(line);
      }
    }

    if (batch.length === 0) break;
    offset += limit;
    if (batch.length < limit) break;
  }

  return sum;
}

export type ItemSaleEvent = {
  at: Date;
  units: number;
};

function orderTimestamp(
  order: OrderSearchOrder,
  dateField: SalesWindowDateField,
): Date | null {
  const raw =
    dateField === "date_closed" ? order.date_closed : order.date_created;
  if (typeof raw !== "string") return null;
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Paid order lines for one listing with timestamp (for status-interval sales). */
export async function fetchItemSaleEventsInDateRange(
  accessToken: string,
  sellerId: number,
  itemId: string,
  from: Date,
  to: Date,
  dateField: SalesWindowDateField = stockPlanningConfig.salesWindowDateField,
): Promise<ItemSaleEvent[]> {
  const { apiBase } = getMercadoLibreConfig();
  const fromStr = from.toISOString();
  const toStr = to.toISOString();
  const events: ItemSaleEvent[] = [];
  let offset = 0;
  const limit = 50;
  let total = Infinity;

  while (offset < total) {
    const u = new URL(`${apiBase}/orders/search`);
    u.searchParams.set("seller", String(sellerId));
    u.searchParams.set("item", itemId);
    u.searchParams.set("order.status", "paid");
    setOrderDateRange(u, dateField, fromStr, toStr);
    u.searchParams.set("offset", String(offset));
    u.searchParams.set("limit", String(limit));
    u.searchParams.set("sort", "date_desc");
    u.searchParams.set("display", "complete");

    const res = await fetchWithRetry(u.toString(), {
      headers: { Authorization: `Bearer ${accessToken}` },
      cache: "no-store",
    });

    const data = (await res.json()) as OrderSearchResponse;
    const reported = data.paging?.total;
    total =
      reported != null && reported >= 0
        ? reported
        : ((data.results?.length ?? 0) > 0 ? Infinity : 0);

    const batch = data.results ?? [];
    for (const order of batch) {
      if (order.status === "cancelled") continue;
      const at = orderTimestamp(order, dateField);
      if (!at) continue;
      for (const line of order.order_items ?? []) {
        if (listingIdFromOrderLine(line) !== itemId) continue;
        const units = quantityFromOrderLine(line);
        if (units <= 0) continue;
        events.push({ at, units });
      }
    }

    if (batch.length === 0) break;
    offset += limit;
    if (batch.length < limit) break;
  }

  return events;
}

export function countItemSaleEventsBetween(
  events: ItemSaleEvent[],
  from: Date,
  to: Date,
): number {
  const fromMs = from.getTime();
  const toMs = to.getTime();
  let sum = 0;
  for (const event of events) {
    const t = event.at.getTime();
    if (t >= fromMs && t < toMs) {
      sum += event.units;
    }
  }
  return sum;
}

/**
 * Unidades vendidas por id de anúncio (MLB…) na janela (todos os pedidos exceto cancelados).
 * Uma sequência de requests paginados por anúncio (`item` + intervalo de data).
 */
export async function fetchUnitsSoldForItemsInWindow(
  accessToken: string,
  sellerId: number,
  itemIds: string[],
  windowDays: number,
  dateField: SalesWindowDateField = "date_closed",
  /** Chamado assim que CADA item resolve (não só quando o lote inteiro
   * termina) — permite ao chamador transmitir os resultados aos poucos
   * (ex.: SSE) em vez de esperar o item mais lento do lote. Mesmo padrão de
   * `enrichItemsWithFulfillmentStock`. */
  onItem?: (itemId: string, unitsSold: number) => void,
): Promise<Record<string, number>> {
  const unique = [...new Set(itemIds.filter(Boolean))];
  if (unique.length === 0 || windowDays <= 0) return {};

  const now = new Date();
  const from = new Date(now.getTime());
  from.setDate(from.getDate() - windowDays);
  const fromStr = from.toISOString();
  const toStr = now.toISOString();

  const results = await Promise.all(
    unique.map(async (itemId) => {
      const n = await fetchUnitsSoldForOneItem(
        accessToken,
        sellerId,
        itemId,
        fromStr,
        toStr,
        dateField,
      );
      onItem?.(itemId, n);
      return [itemId, n] as const;
    }),
  );

  return Object.fromEntries(results);
}

/** Todos os ids de anúncios do vendedor (paginação interna). */
export async function fetchAllUserItemIds(
  accessToken: string,
  userId: number,
  options?: { status?: string; catalog_listing?: boolean; tags?: string },
): Promise<string[]> {
  const ids: string[] = [];
  let offset = 0;
  const pageLimit = 50;
  let total = Infinity;

  while (offset < total) {
    const search = await fetchUserItemsSearch(
      accessToken,
      userId,
      offset,
      pageLimit,
      options,
    );
    ids.push(...search.results);
    total = search.paging.total;
    offset += pageLimit;
    if (search.results.length === 0) break;
  }

  return ids;
}

/** Active + paused no ML, mais anúncios com registro no galpão (sem `closed`). */
export async function fetchOperationalListingIds(
  accessToken: string,
  userId: number,
  organizationId: string,
): Promise<string[]> {
  const [activeIds, pausedIds, warehouseRows] = await Promise.all([
    fetchAllUserItemIds(accessToken, userId, { status: "active" }),
    fetchAllUserItemIds(accessToken, userId, { status: "paused" }),
    prisma.warehouseStock.findMany({
      where: { organizationId },
      select: { mlItemId: true },
    }),
  ]);
  const warehouseIds = warehouseRows.map((row) => row.mlItemId);
  return [...new Set([...activeIds, ...pausedIds, ...warehouseIds])];
}

export async function fetchOperationalListings(
  accessToken: string,
  userId: number,
  organizationId: string,
): Promise<ItemBody[]> {
  const ids = await fetchOperationalListingIds(accessToken, userId, organizationId);
  if (ids.length === 0) return [];
  return fetchItemsByIdsBatched(accessToken, ids);
}

export async function fetchSellerFulfillmentInventoryIds(
  accessToken: string,
  userId: number,
  organizationId: string,
): Promise<string[]> {
  const items = await fetchOperationalListings(accessToken, userId, organizationId);
  const ids = new Set<string>();
  for (const item of items) {
    if (!isFulfillmentListing(item)) continue;
    for (const inventoryId of collectInventoryIdsFromItem(item)) {
      ids.add(inventoryId);
    }
  }
  return [...ids];
}

export async function fetchItemsByIdsBatched(
  accessToken: string,
  ids: string[],
  batchSize = ITEMS_BULK_MAX_IDS,
  concurrency = 8,
): Promise<ItemBody[]> {
  const unique = [...new Set(ids.filter(Boolean))];
  const batches: string[][] = [];
  for (let i = 0; i < unique.length; i += batchSize) {
    batches.push(unique.slice(i, i + batchSize));
  }
  const results = await mapWithConcurrency(batches, concurrency, (batch) =>
    fetchItemsByIds(accessToken, batch),
  );
  return results.flat();
}

/** Mesmo que `fetchUnitsSoldForItemsInWindow`, mas em lotes para limitar paralelismo. */
export async function fetchUnitsSoldForItemsInWindowBatched(
  accessToken: string,
  sellerId: number,
  itemIds: string[],
  windowDays: number,
  dateField: SalesWindowDateField = "date_closed",
  chunkSize = 12,
  onItem?: (itemId: string, unitsSold: number) => void,
): Promise<Record<string, number>> {
  const unique = [...new Set(itemIds.filter(Boolean))];
  const out: Record<string, number> = {};
  for (let i = 0; i < unique.length; i += chunkSize) {
    const chunk = unique.slice(i, i + chunkSize);
    const part = await fetchUnitsSoldForItemsInWindow(
      accessToken,
      sellerId,
      chunk,
      windowDays,
      dateField,
      onItem,
    );
    Object.assign(out, part);
  }
  return out;
}

/** Unidades vendidas por anúncio em intervalo explícito. */
export async function fetchUnitsSoldForItemsInDateRangeBatched(
  accessToken: string,
  sellerId: number,
  itemIds: string[],
  from: Date,
  to: Date,
  dateField: SalesWindowDateField = "date_closed",
  chunkSize = 12,
  options?: { includeCancelled?: boolean },
): Promise<Record<string, number>> {
  const unique = [...new Set(itemIds.filter(Boolean))];
  if (unique.length === 0) return {};
  if (from.getTime() >= to.getTime()) {
    return Object.fromEntries(unique.map((id) => [id, 0]));
  }

  const fromStr = from.toISOString();
  const toStr = to.toISOString();
  const out: Record<string, number> = {};

  for (let i = 0; i < unique.length; i += chunkSize) {
    const chunk = unique.slice(i, i + chunkSize);
    const results = await Promise.all(
      chunk.map(async (itemId) => {
        const n = await fetchUnitsSoldForOneItem(
          accessToken,
          sellerId,
          itemId,
          fromStr,
          toStr,
          dateField,
          { includeCancelled: options?.includeCancelled === true },
        );
        return [itemId, n] as const;
      }),
    );
    for (const [itemId, units] of results) {
      out[itemId] = units;
    }
  }

  return out;
}

export async function fetchFulfillmentStock(
  accessToken: string,
  inventoryId: string,
): Promise<FulfillmentStockSnapshot | null> {
  const { apiBase } = getMercadoLibreConfig();
  const res = await fetch(
    `${apiBase}/inventories/${encodeURIComponent(inventoryId)}/stock/fulfillment`,
    {
      headers: { Authorization: `Bearer ${accessToken}` },
      cache: "no-store",
    },
  );
  if (!res.ok) return null;
  const body: unknown = await res.json();
  return parseFulfillmentStockResponse(body);
}

const FULFILLMENT_STOCK_CONCURRENCY = 8;

/**
 * Estoque Full em processamento por anúncio (transfer + internal_process).
 *
 * `onItem`, se passado, é chamado assim que CADA item resolve (não só
 * quando o lote inteiro termina) — permite ao chamador transmitir os
 * resultados aos poucos (ex.: SSE) em vez de esperar o item mais lento do
 * lote. A concorrência aqui é por item (não por inventoryId cru): um item
 * só emite depois que TODOS os inventoryIds dele resolverem, preservando a
 * mesma agregação de sempre; um `Map` de promises dedup inventoryIds
 * compartilhados entre itens, sem refazer a mesma chamada.
 */
export async function enrichItemsWithFulfillmentStock(
  accessToken: string,
  items: ItemBody[],
  onItem?: (itemId: string, stock: ItemFulfillmentStock) => void,
): Promise<Map<string, ItemFulfillmentStock>> {
  const result = new Map<string, ItemFulfillmentStock>();
  const itemsWithInventory: { itemId: string; inventoryIds: string[] }[] = [];

  for (const item of items) {
    if (!isFulfillmentListing(item)) continue;
    const inventoryIds = collectInventoryIdsFromItem(item);
    if (inventoryIds.length === 0) continue;
    itemsWithInventory.push({ itemId: item.id, inventoryIds });
  }

  if (itemsWithInventory.length === 0) return result;

  const snapshotByInventoryId = new Map<
    string,
    Promise<FulfillmentStockSnapshot | null>
  >();
  function getSnapshot(
    inventoryId: string,
  ): Promise<FulfillmentStockSnapshot | null> {
    let pending = snapshotByInventoryId.get(inventoryId);
    if (!pending) {
      pending = fetchFulfillmentStock(accessToken, inventoryId);
      snapshotByInventoryId.set(inventoryId, pending);
    }
    return pending;
  }

  await mapWithConcurrency(
    itemsWithInventory,
    FULFILLMENT_STOCK_CONCURRENCY,
    async ({ itemId, inventoryIds }) => {
      const snapshots = (
        await Promise.all(inventoryIds.map(getSnapshot))
      ).filter((snap): snap is FulfillmentStockSnapshot => snap != null);
      const stock =
        snapshots.length > 0
          ? aggregateFulfillmentSnapshots(snapshots)
          : emptyFulfillmentStock();
      result.set(itemId, stock);
      onItem?.(itemId, stock);
    },
  );

  return result;
}
