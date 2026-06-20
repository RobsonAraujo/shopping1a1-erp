import { getMercadoLibreConfig } from "./config";
import {
  billingPeriodKey,
  classifyFullChargeLabel,
  classifyMlBillingEntry,
  normalizeBillingLabel,
} from "./billing-shared";
import type { MlBillingDetailEntry } from "./billing-details";
import { fetchAllMlBillingDetails } from "./billing-details";
import {
  extractBillingSummaryEntries,
  fetchBillingSummaryRawForDebug,
} from "./billing-summary";
import type { FullInboundShipment } from "./billing-full-collect-types";
export type { FullInboundShipment } from "./billing-full-collect-types";
import {
  filterShipmentsByActivityMonth,
  mergeOperationsWithBillingCosts,
  nextCalendarMonth,
} from "./billing-inbound-merge";
export { mergeOperationsWithBillingCosts } from "./billing-inbound-merge";
import { fetchWithRetry, MlApiFetchError } from "./fetch-with-retry";
import { fetchInboundReceptionsForActivityMonth } from "./fulfillment-inbound-operations";

const DEBUG_TARGET_INBOUNDS = new Set([
  "69719031",
  "68605584",
  "69546476",
  "69534372",
  "69526222",
  "68712023",
  "68093201",
]);

function debugLog(
  location: string,
  message: string,
  data: Record<string, unknown>,
  hypothesisId: string,
): void {
  // #region agent log
  fetch("http://127.0.0.1:7821/ingest/fd7b9565-8dcc-457b-baf8-0a4c4f85b917", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Debug-Session-Id": "72aad8",
    },
    body: JSON.stringify({
      sessionId: "72aad8",
      location,
      message,
      data,
      hypothesisId,
      timestamp: Date.now(),
    }),
  }).catch(() => {});
  // #endregion
}

export type FullCollectCharge = {
  detailId: string;
  shippedAt: string | null;
  totalCost: number;
  label: string;
  subType: string;
  source: "full_details" | "ml_details" | "summary";
  rawDateFields: Record<string, string | undefined>;
};

type FullBillingChargeInfo = {
  detail_amount?: number;
  detail_type?: string;
  detail_sub_type?: string;
  transaction_detail?: string;
  detail_id?: number;
  detail_date?: string;
  date?: string;
  creation_date?: string;
  creation_date_time?: string;
};

type FullBillingFulfillmentInfo = {
  type?: string;
  inbound_id?: number | string;
  quantity?: number;
  sku?: string;
  item_id?: string;
  inventory_id?: string;
};

export type FullBillingDetailRow = {
  charge_info?: FullBillingChargeInfo;
  fulfillment_info?: FullBillingFulfillmentInfo;
  charge_date?: string;
  creation_date?: string;
  date_created?: string;
};

type FullBillingDetailsResponse = {
  results?: FullBillingDetailRow[];
  last_id?: number;
};

function chargeAmount(info: { detail_amount?: number } | undefined): number {
  const amount = Number(info?.detail_amount ?? 0);
  return Number.isFinite(amount) ? amount : 0;
}

function classifyFullFulfillmentType(
  type: string | undefined,
): "fullShipping" | "fullStorage" | "fullNonCompliance" | null {
  const normalized = (type ?? "").toUpperCase();
  if (
    normalized === "WAREHOUSING" ||
    normalized === "AGING" ||
    normalized === "SPACE_PURCHASE" ||
    normalized === "SPACE_CANCELLATION"
  ) {
    return "fullStorage";
  }
  if (normalized === "INBOUND_PENALTY" || normalized === "OVERAGE") {
    return "fullNonCompliance";
  }
  if (normalized === "INBOUND_COLLECT" || normalized === "WITHDRAWAL") {
    return "fullShipping";
  }
  return null;
}

function parseBillingDate(
  entry: {
    charge_date?: string;
    creation_date?: string;
    date_created?: string;
  },
  info: FullBillingChargeInfo,
): string | null {
  const candidates = [
    info.detail_date,
    info.creation_date_time,
    info.date,
    info.creation_date,
    entry.charge_date,
    entry.creation_date,
    entry.date_created,
  ];

  for (const value of candidates) {
    if (typeof value !== "string" || value.trim().length === 0) continue;
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) {
      return parsed.toISOString();
    }
  }

  return null;
}

function isFullCollectEntry(
  subType: string,
  label: string,
  detailType: string,
): boolean {
  if (detailType.toUpperCase() === "BONUS") return false;
  return classifyMlBillingEntry(subType, label, detailType) === "fullShipping";
}

function isInboundCollectFromFullDetailsRow(row: FullBillingDetailRow): boolean {
  const info = row.charge_info;
  if (!info) return false;

  const detailType = (info.detail_type ?? "").toUpperCase();
  if (detailType === "BONUS") return false;

  const fulfillmentType = (row.fulfillment_info?.type ?? "").toUpperCase();
  if (fulfillmentType === "WITHDRAWAL") return false;

  const subType = (info.detail_sub_type ?? "").toUpperCase();
  if (subType === "CFCBI" || subType.startsWith("CFCB")) return true;
  if (fulfillmentType === "INBOUND_COLLECT") return true;

  const label = normalizeBillingLabel(info.transaction_detail);
  const labelCategory = classifyFullChargeLabel(label);
  if (labelCategory === "fullShipping" && fulfillmentType !== "WITHDRAWAL") {
    return true;
  }

  const typeCategory = classifyFullFulfillmentType(row.fulfillment_info?.type);
  return typeCategory === "fullShipping" && fulfillmentType !== "WITHDRAWAL";
}

/** @deprecated use isInboundCollectFromFullDetailsRow */
function isFullCollectFromFullDetailsRow(row: FullBillingDetailRow): boolean {
  return isInboundCollectFromFullDetailsRow(row);
}

function buildDetailId(
  info: FullBillingChargeInfo,
  fallback: string,
): string {
  if (typeof info.detail_id === "number" && Number.isFinite(info.detail_id)) {
    return String(info.detail_id);
  }
  return fallback;
}

function productKeyFromFulfillment(
  fulfillment: FullBillingFulfillmentInfo | undefined,
): string | null {
  if (!fulfillment) return null;
  const sku = fulfillment.sku?.trim();
  if (sku) return sku;
  const itemId = fulfillment.item_id?.trim();
  if (itemId) return itemId;
  return null;
}

function inboundGroupKey(
  row: FullBillingDetailRow,
  detailId: string,
): { inboundId: string; unassigned: boolean } {
  const raw = row.fulfillment_info?.inbound_id;
  if (raw != null && String(raw).length > 0) {
    return { inboundId: String(raw), unassigned: false };
  }
  return { inboundId: `unassigned-${detailId}`, unassigned: true };
}

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

function earliestDate(a: string | null, b: string | null): string | null {
  if (!a) return b;
  if (!b) return a;
  return a < b ? a : b;
}

export function groupFullDetailsIntoInboundShipments(
  rows: FullBillingDetailRow[],
): FullInboundShipment[] {
  const groups = new Map<
    string,
    {
      inboundId: string;
      unassigned: boolean;
      totalCost: number;
      totalUnits: number;
      products: Set<string>;
      chargeDetailIds: string[];
      inventoryIds: Set<string>;
      shippedAt: string | null;
      label: string;
    }
  >();

  const seenDetailIds = new Set<string>();

  for (const row of rows) {
    const info = row.charge_info;
    if (!info) continue;

    const amount = chargeAmount(info);
    if (amount <= 0) continue;
    if (!isInboundCollectFromFullDetailsRow(row)) continue;

    const detailId = buildDetailId(
      info,
      `full-details-${groups.size + 1}-${amount}`,
    );
    if (seenDetailIds.has(detailId)) continue;
    seenDetailIds.add(detailId);
    const { inboundId, unassigned } = inboundGroupKey(row, detailId);
    const shippedAt = parseBillingDate(row, info);
    const qty = Number(row.fulfillment_info?.quantity ?? 0);
    const units = Number.isFinite(qty) && qty > 0 ? Math.floor(qty) : 0;

    let group = groups.get(inboundId);
    if (!group) {
      group = {
        inboundId,
        unassigned,
        totalCost: 0,
        totalUnits: 0,
        products: new Set<string>(),
        chargeDetailIds: [],
        inventoryIds: new Set<string>(),
        shippedAt: null,
        label: info.transaction_detail?.trim() || "Coleta Full",
      };
      groups.set(inboundId, group);
    }

    group.totalCost += amount;
    group.totalUnits += units;
    group.chargeDetailIds.push(detailId);
    group.shippedAt = earliestDate(group.shippedAt, shippedAt);

    const productKey = productKeyFromFulfillment(row.fulfillment_info);
    if (productKey) group.products.add(productKey);

    const inventoryId = row.fulfillment_info?.inventory_id?.trim();
    if (inventoryId) group.inventoryIds.add(inventoryId);
  }

  return [...groups.values()].map((group) => ({
    inboundId: group.inboundId,
    shippedAt: group.shippedAt,
    totalCost: roundMoney(group.totalCost),
    totalUnits: group.totalUnits,
    productCount: group.products.size,
    chargeDetailIds: group.chargeDetailIds,
    inventoryIds: [...group.inventoryIds],
    label: group.unassigned
      ? `${group.label} (sem inbound_id ML)`
      : group.label,
    source: "full_details" as const,
    unassigned: group.unassigned,
  }));
}

function pushCharge(
  map: Map<string, FullCollectCharge>,
  charge: FullCollectCharge,
): void {
  if (!map.has(charge.detailId)) {
    map.set(charge.detailId, charge);
  }
}

export function extractFullCollectChargesFromMlDetails(
  entries: MlBillingDetailEntry[],
): FullCollectCharge[] {
  const charges: FullCollectCharge[] = [];

  for (const entry of entries) {
    const info = entry.charge_info;
    if (!info) continue;

    const amount = chargeAmount(info);
    if (amount <= 0) continue;

    const subType = (info.detail_sub_type ?? "UNKNOWN").toUpperCase();
    const label = normalizeBillingLabel(info.transaction_detail);
    const detailType = (info.detail_type ?? "").toUpperCase();

    if (!isFullCollectEntry(subType, label, detailType)) continue;

    charges.push({
      detailId: buildDetailId(
        info,
        `ml-details-${subType}-${charges.length + 1}-${amount}`,
      ),
      shippedAt: parseBillingDate(entry, info),
      totalCost: roundMoney(amount),
      label: info.transaction_detail?.trim() || "Coleta Full",
      subType,
      source: "ml_details",
      rawDateFields: {
        detail_date: info.detail_date,
        date: info.date,
        creation_date: info.creation_date,
        charge_date: entry.charge_date,
        entry_creation_date: entry.creation_date,
        entry_date_created: entry.date_created,
      },
    });
  }

  return charges;
}

export function extractFullCollectChargesFromFullDetails(
  rows: FullBillingDetailRow[],
): FullCollectCharge[] {
  const charges: FullCollectCharge[] = [];

  for (const row of rows) {
    const info = row.charge_info;
    if (!info) continue;

    const amount = chargeAmount(info);
    if (amount <= 0) continue;
    if (!isFullCollectFromFullDetailsRow(row)) continue;

    const subType = (
      info.detail_sub_type ??
      row.fulfillment_info?.type ??
      "FULL"
    ).toUpperCase();

    charges.push({
      detailId: buildDetailId(
        info,
        `full-details-${subType}-${charges.length + 1}-${amount}`,
      ),
      shippedAt: parseBillingDate(row, info),
      totalCost: roundMoney(amount),
      label: info.transaction_detail?.trim() || "Coleta Full",
      subType,
      source: "full_details",
      rawDateFields: {
        creation_date_time: info.creation_date_time,
        detail_date: info.detail_date,
        date: info.date,
        creation_date: info.creation_date,
        charge_date: row.charge_date,
        entry_creation_date: row.creation_date,
        entry_date_created: row.date_created,
        fulfillment_type: row.fulfillment_info?.type,
        inbound_id:
          row.fulfillment_info?.inbound_id != null
            ? String(row.fulfillment_info.inbound_id)
            : undefined,
      },
    });
  }

  return charges;
}

function inboundShipmentFromMlCharge(charge: FullCollectCharge): FullInboundShipment {
  return {
    inboundId: charge.detailId,
    shippedAt: charge.shippedAt,
    totalCost: charge.totalCost,
    totalUnits: 0,
    productCount: 0,
    chargeDetailIds: [charge.detailId],
    inventoryIds: [],
    label: charge.label,
    source: charge.source,
    unassigned: true,
  };
}

export function extractFullCollectChargesFromSummary(
  charges: Array<{ label?: string; amount?: number; type?: string }>,
): FullCollectCharge[] {
  const result: FullCollectCharge[] = [];

  for (const [index, charge] of charges.entries()) {
    const amount = Number(charge.amount ?? 0);
    if (!Number.isFinite(amount) || amount <= 0) continue;

    const subType = (charge.type ?? "UNKNOWN").toUpperCase();
    const label = normalizeBillingLabel(charge.label);
    if (!isFullCollectEntry(subType, label, "CHARGE")) continue;

    result.push({
      detailId: `summary-${subType}-${index + 1}-${Math.round(amount * 100)}`,
      shippedAt: null,
      totalCost: roundMoney(amount),
      label: charge.label?.trim() || "Coleta Full",
      subType,
      source: "summary",
      rawDateFields: {},
    });
  }

  return result;
}

/** @deprecated use extractFullCollectChargesFromMlDetails */
export function extractFullCollectCharges(
  entries: MlBillingDetailEntry[],
): FullCollectCharge[] {
  return extractFullCollectChargesFromMlDetails(entries);
}

export async function fetchAllMlFullBillingDetails(
  accessToken: string,
  key: string,
  options?: { documentTypes?: readonly ("BILL" | "CREDIT_NOTE")[] },
): Promise<FullBillingDetailRow[]> {
  const { apiBase } = getMercadoLibreConfig();
  const limit = 1000;
  const allRows: FullBillingDetailRow[] = [];
  const documentTypes = options?.documentTypes ?? ["BILL", "CREDIT_NOTE"];

  for (const documentType of documentTypes) {
    const rowsBefore = allRows.length;
    let fromId = 0;
    for (;;) {
      const u = new URL(
        `${apiBase}/billing/integration/periods/key/${key}/group/ML/full/details`,
      );
      u.searchParams.set("document_type", documentType);
      u.searchParams.set("limit", String(limit));
      u.searchParams.set("from_id", String(fromId));

      let res: Response;
      try {
        res = await fetchWithRetry(
          u.toString(),
          {
            headers: { Authorization: `Bearer ${accessToken}` },
            cache: "no-store",
          },
          { maxAttempts: 5, backoffMs: [1000, 2000, 3000, 5000] },
        );
      } catch (e) {
        if (e instanceof MlApiFetchError && allRows.length > 0) {
          break;
        }
        throw e;
      }

      const data = (await res.json()) as FullBillingDetailsResponse;
      const batch = data.results ?? [];
      if (batch.length === 0) break;

      allRows.push(...batch);

      const lastId = data.last_id;
      if (
        typeof lastId !== "number" ||
        !Number.isFinite(lastId) ||
        batch.length < limit
      ) {
        break;
      }
      fromId = lastId;
    }

    const docRows = allRows.slice(rowsBefore);
    const byInbound: Record<
      string,
      {
        lines: number;
        units: number;
        cost: number;
        detailTypes: string[];
        dates: Array<string | null>;
      }
    > = {};
    for (const row of docRows) {
      const id = row.fulfillment_info?.inbound_id;
      if (id == null || !DEBUG_TARGET_INBOUNDS.has(String(id))) continue;
      if (!isInboundCollectFromFullDetailsRow(row)) continue;
      const inboundId = String(id);
      const bucket = byInbound[inboundId] ?? {
        lines: 0,
        units: 0,
        cost: 0,
        detailTypes: [],
        dates: [],
      };
      bucket.lines += 1;
      bucket.units += Number(row.fulfillment_info?.quantity ?? 0);
      bucket.cost += chargeAmount(row.charge_info);
      bucket.detailTypes.push(
        (row.charge_info?.detail_type ?? "unknown").toUpperCase(),
      );
      bucket.dates.push(
        row.charge_info?.creation_date_time ??
          row.charge_info?.detail_date ??
          null,
      );
      byInbound[inboundId] = bucket;
    }
    if (Object.keys(byInbound).length > 0) {
      debugLog(
        "billing-full-collect.ts:fetchAllMlFullBillingDetails",
        "target inbound rows per document type",
        { key, documentType, byInbound },
        "H2",
      );
    }
  }

  return allRows;
}

export type FullInboundBillingProbe = {
  fullDetailsRowCount: number;
  groupedInboundCount: number;
  opsInboundCount: number;
  mlDetailsCount: number;
  summaryCount: number;
  unassignedCount: number;
};

async function fetchBillingGroupedInboundsForPeriods(
  accessToken: string,
  year: number,
  month: number,
): Promise<{ grouped: FullInboundShipment[]; fullDetailsRowCount: number }> {
  const next = nextCalendarMonth(year, month);
  const keys = [
    billingPeriodKey(year, month),
    billingPeriodKey(next.year, next.month),
  ];

  const groupedByInbound = new Map<string, FullInboundShipment>();
  let fullDetailsRowCount = 0;

  for (const key of keys) {
    try {
      const rows = await fetchAllMlFullBillingDetails(accessToken, key, {
        documentTypes: ["BILL"],
      });
      fullDetailsRowCount += rows.length;
      for (const shipment of groupFullDetailsIntoInboundShipments(rows)) {
        const existing = groupedByInbound.get(shipment.inboundId);
        if (!existing || shipment.totalCost > existing.totalCost) {
          groupedByInbound.set(shipment.inboundId, shipment);
        }
      }
    } catch (e) {
      if (!(e instanceof MlApiFetchError)) throw e;
    }
  }

  return {
    grouped: [...groupedByInbound.values()],
    fullDetailsRowCount,
  };
}

async function fetchFullInboundShipmentsBillingFallback(
  accessToken: string,
  year: number,
  month: number,
): Promise<{
  shipments: FullInboundShipment[];
  fullDetailsRowCount: number;
  groupedInboundCount: number;
  mlDetailsCount: number;
  summaryCount: number;
}> {
  const key = billingPeriodKey(year, month);
  const shipmentMap = new Map<string, FullInboundShipment>();

  const fullDetailRows = await fetchAllMlFullBillingDetails(accessToken, key, {
    documentTypes: ["BILL"],
  });
  const grouped = groupFullDetailsIntoInboundShipments(fullDetailRows);
  for (const shipment of grouped) {
    shipmentMap.set(shipment.inboundId, shipment);
  }

  let mlDetailsCount = 0;
  if (shipmentMap.size === 0) {
    const mlDetailEntries = await fetchAllMlBillingDetails(accessToken, key);
    const fromMlDetails = extractFullCollectChargesFromMlDetails(mlDetailEntries);
    mlDetailsCount = fromMlDetails.length;
    for (const charge of fromMlDetails) {
      const shipment = inboundShipmentFromMlCharge(charge);
      shipmentMap.set(shipment.inboundId, shipment);
    }
  }

  let summaryCount = 0;
  if (shipmentMap.size === 0) {
    const [bill, credit] = await Promise.all([
      fetchBillingSummaryRawForDebug(accessToken, key, "BILL"),
      fetchBillingSummaryRawForDebug(accessToken, key, "CREDIT_NOTE"),
    ]);
    const summaryCharges = [
      ...(bill.data ? extractBillingSummaryEntries(bill.data).charges : []),
      ...(credit.data ? extractBillingSummaryEntries(credit.data).charges : []),
    ];
    const fromSummary = extractFullCollectChargesFromSummary(summaryCharges);
    summaryCount = fromSummary.length;
    for (const charge of fromSummary) {
      const shipment = inboundShipmentFromMlCharge(charge);
      shipmentMap.set(shipment.inboundId, shipment);
    }
  }

  return {
    shipments: filterShipmentsByActivityMonth(
      [...shipmentMap.values()],
      year,
      month,
    ),
    fullDetailsRowCount: fullDetailRows.length,
    groupedInboundCount: grouped.length,
    mlDetailsCount,
    summaryCount,
  };
}

export async function fetchFullInboundShipmentsForPeriod(
  accessToken: string,
  sellerId: number,
  year: number,
  month: number,
): Promise<{ shipments: FullInboundShipment[]; probe: FullInboundBillingProbe }> {
  const { fetchSellerFulfillmentInventoryIds } = await import("./api");
  const inventoryIds = await fetchSellerFulfillmentInventoryIds(
    accessToken,
    sellerId,
  );

  const [billing, discoveries] = await Promise.all([
    fetchBillingGroupedInboundsForPeriods(accessToken, year, month),
    fetchInboundReceptionsForActivityMonth(
      accessToken,
      sellerId,
      inventoryIds,
      year,
      month,
    ),
  ]);

  const fromBilling = filterShipmentsByActivityMonth(
    billing.grouped,
    year,
    month,
  );

  debugLog(
    "billing-full-collect.ts:fetchFullInboundShipmentsForPeriod",
    "import branch summary",
    {
      year,
      month,
      opsDiscoveries: discoveries.size,
      billingGrouped: billing.grouped.length,
      fromBilling: fromBilling.length,
      targets: Object.fromEntries(
        [...DEBUG_TARGET_INBOUNDS].map((id) => {
          const grouped = billing.grouped.find((s) => s.inboundId === id);
          const filtered = fromBilling.find((s) => s.inboundId === id);
          const discovery = discoveries.get(id);
          return [
            id,
            {
              discovery: discovery ?? null,
              grouped: grouped ?? null,
              filtered: filtered ?? null,
            },
          ];
        }),
      ),
    },
    discoveries.size > 0 ? "H4" : fromBilling.length > 0 ? "H2" : "H5",
  );

  if (discoveries.size > 0) {
    const shipments = mergeOperationsWithBillingCosts(
      discoveries,
      billing.grouped,
    );

    return {
      shipments,
      probe: {
        fullDetailsRowCount: billing.fullDetailsRowCount,
        groupedInboundCount: billing.grouped.length,
        opsInboundCount: discoveries.size,
        mlDetailsCount: 0,
        summaryCount: 0,
        unassignedCount: shipments.filter((s) => s.unassigned).length,
      },
    };
  }

  if (fromBilling.length > 0) {
    return {
      shipments: fromBilling,
      probe: {
        fullDetailsRowCount: billing.fullDetailsRowCount,
        groupedInboundCount: billing.grouped.length,
        opsInboundCount: 0,
        mlDetailsCount: 0,
        summaryCount: 0,
        unassignedCount: fromBilling.filter((s) => s.unassigned).length,
      },
    };
  }

  const fallback = await fetchFullInboundShipmentsBillingFallback(
    accessToken,
    year,
    month,
  );

  return {
    shipments: fallback.shipments,
    probe: {
      fullDetailsRowCount: fallback.fullDetailsRowCount,
      groupedInboundCount: fallback.groupedInboundCount,
      opsInboundCount: 0,
      mlDetailsCount: fallback.mlDetailsCount,
      summaryCount: fallback.summaryCount,
      unassignedCount: fallback.shipments.filter((s) => s.unassigned).length,
    },
  };
}

export type FullCollectBillingProbe = {
  fullDetailsCount: number;
  mlDetailsCount: number;
  summaryCount: number;
  mergedCount: number;
};

/** @deprecated use fetchFullInboundShipmentsForPeriod */
export async function fetchFullCollectChargesForPeriod(
  accessToken: string,
  year: number,
  month: number,
): Promise<{ charges: FullCollectCharge[]; probe: FullCollectBillingProbe }> {
  const key = billingPeriodKey(year, month);
  const chargeMap = new Map<string, FullCollectCharge>();

  const fullDetailRows = await fetchAllMlFullBillingDetails(accessToken, key, {
    documentTypes: ["BILL"],
  });
  const fromFullDetails = extractFullCollectChargesFromFullDetails(fullDetailRows);
  for (const charge of fromFullDetails) {
    pushCharge(chargeMap, charge);
  }

  const mlDetailEntries = await fetchAllMlBillingDetails(accessToken, key);
  const fromMlDetails = extractFullCollectChargesFromMlDetails(mlDetailEntries);
  for (const charge of fromMlDetails) {
    pushCharge(chargeMap, charge);
  }

  let fromSummary: FullCollectCharge[] = [];
  if (chargeMap.size === 0) {
    const [bill, credit] = await Promise.all([
      fetchBillingSummaryRawForDebug(accessToken, key, "BILL"),
      fetchBillingSummaryRawForDebug(accessToken, key, "CREDIT_NOTE"),
    ]);
    const summaryCharges = [
      ...(bill.data ? extractBillingSummaryEntries(bill.data).charges : []),
      ...(credit.data ? extractBillingSummaryEntries(credit.data).charges : []),
    ];
    fromSummary = extractFullCollectChargesFromSummary(summaryCharges);
    for (const charge of fromSummary) {
      pushCharge(chargeMap, charge);
    }
  }

  const charges = [...chargeMap.values()];
  return {
    charges,
    probe: {
      fullDetailsCount: fromFullDetails.length,
      mlDetailsCount: fromMlDetails.length,
      summaryCount: fromSummary.length,
      mergedCount: charges.length,
    },
  };
}

export function defaultShippedAtForBillingPeriod(
  year: number,
  month: number,
): Date {
  return new Date(Date.UTC(year, month - 1, 1, 12, 0, 0));
}

export function billingMonthUtcRange(
  year: number,
  month: number,
): { start: Date; end: Date } {
  return {
    start: new Date(Date.UTC(year, month - 1, 1, 0, 0, 0)),
    end: new Date(Date.UTC(year, month, 0, 23, 59, 59, 999)),
  };
}
