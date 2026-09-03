import { roundMoney } from "@/lib/pricing/financial-margin";
import {
  applyBillingLineAmount,
  classifyMlBillingEntry,
  isBillingBonusType,
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
  order_id?: number | string;
  transaction_amount?: number;
  sale_date_time?: string;
  sale_fee?: {
    net?: number;
    gross?: number;
  };
};

type BillingItemInfo = {
  item_id?: string;
  item_amount?: number;
  item_price?: number;
  order_id?: number | string;
};

type MlDetailEntry = {
  charge_info?: ChargeInfo;
  sales_info?: SalesInfo[];
  items_info?: BillingItemInfo[];
  shipping_info?: { pack_id?: number | string; shipping_id?: number | string };
  details?: MlDetailEntry[];
  order_id?: number | string;
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

export type BillingLineBreakdownItem = {
  key: string;
  sku: string | null;
  title: string;
  quantity: number | null;
  amount: number;
};

export type BillingDreBreakdownKey =
  | "saleFeeMl"
  | "sellerShippingMl"
  | "cancelledSalesMl"
  | "partialReturnsMl"
  | "returnFeeMl"
  | "specialFeesMl"
  | "adsCost"
  | "fullShippingMl"
  | "fullStorageMl"
  | "fullNonComplianceMl"
  | "minhaPaginaMl"
  | "affiliateFeeMl";

export type MlDetailsAggregation = {
  revenueMl: number | null;
  revenueFromOrders: number;
  saleFeeMl: number;
  sellerShippingMl: number;
  cancelledSalesMl: number;
  partialReturnsMl: number;
  returnFeeMl: number;
  specialFeesMl: number;
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
  /** Pedidos em Canceladas/devolvidas ou tarifa de devolução — id/pack_id como string (a API mistura number/string). */
  cancelledOrderIds: string[];
  lineBreakdowns: Partial<
    Record<BillingDreBreakdownKey, BillingLineBreakdownItem[]>
  >;
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
          items_info: nested.items_info ?? result.items_info,
          shipping_info: nested.shipping_info ?? result.shipping_info,
          order_id: nested.order_id ?? result.order_id,
        });
      }
    }
  }

  return flat;
}

function collectOrderRevenue(entries: MlDetailEntry[]): number {
  const byOrder = new Map<string, number>();

  for (const entry of entries) {
    for (const sale of entry.sales_info ?? []) {
      const orderId = billingIdentityKey(sale.order_id);
      const amount = Number(sale.transaction_amount ?? 0);
      if (orderId && Number.isFinite(amount) && amount > 0) {
        byOrder.set(orderId, amount);
      }
    }

    for (const payment of entry.payment_info ?? []) {
      const amount = Number(payment.transaction_amount ?? 0);
      const orderId = billingIdentityKey(entry.order_id);
      if (Number.isFinite(amount) && amount > 0 && orderId) {
        byOrder.set(orderId, amount);
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
    returnFeeMl: 0,
    specialFeesMl: 0,
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
    cancelledOrderIds: [],
    lineBreakdowns: {},
  };
}

function billingCategoryToBreakdownKey(
  category: ReturnType<typeof classifyMlBillingEntry>,
): BillingDreBreakdownKey | null {
  switch (category) {
    case "saleFee":
      return "saleFeeMl";
    case "sellerShipping":
      return "sellerShippingMl";
    case "cancelled":
      return "cancelledSalesMl";
    case "partialReturn":
      return "partialReturnsMl";
    case "returnFee":
      return "returnFeeMl";
    case "specialFee":
      return "specialFeesMl";
    case "ads":
      return "adsCost";
    case "fullShipping":
      return "fullShippingMl";
    case "fullStorage":
      return "fullStorageMl";
    case "fullNonCompliance":
      return "fullNonComplianceMl";
    case "minhaPagina":
      return "minhaPaginaMl";
    case "affiliateFee":
      return "affiliateFeeMl";
    default:
      return null;
  }
}

function amountForBreakdownKey(
  agg: MlDetailsAggregation,
  key: BillingDreBreakdownKey,
): number {
  return agg[key];
}

function pushLineBreakdown(
  agg: MlDetailsAggregation,
  key: BillingDreBreakdownKey,
  mergeKey: string,
  displayTitle: string,
  delta: number,
) {
  if (delta === 0) return;
  const list = agg.lineBreakdowns[key] ?? [];
  const itemKey = mergeKey || displayTitle || "(sem label)";
  const existing = list.find((item) => item.key === itemKey);
  if (existing) {
    existing.amount = roundMoney(existing.amount + delta);
  } else {
    list.push({
      key: itemKey,
      sku: null,
      title: displayTitle || itemKey,
      quantity: null,
      amount: roundMoney(delta),
    });
  }
  agg.lineBreakdowns[key] = list;
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
    case "returnFee":
      agg.returnFeeMl = applyBillingLineAmount(
        category,
        agg.returnFeeMl,
        amount,
        isBonus,
      );
      break;
    case "specialFee":
      agg.specialFeesMl = applyBillingLineAmount(
        category,
        agg.specialFeesMl,
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
  const cancelledOrderIdSet = new Set<string>();

  for (const entry of entries) {
    const info = entry.charge_info;
    if (!info) continue;

    const amount = chargeAmount(info);
    if (amount === 0) continue;

    agg.chargeCount += 1;

    const detailType = (info.detail_type ?? "").toUpperCase();
    const subType = (info.detail_sub_type ?? "UNKNOWN").toUpperCase();
    const label = normalizeBillingLabel(info.transaction_detail);
    const isBonus = isBillingBonusType(detailType);
    const signed = isBonus ? Math.abs(amount) : -Math.abs(amount);

    agg.bySubType[subType] = roundMoney((agg.bySubType[subType] ?? 0) + signed);
    agg.byLabel[label || "(sem label)"] = roundMoney(
      (agg.byLabel[label || "(sem label)"] ?? 0) + signed,
    );

    const category = classifyMlBillingEntry(subType, label, detailType);
    if (category === "cancelled" || category === "returnFee") {
      for (const id of entryOrderIds(entry)) {
        cancelledOrderIdSet.add(id);
      }
    }
    const breakdownKey = billingCategoryToBreakdownKey(category);
    const before = breakdownKey
      ? amountForBreakdownKey(agg, breakdownKey)
      : 0;
    applyCategory(agg, category, amount, isBonus);
    if (breakdownKey) {
      const after = amountForBreakdownKey(agg, breakdownKey);
      pushLineBreakdown(
        agg,
        breakdownKey,
        label || subType || "(sem label)",
        (info.transaction_detail ?? "").trim() ||
          label ||
          subType ||
          "(sem label)",
        roundMoney(after - before),
      );
    }
  }

  const revenueFromOrders = collectOrderRevenue(entries);
  agg.revenueFromOrders = revenueFromOrders;
  agg.revenueMl = revenueFromOrders > 0 ? revenueFromOrders : null;
  agg.cancelledOrderIds = [...cancelledOrderIdSet];

  for (const key of Object.keys(agg.lineBreakdowns) as BillingDreBreakdownKey[]) {
    const list = agg.lineBreakdowns[key];
    if (list) {
      agg.lineBreakdowns[key] = list.sort(
        (a, b) => Math.abs(b.amount) - Math.abs(a.amount),
      );
    }
  }

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

  let res: Response;
  try {
    res = await fetch(u.toString(), {
      headers: { Authorization: `Bearer ${accessToken}` },
      cache: "no-store",
      // Sem timeout aqui, uma chamada travada prende o loop de paginação
      // abaixo (e o sync inteiro) por tempo indeterminado.
      signal: AbortSignal.timeout(20_000),
    });
  } catch {
    return null;
  }

  if (!res.ok) {
    return null;
  }

  return (await res.json()) as MlDetailsResponse;
}

/** Trava de segurança: nenhum mês legítimo deveria ter mais que isso em páginas de 1000 lançamentos por tipo de documento. Evita loop sem fim se a API devolver um cursor que nunca avança para o fim. */
const MAX_BILLING_DETAILS_PAGES = 50;

export async function fetchAllMlBillingDetails(
  accessToken: string,
  key: string,
): Promise<MlDetailEntry[]> {
  const limit = 1000;
  const allEntries: MlDetailEntry[] = [];

  for (const documentType of ["BILL", "CREDIT_NOTE"] as const) {
    let fromId = 0;
    for (let pageCount = 0; pageCount < MAX_BILLING_DETAILS_PAGES; pageCount++) {
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

function billingIdentityKey(value: unknown): string | null {
  if (value == null) return null;
  const s = String(value).trim();
  if (!s || s === "undefined" || s === "null" || s === "NaN") return null;
  return s;
}

function entryOrderIds(entry: MlDetailEntry): string[] {
  const ids = new Set<string>();
  const add = (value: unknown) => {
    const id = billingIdentityKey(value);
    if (id) ids.add(id);
  };
  add(entry.order_id);
  for (const sale of entry.sales_info ?? []) add(sale.order_id);
  for (const item of entry.items_info ?? []) add(item.order_id);
  add(entry.shipping_info?.pack_id);
  return [...ids];
}

/** Mantém lançamentos ligados a pedidos do mês civil (details não trazem data). */
export function filterBillingDetailsByOrderIds(
  entries: MlBillingDetailEntry[],
  orderIds: ReadonlySet<string>,
): MlBillingDetailEntry[] {
  if (orderIds.size === 0) return [];
  return entries.filter((entry) =>
    entryOrderIds(entry).some((id) => orderIds.has(id)),
  );
}

/**
 * Agrega tarifas/frete/devolução/especiais dos /details dos períodos que
 * cobrem o mês civil, filtrando pelos order_ids / pack_ids dos pedidos pagos.
 * `alreadyFetched` evita re-paginar a fatura do mês (já baixada no sync).
 */
export async function aggregateBillingDetailsForCivilMonthOrders(
  accessToken: string,
  year: number,
  month: number,
  orderIds: ReadonlySet<string>,
  alreadyFetched?: { key: string; entries: MlBillingDetailEntry[] },
): Promise<MlDetailsAggregation | null> {
  if (orderIds.size === 0) return null;

  const nextMonth = month === 12 ? 1 : month + 1;
  const nextYear = month === 12 ? year + 1 : year;
  const prevMonth = month === 1 ? 12 : month - 1;
  const prevYear = month === 1 ? year - 1 : year;

  const keys = [
    `${prevYear}-${String(prevMonth).padStart(2, "0")}-01`,
    `${year}-${String(month).padStart(2, "0")}-01`,
    `${nextYear}-${String(nextMonth).padStart(2, "0")}-01`,
  ];

  const perKeyMatches = await Promise.all(
    keys.map(async (key) => {
      try {
        const entries =
          alreadyFetched && alreadyFetched.key === key
            ? alreadyFetched.entries
            : await fetchAllMlBillingDetails(accessToken, key);
        return filterBillingDetailsByOrderIds(entries, orderIds);
      } catch {
        // Período ausente / rate-limit: segue com o que já tiver.
        return [];
      }
    }),
  );
  const matched = perKeyMatches.flat();

  if (matched.length === 0) return null;
  return aggregateMlBillingDetails(matched);
}

/**
 * Escolhe entre total do summary e do /details.
 *
 * A API de details frequentemente devolve um subconjunto das cobranças
 * (ex.: sem CVAF/CESM e com tarifas/frete bem menores que o summary). A regra
 * antiga (detail diferente de zero vence) fazia o DRE preferir esse
 * subconjunto e os totais "pulavam" a cada sync.
 *
 * Preferimos o valor de maior magnitude (rollup mais completo). Empate ou
 * detail zerado → summary (documento do período, mais estável).
 */
export function preferCompleteBillingAmount(
  detailVal: number,
  summaryVal: number,
): number {
  if (detailVal === 0) return summaryVal;
  if (summaryVal === 0) return detailVal;
  const detailAbs = Math.abs(detailVal);
  const summaryAbs = Math.abs(summaryVal);
  if (detailAbs > summaryAbs) return detailVal;
  return summaryVal;
}

const BILLING_DIVERGENCE_EPS = 0.009;

export function billingAmountsDiverge(
  detailVal: number,
  summaryVal: number,
): boolean {
  return (
    detailVal !== 0 &&
    summaryVal !== 0 &&
    Math.abs(detailVal - summaryVal) > BILLING_DIVERGENCE_EPS
  );
}

export function listBillingMergeDivergences(
  details: MlDetailsAggregation | null,
  summary: Omit<MlBillingDreLines, "source" | "billingPeriod">,
  full: Pick<
    MlBillingDreLines,
    "fullShipping" | "fullStorage" | "fullNonCompliance"
  >,
): string[] {
  if (!details || details.chargeCount <= 0) return [];

  const rows: Array<[string, number, number]> = [
    ["Tarifa ML", details.saleFeeMl, summary.saleFee],
    ["Frete vendedor", details.sellerShippingMl, summary.sellerShipping],
    ["Canceladas", details.cancelledSalesMl, summary.cancelledSales],
    ["Devoluções parciais", details.partialReturnsMl, summary.partialReturns],
    ["Tarifa de devolução", details.returnFeeMl, summary.returnFee],
    ["Tarifas especiais", details.specialFeesMl, summary.specialFees],
    ["ADS (fatura)", details.adsCost, summary.adsCost],
    ["Minha Página", details.minhaPaginaMl, summary.minhaPagina],
    ["Comissão Afiliados", details.affiliateFeeMl, summary.affiliateFee],
    ["Full envios", details.fullShippingMl, full.fullShipping],
    ["Full armazém", details.fullStorageMl, full.fullStorage],
    ["Full inconformidade", details.fullNonComplianceMl, full.fullNonCompliance],
  ];

  const out: string[] = [];
  for (const [label, detailVal, summaryVal] of rows) {
    if (!billingAmountsDiverge(detailVal, summaryVal)) continue;
    const chosen = preferCompleteBillingAmount(detailVal, summaryVal);
    const source =
      chosen === summaryVal || Math.abs(chosen) === Math.abs(summaryVal)
        ? "summary"
        : "details";
    out.push(
      `${label}: summary ${summaryVal.toFixed(2)} vs details ${detailVal.toFixed(2)} → ${source}`,
    );
  }
  return out;
}

export function mergeBillingLines(
  details: MlDetailsAggregation | null,
  summary: Omit<MlBillingDreLines, "source" | "billingPeriod">,
  full: Pick<
    MlBillingDreLines,
    "fullShipping" | "fullStorage" | "fullNonCompliance"
  >,
): Omit<MlBillingDreLines, "source" | "billingPeriod"> {
  const pick = preferCompleteBillingAmount;

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
    returnFee: pick(details?.returnFeeMl ?? 0, summary.returnFee),
    specialFees: pick(details?.specialFeesMl ?? 0, summary.specialFees),
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
