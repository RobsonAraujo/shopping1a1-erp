import { getMercadoLibreConfig } from "./config";
import { fetchWithRetry } from "./fetch-with-retry";

export type InboundOperationSummary = {
  inboundId: string;
  shippedAt: string | null;
  totalUnits: number;
};

type FulfillmentOperation = {
  date_created?: string;
  type?: string;
  detail?: { available_quantity?: number };
  external_references?: Array<{ type?: string; value?: string }>;
};

type OperationsSearchResponse = {
  results?: FulfillmentOperation[];
  paging?: { scroll?: string | null };
};

function inboundIdFromOperation(op: FulfillmentOperation): string | null {
  const ref = op.external_references?.find((r) => r.type === "inbound_id");
  if (!ref?.value) return null;
  return String(ref.value);
}

function formatDateYmd(date: Date): string {
  return date.toISOString().slice(0, 10);
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

  const fromStr = formatDateYmd(dateFrom);
  const toStr = formatDateYmd(dateTo);

  for (const inventoryId of uniqueIds) {
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
  }

  return map;
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
  const center = new Date(Date.UTC(year, month - 1, 15, 12, 0, 0));
  const msPerDay = 24 * 60 * 60 * 1000;
  return {
    dateFrom: new Date(center.getTime() - 45 * msPerDay),
    dateTo: new Date(center.getTime() + 45 * msPerDay),
  };
}
