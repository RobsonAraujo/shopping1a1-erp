import { roundMoney } from "@/lib/financial-margin";
import {
  applyBillingLineAmount,
  classifyMlBillingEntry,
  normalizeBillingLabel,
  type MlBillingDreLines,
} from "./billing-shared";
import { getMercadoLibreConfig } from "./config";

type ChargeInfo = {
  detail_amount?: number;
  detail_type?: string;
  detail_sub_type?: string;
  transaction_detail?: string;
  detail_id?: number;
  detail_date?: string;
  date?: string;
  creation_date?: string;
};

type SalesInfo = {
  order_id?: number;
  transaction_amount?: number;
  sale_fee?: {
    net?: number;
    gross?: number;
  };
};

type MlDetailEntry = {
  charge_info?: ChargeInfo;
  sales_info?: SalesInfo[];
  details?: MlDetailEntry[];
  order_id?: number;
  sale_fee?: SalesInfo["sale_fee"];
  payment_info?: Array<{ transaction_amount?: number }>;
  charge_date?: string;
  creation_date?: string;
  date_created?: string;
};

export type MlBillingDetailEntry = MlDetailEntry;

type MlDetailsResponse = {
  results?: MlDetailEntry[];
  last_id?: number;
  total?: number;
  charge_info?: ChargeInfo;
  sales_info?: SalesInfo[];
};

export type MlDetailsAggregation = {
  revenueMl: number | null;
  revenueFromOrders: number;
  saleFeeMl: number;
  sellerShippingMl: number;
  cancelledSalesMl: number;
  partialReturnsMl: number;
  adsCost: number;
  fullShippingMl: number;
  fullStorageMl: number;
  fullNonComplianceMl: number;
  minhaPaginaMl: number;
  affiliateFeeMl: number;
  unmappedCharges: number;
  chargeCount: number;
  bySubType: Record<string, number>;
  byLabel: Record<string, number>;
};

function chargeAmount(info: ChargeInfo | undefined): number {
  const amount = Number(info?.detail_amount ?? 0);
  return Number.isFinite(amount) ? amount : 0;
}

function flattenDetailEntries(data: MlDetailsResponse): MlDetailEntry[] {
  const flat: MlDetailEntry[] = [];

  if (data.charge_info) {
    flat.push({
      charge_info: data.charge_info,
      sales_info: data.sales_info,
    });
  }

  for (const result of data.results ?? []) {
    if (result.charge_info) {
      flat.push(result);
    }
    for (const nested of result.details ?? []) {
      if (nested.charge_info) {
        flat.push({
          ...nested,
          sales_info: nested.sales_info ?? result.sales_info,
        });
      }
    }
  }

  return flat;
}

function collectOrderRevenue(entries: MlDetailEntry[]): number {
  const byOrder = new Map<number, number>();

  for (const entry of entries) {
    for (const sale of entry.sales_info ?? []) {
      const orderId = sale.order_id;
      const amount = Number(sale.transaction_amount ?? 0);
      if (
        typeof orderId === "number" &&
        Number.isFinite(orderId) &&
        Number.isFinite(amount) &&
        amount > 0
      ) {
        byOrder.set(orderId, amount);
      }
    }

    for (const payment of entry.payment_info ?? []) {
      const amount = Number(payment.transaction_amount ?? 0);
      if (Number.isFinite(amount) && amount > 0 && entry.order_id) {
        byOrder.set(entry.order_id, amount);
      }
    }
  }

  let total = 0;
  for (const amount of byOrder.values()) {
    total += amount;
  }
  return roundMoney(total);
}

function emptyAggregation(): MlDetailsAggregation {
  return {
    revenueMl: null,
    revenueFromOrders: 0,
    saleFeeMl: 0,
    sellerShippingMl: 0,
    cancelledSalesMl: 0,
    partialReturnsMl: 0,
    adsCost: 0,
    fullShippingMl: 0,
    fullStorageMl: 0,
    fullNonComplianceMl: 0,
    minhaPaginaMl: 0,
    affiliateFeeMl: 0,
    unmappedCharges: 0,
    chargeCount: 0,
    bySubType: {},
    byLabel: {},
  };
}

function applyCategory(
  agg: MlDetailsAggregation,
  category: ReturnType<typeof classifyMlBillingEntry>,
  amount: number,
  isBonus: boolean,
): void {
  if (category === "unmapped") {
    if (!isBonus) {
      agg.unmappedCharges = roundMoney(agg.unmappedCharges - Math.abs(amount));
    }
    return;
  }
  if (category === "skip") return;

  switch (category) {
    case "saleFee":
      agg.saleFeeMl = applyBillingLineAmount(
        category,
        agg.saleFeeMl,
        amount,
        isBonus,
      );
      break;
    case "sellerShipping":
      agg.sellerShippingMl = applyBillingLineAmount(
        category,
        agg.sellerShippingMl,
        amount,
        isBonus,
      );
      break;
    case "cancelled":
      agg.cancelledSalesMl = applyBillingLineAmount(
        category,
        agg.cancelledSalesMl,
        amount,
        isBonus,
      );
      break;
    case "partialReturn":
      agg.partialReturnsMl = applyBillingLineAmount(
        category,
        agg.partialReturnsMl,
        amount,
        isBonus,
      );
      break;
    case "ads":
      agg.adsCost = roundMoney(agg.adsCost + Math.abs(amount));
      break;
    case "fullShipping":
      agg.fullShippingMl = applyBillingLineAmount(
        category,
        agg.fullShippingMl,
        amount,
        isBonus,
      );
      break;
    case "fullStorage":
      agg.fullStorageMl = applyBillingLineAmount(
        category,
        agg.fullStorageMl,
        amount,
        isBonus,
      );
      break;
    case "fullNonCompliance":
      agg.fullNonComplianceMl = applyBillingLineAmount(
        category,
        agg.fullNonComplianceMl,
        amount,
        isBonus,
      );
      break;
    case "minhaPagina":
      agg.minhaPaginaMl = applyBillingLineAmount(
        category,
        agg.minhaPaginaMl,
        amount,
        isBonus,
      );
      break;
    case "affiliateFee":
      agg.affiliateFeeMl = applyBillingLineAmount(
        category,
        agg.affiliateFeeMl,
        amount,
        isBonus,
      );
      break;
  }
}

export function aggregateMlBillingDetails(
  entries: MlDetailEntry[],
): MlDetailsAggregation {
  const agg = emptyAggregation();

  for (const entry of entries) {
    const info = entry.charge_info;
    if (!info) continue;

    const amount = chargeAmount(info);
    if (amount === 0) continue;

    agg.chargeCount += 1;

    const detailType = (info.detail_type ?? "").toUpperCase();
    const subType = (info.detail_sub_type ?? "UNKNOWN").toUpperCase();
    const label = normalizeBillingLabel(info.transaction_detail);
    const isBonus = detailType === "BONUS";
    const signed = isBonus ? Math.abs(amount) : -Math.abs(amount);

    agg.bySubType[subType] = roundMoney((agg.bySubType[subType] ?? 0) + signed);
    agg.byLabel[label || "(sem label)"] = roundMoney(
      (agg.byLabel[label || "(sem label)"] ?? 0) + signed,
    );

    const category = classifyMlBillingEntry(subType, label, detailType);
    applyCategory(agg, category, amount, isBonus);
  }

  const revenueFromOrders = collectOrderRevenue(entries);
  agg.revenueFromOrders = revenueFromOrders;
  agg.revenueMl = revenueFromOrders > 0 ? revenueFromOrders : null;

  return agg;
}

export function aggregateSummaryCharges(
  charges: Array<{ label?: string; amount?: number; type?: string }>,
  bonuses: Array<{ label?: string; amount?: number; type?: string }>,
): MlDetailsAggregation {
  const entries: MlDetailEntry[] = [];

  for (const charge of charges) {
    entries.push({
      charge_info: {
        detail_amount: charge.amount,
        detail_type: "CHARGE",
        detail_sub_type: charge.type,
        transaction_detail: charge.label,
      },
    });
  }

  for (const bonus of bonuses) {
    entries.push({
      charge_info: {
        detail_amount: Math.abs(Number(bonus.amount ?? 0)),
        detail_type: "BONUS",
        detail_sub_type: bonus.type,
        transaction_detail: bonus.label,
      },
    });
  }

  return aggregateMlBillingDetails(entries);
}

async function fetchMlDetailsPage(
  accessToken: string,
  key: string,
  documentType: "BILL" | "CREDIT_NOTE",
  fromId: number,
  limit: number,
): Promise<MlDetailsResponse | null> {
  const { apiBase } = getMercadoLibreConfig();
  const u = new URL(
    `${apiBase}/billing/integration/periods/key/${key}/group/ML/details`,
  );
  u.searchParams.set("document_type", documentType);
  u.searchParams.set("limit", String(limit));
  u.searchParams.set("from_id", String(fromId));
  u.searchParams.set("sort_by", "ID");
  u.searchParams.set("order_by", "ASC");

  const res = await fetch(u.toString(), {
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: "no-store",
  });

  if (!res.ok) {
    return null;
  }

  return (await res.json()) as MlDetailsResponse;
}

export async function fetchAllMlBillingDetails(
  accessToken: string,
  key: string,
): Promise<MlDetailEntry[]> {
  const limit = 1000;
  const allEntries: MlDetailEntry[] = [];

  for (const documentType of ["BILL", "CREDIT_NOTE"] as const) {
    let fromId = 0;
    for (;;) {
      const page = await fetchMlDetailsPage(
        accessToken,
        key,
        documentType,
        fromId,
        limit,
      );
      if (!page) break;

      const batch = flattenDetailEntries(page);
      if (batch.length === 0) break;

      allEntries.push(...batch);

      const lastId = page.last_id;
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

  return allEntries;
}

export async function fetchMlBillingDetailsAggregation(
  accessToken: string,
  year: number,
  month: number,
): Promise<MlDetailsAggregation | null> {
  const m = String(month).padStart(2, "0");
  const key = `${year}-${m}-01`;
  const entries = await fetchAllMlBillingDetails(accessToken, key);
  if (entries.length === 0) return null;
  return aggregateMlBillingDetails(entries);
}

export function mergeBillingLines(
  details: MlDetailsAggregation | null,
  summary: Omit<MlBillingDreLines, "source" | "billingPeriod">,
  full: Pick<
    MlBillingDreLines,
    "fullShipping" | "fullStorage" | "fullNonCompliance"
  >,
): Omit<MlBillingDreLines, "source" | "billingPeriod"> {
  const pick = (detailVal: number, summaryVal: number) =>
    detailVal !== 0 ? detailVal : summaryVal;

  const revenueMl =
    summary.revenueMl !== null && summary.revenueMl !== undefined
      ? summary.revenueMl
      : details?.revenueMl ?? null;

  return {
    revenueMl,
    saleFee: pick(details?.saleFeeMl ?? 0, summary.saleFee),
    sellerShipping: pick(details?.sellerShippingMl ?? 0, summary.sellerShipping),
    cancelledSales: pick(
      details?.cancelledSalesMl ?? 0,
      summary.cancelledSales,
    ),
    partialReturns: pick(
      details?.partialReturnsMl ?? 0,
      summary.partialReturns,
    ),
    fullShipping: pick(details?.fullShippingMl ?? 0, full.fullShipping),
    fullStorage: pick(details?.fullStorageMl ?? 0, full.fullStorage),
    fullNonCompliance: pick(
      details?.fullNonComplianceMl ?? 0,
      full.fullNonCompliance,
    ),
    adsCost: pick(details?.adsCost ?? 0, summary.adsCost),
    minhaPagina: pick(details?.minhaPaginaMl ?? 0, summary.minhaPagina),
    affiliateFee: pick(details?.affiliateFeeMl ?? 0, summary.affiliateFee),
  };
}
