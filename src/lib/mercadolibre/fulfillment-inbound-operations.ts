import { reportsConfig } from "@/config/reports";
import { getCalendarMonthRange, formatCalendarRangeYmd } from "./revenue-periods";
import { getMercadoLibreConfig } from "./config";
import { fetchWithRetry, MlApiFetchError } from "./fetch-with-retry";
import { shipmentShippedAtInCalendarMonth } from "@/lib/envios-full/full-shipment-period";

export type InboundOperationSummary = {
  inboundId: string;
  shippedAt: string | null;
  totalUnits: number;
};

export type InboundOperationDiscovery = {
  inboundId: string;
  shippedAt: string | null;
  totalUnits: number;
  productCount: number;
};

type FulfillmentOperation = {
  date_created?: string;
  type?: string;
  seller_product_id?: string;
  detail?: { available_quantity?: number };
  external_references?: Array<{ type?: string; value?: string }>;
};

type OperationsSearchResponse = {
  results?: FulfillmentOperation[];
  paging?: { scroll?: string | null };
};

type DiscoveryAccumulator = {
  inboundId: string;
  shippedAt: string | null;
  totalUnits: number;
  products: Set<string>;
};

const OPERATIONS_CONCURRENCY = 8;

function inboundIdFromOperation(op: FulfillmentOperation): string | null {
  const ref = op.external_references?.find((r) => r.type === "inbound_id");
  if (!ref?.value) return null;
  return String(ref.value);
}

function productKeyFromOperation(op: FulfillmentOperation): string | null {
  const sku = op.seller_product_id?.trim();
  return sku || null;
}

async function fetchInboundReceptionsForInventory(
  accessToken: string,
  sellerId: number,
  inventoryId: string,
  dateFrom: string,
  dateTo: string,
): Promise<FulfillmentOperation[]> {
  const { apiBase } = getMercadoLibreConfig();
  const results: FulfillmentOperation[] = [];
  let scroll: string | null = null;

  for (;;) {
    const u = new URL(`${apiBase}/stock/fulfillment/operations/search`);
    u.searchParams.set("seller_id", String(sellerId));
    u.searchParams.set("inventory_id", inventoryId);
    u.searchParams.set("date_from", dateFrom);
    u.searchParams.set("date_to", dateTo);
    u.searchParams.set("type", "INBOUND_RECEPTION");
    u.searchParams.set("limit", "1000");
    if (scroll) u.searchParams.set("scroll", scroll);

    const res = await fetchWithRetry(u.toString(), {
      headers: { Authorization: `Bearer ${accessToken}` },
      cache: "no-store",
    });

    const data = (await res.json()) as OperationsSearchResponse;
    results.push(...(data.results ?? []));
    scroll = data.paging?.scroll ?? null;
    if (!scroll) break;
  }

  return results;
}

function mergeOperationSummary(
  map: Map<string, InboundOperationSummary>,
  inboundId: string,
  dateCreated: string | undefined,
  units: number,
): void {
  const existing = map.get(inboundId);
  const shippedAt =
    dateCreated && !Number.isNaN(new Date(dateCreated).getTime())
      ? new Date(dateCreated).toISOString()
      : null;

  if (!existing) {
    map.set(inboundId, {
      inboundId,
      shippedAt,
      totalUnits: units,
    });
    return;
  }

  existing.totalUnits += units;
  if (
    shippedAt &&
    (!existing.shippedAt || shippedAt < existing.shippedAt)
  ) {
    existing.shippedAt = shippedAt;
  }
}

function mergeOperationDiscovery(
  map: Map<string, DiscoveryAccumulator>,
  inboundId: string,
  dateCreated: string | undefined,
  units: number,
  productKey: string | null,
): void {
  const shippedAt =
    dateCreated && !Number.isNaN(new Date(dateCreated).getTime())
      ? new Date(dateCreated).toISOString()
      : null;

  let group = map.get(inboundId);
  if (!group) {
    group = {
      inboundId,
      shippedAt,
      totalUnits: 0,
      products: new Set<string>(),
    };
    map.set(inboundId, group);
  }

  group.totalUnits += units;
  if (
    shippedAt &&
    (!group.shippedAt || shippedAt < group.shippedAt)
  ) {
    group.shippedAt = shippedAt;
  }
  if (productKey) group.products.add(productKey);
}

function activityMonthYmdRange(
  year: number,
  month: number,
  timeZone: string = reportsConfig.catalogCompetitionTimezone,
): { from: string; to: string } {
  const range = getCalendarMonthRange(year, month, timeZone);
  return formatCalendarRangeYmd(range, timeZone);
}

async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  if (items.length === 0) return [];
  const results = new Array<R>(items.length);
  let nextIndex = 0;

  async function worker() {
    while (nextIndex < items.length) {
      const index = nextIndex;
      nextIndex += 1;
      results[index] = await fn(items[index]);
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length) }, () => worker()),
  );
  return results;
}

function discoveriesFromAccumulator(
  map: Map<string, DiscoveryAccumulator>,
): Map<string, InboundOperationDiscovery> {
  const out = new Map<string, InboundOperationDiscovery>();
  for (const group of map.values()) {
    out.set(group.inboundId, {
      inboundId: group.inboundId,
      shippedAt: group.shippedAt,
      totalUnits: group.totalUnits,
      productCount: group.products.size,
    });
  }
  return out;
}

function filterDiscoveriesByActivityMonth(
  discoveries: Map<string, InboundOperationDiscovery>,
  year: number,
  month: number,
): Map<string, InboundOperationDiscovery> {
  const filtered = new Map<string, InboundOperationDiscovery>();
  for (const discovery of discoveries.values()) {
    if (
      discovery.shippedAt &&
      shipmentShippedAtInCalendarMonth(discovery.shippedAt, year, month)
    ) {
      filtered.set(discovery.inboundId, discovery);
    }
  }
  return filtered;
}

/** Busca INBOUND_RECEPTION e agrega por inbound_id. */
export async function fetchInboundReceptionSummaries(
  accessToken: string,
  sellerId: number,
  inventoryIds: string[],
  dateFrom: Date,
  dateTo: Date,
): Promise<Map<string, InboundOperationSummary>> {
  const map = new Map<string, InboundOperationSummary>();
  const uniqueIds = [...new Set(inventoryIds.filter((id) => id.length > 0))];
  if (uniqueIds.length === 0) return map;

  const fromStr = dateFrom.toISOString().slice(0, 10);
  const toStr = dateTo.toISOString().slice(0, 10);

  for (const inventoryId of uniqueIds) {
    try {
      const ops = await fetchInboundReceptionsForInventory(
        accessToken,
        sellerId,
        inventoryId,
        fromStr,
        toStr,
      );
      for (const op of ops) {
        const inboundId = inboundIdFromOperation(op);
        if (!inboundId) continue;
        const units = Number(op.detail?.available_quantity ?? 0);
        if (!Number.isFinite(units) || units <= 0) continue;
        mergeOperationSummary(map, inboundId, op.date_created, units);
      }
    } catch (e) {
      if (!(e instanceof MlApiFetchError)) throw e;
    }
  }

  return map;
}

/** Descobre coletas Full por mês civil via operations/search. */
export async function fetchInboundReceptionsForActivityMonth(
  accessToken: string,
  sellerId: number,
  inventoryIds: string[],
  year: number,
  month: number,
): Promise<Map<string, InboundOperationDiscovery>> {
  const uniqueIds = [...new Set(inventoryIds.filter((id) => id.length > 0))];
  if (uniqueIds.length === 0) return new Map();

  const { from, to } = activityMonthYmdRange(year, month);
  const accumulator = new Map<string, DiscoveryAccumulator>();

  await mapWithConcurrency(uniqueIds, OPERATIONS_CONCURRENCY, async (inventoryId) => {
    try {
      const ops = await fetchInboundReceptionsForInventory(
        accessToken,
        sellerId,
        inventoryId,
        from,
        to,
      );
      for (const op of ops) {
        const inboundId = inboundIdFromOperation(op);
        if (!inboundId) continue;
        const units = Number(op.detail?.available_quantity ?? 0);
        if (!Number.isFinite(units) || units <= 0) continue;
        mergeOperationDiscovery(
          accumulator,
          inboundId,
          op.date_created,
          units,
          productKeyFromOperation(op),
        );
      }
    } catch (e) {
      if (!(e instanceof MlApiFetchError)) throw e;
    }
  });

  return filterDiscoveriesByActivityMonth(
    discoveriesFromAccumulator(accumulator),
    year,
    month,
  );
}

export type InboundShipmentEnrichmentTarget = {
  inboundId: string;
  shippedAt: string | null;
  totalUnits: number;
  inventoryIds: string[];
};

export function applyOperationEnrichment<
  T extends InboundShipmentEnrichmentTarget,
>(shipments: T[], ops: Map<string, InboundOperationSummary>): T[] {
  return shipments.map((shipment) => {
    if (shipment.inboundId.startsWith("unassigned-")) return shipment;
    const summary = ops.get(shipment.inboundId);
    if (!summary) return shipment;

    return {
      ...shipment,
      shippedAt: summary.shippedAt ?? shipment.shippedAt,
      totalUnits:
        summary.totalUnits > shipment.totalUnits
          ? summary.totalUnits
          : shipment.totalUnits,
    };
  });
}

export function operationSearchDateRangeForBillingMonth(
  year: number,
  month: number,
): { dateFrom: Date; dateTo: Date } {
  const range = getCalendarMonthRange(year, month);
  return { dateFrom: range.from, dateTo: range.to };
}
