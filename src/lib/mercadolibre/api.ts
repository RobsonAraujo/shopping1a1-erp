import { stockPlanningConfig } from "@/config/stock-planning";
import { prisma } from "@/lib/db";
import { roundMoney } from "@/lib/financial-margin";
import { getMercadoLibreConfig } from "./config";
import { fetchWithRetry } from "./fetch-with-retry";
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
  CategoryBody,
  ItemBody,
  ItemPriceToWinResponse,
  ItemMultigetEntry,
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
  options?: { status?: string; catalog_listing?: boolean },
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

function normalizeMultigetEntry(entry: ItemMultigetEntry): ItemBody | null {
  if (entry && typeof entry === "object" && "body" in entry && entry.body) {
    return entry.body as ItemBody;
  }
  if (entry && typeof entry === "object" && "id" in entry) {
    return entry as ItemBody;
  }
  return null;
}

export async function fetchItemsByIds(
  accessToken: string,
  ids: string[],
): Promise<ItemBody[]> {
  if (ids.length === 0) return [];
  const { apiBase } = getMercadoLibreConfig();
  const u = new URL(`${apiBase}/items`);
  u.searchParams.set("ids", ids.join(","));

  const res = await fetch(u.toString(), {
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: "no-store",
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`items multiget failed: ${res.status} ${t}`);
  }

  const data = (await res.json()) as ItemMultigetEntry[] | ItemBody[];
  if (!Array.isArray(data)) return [];

  return data
    .map((entry) => normalizeMultigetEntry(entry as ItemMultigetEntry))
    .filter((x): x is ItemBody => x !== null);
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
  const res = await fetch(`${apiBase}/items/${itemId}/price_to_win`, {
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: "no-store",
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`items/${itemId}/price_to_win failed: ${res.status} ${t}`);
  }
  return res.json() as Promise<ItemPriceToWinResponse>;
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
};

export async function fetchOrdersInDateRange(
  accessToken: string,
  sellerId: number,
  from: Date,
  to: Date,
  options: {
    dateField?: SalesWindowDateField;
    orderStatus?: string;
  } = {},
): Promise<OrderSearchOrder[]> {
  const { apiBase } = getMercadoLibreConfig();
  const fromStr = from.toISOString();
  const toStr = to.toISOString();
  const dateField =
    options.dateField ?? stockPlanningConfig.salesWindowDateField;
  const orders: OrderSearchOrder[] = [];
  let offset = 0;
  const limit = 50;
  let total = Infinity;

  while (offset < total) {
    const u = new URL(`${apiBase}/orders/search`);
    u.searchParams.set("seller", String(sellerId));
    if (options.orderStatus) {
      u.searchParams.set("order.status", options.orderStatus);
    }
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
    orders.push(...batch);

    if (batch.length === 0) break;
    offset += limit;
    if (batch.length < limit) break;
  }

  return orders;
}

function paidOrderLinesFromOrders(orders: OrderSearchOrder[]): PaidOrderLine[] {
  const lines: PaidOrderLine[] = [];
  for (const order of orders) {
    if (order.status === "cancelled") continue;
    for (const line of order.order_items ?? []) {
      const itemId = listingIdFromOrderLine(line);
      if (!itemId) continue;
      const quantity = quantityFromOrderLine(line);
      const revenue = revenueFromOrderLine(line);
      if (quantity <= 0 && revenue <= 0) continue;
      lines.push({ itemId, quantity, revenue });
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
): Promise<OrderSearchOrder[]> {
  const orders = await fetchOrdersInDateRange(accessToken, sellerId, from, to, {
    dateField,
    orderStatus: "paid",
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
    for (const line of order.order_items ?? []) {
      const itemId = listingIdFromOrderLine(line);
      if (!itemId) continue;
      lines.push({
        itemId,
        quantity: quantityFromOrderLine(line),
        revenue: revenueFromOrderLine(line),
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
  const { apiBase } = getMercadoLibreConfig();
  const fromStr = from.toISOString();
  const toStr = to.toISOString();
  const revenueByItem: Record<string, number> = {};
  const unitsByItem: Record<string, number> = {};
  let offset = 0;
  const limit = 50;
  let total = Infinity;

  while (offset < total) {
    const u = new URL(`${apiBase}/orders/search`);
    u.searchParams.set("seller", String(sellerId));
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

    if (batch.length === 0) break;
    offset += limit;
    if (batch.length < limit) break;
  }

  return { revenueByItem, unitsByItem };
}

/** Unidades vendidas por anúncio, agrupadas por dia (data ISO `YYYY-MM-DD`). */
export type DailyUnitsSoldByItem = Record<string, Record<string, number>>;

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
  const { apiBase } = getMercadoLibreConfig();
  const fromStr = from.toISOString();
  const toStr = to.toISOString();
  const limit = 50;
  // Só a 1ª página é sequencial (pra saber o total); o resto busca em paralelo
  // — evita centenas de round-trips um-a-um em contas com muitos pedidos.
  const concurrency = 6;
  const dailyByItem: DailyUnitsSoldByItem = {};

  function buildUrl(offset: number): string {
    const u = new URL(`${apiBase}/orders/search`);
    u.searchParams.set("seller", String(sellerId));
    u.searchParams.set("order.status", "paid");
    setOrderDateRange(u, dateField, fromStr, toStr);
    u.searchParams.set("offset", String(offset));
    u.searchParams.set("limit", String(limit));
    u.searchParams.set("sort", "date_desc");
    u.searchParams.set("display", "complete");
    return u.toString();
  }

  async function fetchPage(offset: number): Promise<OrderSearchResponse> {
    const res = await fetchWithRetry(buildUrl(offset), {
      headers: { Authorization: `Bearer ${accessToken}` },
      cache: "no-store",
    });
    return (await res.json()) as OrderSearchResponse;
  }

  function ingest(data: OrderSearchResponse) {
    for (const order of data.results ?? []) {
      if (order.status === "cancelled") continue;
      const rawDate =
        dateField === "date_closed" ? order.date_closed : order.date_created;
      const dayKey = rawDate ? rawDate.slice(0, 10) : null;
      if (!dayKey) continue;

      for (const line of order.order_items ?? []) {
        const itemId = listingIdFromOrderLine(line);
        if (!itemId) continue;
        const qty = quantityFromOrderLine(line);
        if (qty <= 0) continue;
        const byDay = (dailyByItem[itemId] ??= {});
        byDay[dayKey] = (byDay[dayKey] ?? 0) + qty;
      }
    }
  }

  const first = await fetchPage(0);
  ingest(first);

  const reportedTotal = first.paging?.total;

  if (reportedTotal == null || reportedTotal < 0) {
    // Total não confiável — cai para paginação sequencial página a página.
    let offset = limit;
    let lastBatchLen = first.results?.length ?? 0;
    while (lastBatchLen === limit) {
      const data = await fetchPage(offset);
      ingest(data);
      lastBatchLen = data.results?.length ?? 0;
      offset += limit;
    }
    return dailyByItem;
  }

  const remainingOffsets: number[] = [];
  for (let offset = limit; offset < reportedTotal; offset += limit) {
    remainingOffsets.push(offset);
  }

  for (let i = 0; i < remainingOffsets.length; i += concurrency) {
    const chunk = remainingOffsets.slice(i, i + concurrency);
    const pages = await Promise.all(chunk.map((offset) => fetchPage(offset)));
    for (const page of pages) ingest(page);
  }

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
      return [itemId, n] as const;
    }),
  );

  return Object.fromEntries(results);
}

/** Todos os ids de anúncios do vendedor (paginação interna). */
export async function fetchAllUserItemIds(
  accessToken: string,
  userId: number,
  options?: { status?: string; catalog_listing?: boolean },
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
): Promise<string[]> {
  const [activeIds, pausedIds, warehouseRows] = await Promise.all([
    fetchAllUserItemIds(accessToken, userId, { status: "active" }),
    fetchAllUserItemIds(accessToken, userId, { status: "paused" }),
    prisma.warehouseStock.findMany({ select: { mlItemId: true } }),
  ]);
  const warehouseIds = warehouseRows.map((row) => row.mlItemId);
  return [...new Set([...activeIds, ...pausedIds, ...warehouseIds])];
}

export async function fetchOperationalListings(
  accessToken: string,
  userId: number,
): Promise<ItemBody[]> {
  const ids = await fetchOperationalListingIds(accessToken, userId);
  if (ids.length === 0) return [];
  return fetchItemsByIdsBatched(accessToken, ids);
}

export async function fetchSellerFulfillmentInventoryIds(
  accessToken: string,
  userId: number,
): Promise<string[]> {
  const items = await fetchOperationalListings(accessToken, userId);
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
  batchSize = 20,
): Promise<ItemBody[]> {
  const unique = [...new Set(ids.filter(Boolean))];
  const out: ItemBody[] = [];
  for (let i = 0; i < unique.length; i += batchSize) {
    const batch = unique.slice(i, i + batchSize);
    const items = await fetchItemsByIds(accessToken, batch);
    out.push(...items);
  }
  return out;
}

/** Mesmo que `fetchUnitsSoldForItemsInWindow`, mas em lotes para limitar paralelismo. */
export async function fetchUnitsSoldForItemsInWindowBatched(
  accessToken: string,
  sellerId: number,
  itemIds: string[],
  windowDays: number,
  dateField: SalesWindowDateField = "date_closed",
  chunkSize = 12,
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

async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  if (items.length === 0) return [];
  const results = new Array<R>(items.length);
  let nextIndex = 0;

  async function worker() {
    while (nextIndex < items.length) {
      const index = nextIndex;
      nextIndex += 1;
      results[index] = await fn(items[index], index);
    }
  }

  const workers = Array.from(
    { length: Math.min(concurrency, items.length) },
    () => worker(),
  );
  await Promise.all(workers);
  return results;
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

/** Estoque Full em processamento por anúncio (transfer + internal_process). */
export async function enrichItemsWithFulfillmentStock(
  accessToken: string,
  items: ItemBody[],
): Promise<Map<string, ItemFulfillmentStock>> {
  const result = new Map<string, ItemFulfillmentStock>();
  const itemInventoryIds = new Map<string, string[]>();

  for (const item of items) {
    if (!isFulfillmentListing(item)) continue;
    const inventoryIds = collectInventoryIdsFromItem(item);
    if (inventoryIds.length === 0) continue;
    itemInventoryIds.set(item.id, inventoryIds);
  }

  const uniqueInventoryIds = [
    ...new Set([...itemInventoryIds.values()].flat()),
  ];
  if (uniqueInventoryIds.length === 0) return result;

  const snapshots = await mapWithConcurrency(
    uniqueInventoryIds,
    FULFILLMENT_STOCK_CONCURRENCY,
    async (inventoryId) => {
      const snapshot = await fetchFulfillmentStock(accessToken, inventoryId);
      return { inventoryId, snapshot };
    },
  );

  const snapshotByInventoryId = new Map<string, FulfillmentStockSnapshot>();
  for (const { inventoryId, snapshot } of snapshots) {
    if (snapshot) snapshotByInventoryId.set(inventoryId, snapshot);
  }

  for (const [itemId, inventoryIds] of itemInventoryIds) {
    const itemSnapshots = inventoryIds
      .map((id) => snapshotByInventoryId.get(id))
      .filter((snap): snap is FulfillmentStockSnapshot => snap != null);
    result.set(
      itemId,
      itemSnapshots.length > 0
        ? aggregateFulfillmentSnapshots(itemSnapshots)
        : emptyFulfillmentStock(),
    );
  }

  return result;
}
