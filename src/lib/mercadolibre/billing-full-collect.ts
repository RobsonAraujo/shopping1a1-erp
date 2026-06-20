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
import { fetchWithRetry } from "./fetch-with-retry";
import {
  applyOperationEnrichment,
  fetchInboundReceptionSummaries,
  operationSearchDateRangeForBillingMonth,
} from "./fulfillment-inbound-operations";

export type FullCollectCharge = {
  detailId: string;
  shippedAt: string | null;
  totalCost: number;
  label: string;
  subType: string;
  source: "full_details" | "ml_details" | "summary";
  rawDateFields: Record<string, string | undefined>;
};

export type FullInboundShipment = {
  inboundId: string;
  shippedAt: string | null;
  totalCost: number;
  totalUnits: number;
  productCount: number;
  chargeDetailIds: string[];
  inventoryIds: string[];
  label: string;
  source: "full_details" | "ml_details" | "summary";
  unassigned: boolean;
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
    info.creation_date_time,
    info.detail_date,
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
): Promise<FullBillingDetailRow[]> {
  const { apiBase } = getMercadoLibreConfig();
  const limit = 1000;
  const allRows: FullBillingDetailRow[] = [];

  for (const documentType of ["BILL", "CREDIT_NOTE"] as const) {
    let fromId = 0;
    for (;;) {
      const u = new URL(
        `${apiBase}/billing/integration/periods/key/${key}/group/ML/full/details`,
      );
      u.searchParams.set("document_type", documentType);
      u.searchParams.set("limit", String(limit));
      u.searchParams.set("from_id", String(fromId));

      const res = await fetchWithRetry(u.toString(), {
        headers: { Authorization: `Bearer ${accessToken}` },
        cache: "no-store",
      });

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
  }

  return allRows;
}

export type FullInboundBillingProbe = {
  fullDetailsRowCount: number;
  groupedInboundCount: number;
  mlDetailsCount: number;
  summaryCount: number;
  unassignedCount: number;
};

export async function fetchFullInboundShipmentsForPeriod(
  accessToken: string,
  sellerId: number,
  year: number,
  month: number,
): Promise<{ shipments: FullInboundShipment[]; probe: FullInboundBillingProbe }> {
  const key = billingPeriodKey(year, month);
  const shipmentMap = new Map<string, FullInboundShipment>();

  const fullDetailRows = await fetchAllMlFullBillingDetails(accessToken, key);
  let grouped = groupFullDetailsIntoInboundShipments(fullDetailRows);
  if (grouped.length > 0) {
    const inventoryIds = [
      ...new Set(grouped.flatMap((shipment) => shipment.inventoryIds)),
    ];
    const { dateFrom, dateTo } = operationSearchDateRangeForBillingMonth(
      year,
      month,
    );
    const ops = await fetchInboundReceptionSummaries(
      accessToken,
      sellerId,
      inventoryIds,
      dateFrom,
      dateTo,
    );
    grouped = applyOperationEnrichment(grouped, ops);
  }

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

  const shipments = [...shipmentMap.values()];
  return {
    shipments,
    probe: {
      fullDetailsRowCount: fullDetailRows.length,
      groupedInboundCount: grouped.length,
      mlDetailsCount,
      summaryCount,
      unassignedCount: shipments.filter((s) => s.unassigned).length,
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

  const fullDetailRows = await fetchAllMlFullBillingDetails(accessToken, key);
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
