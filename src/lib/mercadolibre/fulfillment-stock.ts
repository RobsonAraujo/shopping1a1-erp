import type { ItemBody } from "@/lib/mercadolibre/types";

export type FulfillmentStockSnapshot = {
  available: number;
  inTransfer: number;
  internalProcess: number;
  otherNotAvailable: number;
  totalAtMl: number;
};

export type ItemFulfillmentStock = FulfillmentStockSnapshot & {
  inProcess: number;
};

export function emptyFulfillmentStock(): ItemFulfillmentStock {
  return {
    available: 0,
    inTransfer: 0,
    internalProcess: 0,
    otherNotAvailable: 0,
    totalAtMl: 0,
    inProcess: 0,
  };
}

export function isFulfillmentListing(item: ItemBody): boolean {
  return item.shipping?.logistic_type === "fulfillment";
}

export function collectInventoryIdsFromItem(item: ItemBody): string[] {
  const ids = new Set<string>();
  if (typeof item.inventory_id === "string" && item.inventory_id.length > 0) {
    ids.add(item.inventory_id);
  }
  for (const variation of item.variations ?? []) {
    if (
      typeof variation.inventory_id === "string" &&
      variation.inventory_id.length > 0
    ) {
      ids.add(variation.inventory_id);
    }
  }
  return [...ids];
}

function floorQty(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return 0;
  return Math.max(0, Math.floor(value));
}

export function parseFulfillmentStockResponse(
  body: unknown,
): FulfillmentStockSnapshot {
  if (!body || typeof body !== "object") return emptyFulfillmentStock();

  const record = body as Record<string, unknown>;
  const available = floorQty(record.available_quantity);
  let inTransfer = 0;
  let internalProcess = 0;
  let otherNotAvailable = 0;

  const details = record.not_available_detail;
  if (Array.isArray(details)) {
    for (const entry of details) {
      if (!entry || typeof entry !== "object") continue;
      const status = (entry as { status?: unknown }).status;
      const quantity = floorQty((entry as { quantity?: unknown }).quantity);
      if (quantity === 0) continue;
      if (status === "transfer") {
        inTransfer += quantity;
      } else if (status === "internal_process") {
        internalProcess += quantity;
      } else {
        otherNotAvailable += quantity;
      }
    }
  }

  const notAvailableFromApi = floorQty(record.not_available_quantity);
  const detailSum = inTransfer + internalProcess + otherNotAvailable;
  if (detailSum === 0 && notAvailableFromApi > 0) {
    otherNotAvailable = notAvailableFromApi;
  }
  const notAvailable = detailSum > 0 ? detailSum : notAvailableFromApi;
  const totalFromApi = floorQty(record.total);
  const totalAtMl =
    totalFromApi > 0 ? totalFromApi : available + notAvailable;

  return {
    available,
    inTransfer,
    internalProcess,
    otherNotAvailable,
    totalAtMl,
  };
}

export function aggregateFulfillmentSnapshots(
  snapshots: FulfillmentStockSnapshot[],
): ItemFulfillmentStock {
  const aggregated = snapshots.reduce(
    (acc, snap) => ({
      available: acc.available + snap.available,
      inTransfer: acc.inTransfer + snap.inTransfer,
      internalProcess: acc.internalProcess + snap.internalProcess,
      otherNotAvailable: acc.otherNotAvailable + snap.otherNotAvailable,
      totalAtMl: acc.totalAtMl + snap.totalAtMl,
    }),
    emptyFulfillmentStock(),
  );
  return {
    ...aggregated,
    inProcess: aggregated.inTransfer + aggregated.internalProcess,
  };
}
