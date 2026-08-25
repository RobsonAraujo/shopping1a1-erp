import { reportsConfig } from "@/config/reports";
import { roundMoney } from "@/lib/financial-margin";
import {
  type CalendarDateRange,
  getCalendarMonthRange,
} from "@/lib/mercadolibre/revenue-periods";
import {
  billingPeriodKey,
  type MlBillingDreLines,
} from "./billing-shared";
import {
  aggregateMlBillingDetails,
  aggregateSummaryCharges,
  fetchAllMlBillingDetails,
  listBillingMergeDivergences,
  mergeBillingLines,
  preferCompleteBillingAmount,
  type MlBillingDetailEntry,
  type MlDetailsAggregation,
} from "./billing-details";
import { getMercadoLibreConfig } from "./config";

export type { MlBillingDreLines } from "./billing-shared";
export { normalizeBillingLabel, classifyFullChargeLabel, isFullChargeLabel } from "./billing-shared";

export type BillingCharge = {
  label?: string;
  amount?: number;
  type?: string;
  groupId?: string | number;
};

type BillingSummaryResponse = {
  period?: {
    date_from?: string;
    date_to?: string;
    key?: string;
  };
  bill_includes?: {
    charges?: BillingCharge[];
    bonuses?: BillingCharge[];
  };
  payment_collected?: {
    operation_discount?: number;
  };
  charges?: BillingCharge[];
  bonuses?: BillingCharge[];
};

/** Resultado completo do fetch mensal de faturamento ML. */
export type MlBillingMonthResult = MlBillingDreLines & {
  billingPeriod: CalendarDateRange | null;
  source: "billing";
  detailsUsed: boolean;
  detailsAggregation: MlDetailsAggregation | null;
  /** Lançamentos brutos do /details desta key — reuso no corte civil sem re-paginar. */
  detailEntries: MlBillingDetailEntry[];
  /** Diferenças summary vs details (já resolvidas pelo merge mais completo). */
  mergeWarnings: string[];
};

/** @deprecated use MlBillingMonthResult */
export type MlBillingSummary = MlBillingMonthResult;

function parseYmd(value: string): { year: number; month: number; day: number } | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  if (!match) return null;
  return {
    year: Number(match[1]),
    month: Number(match[2]),
    day: Number(match[3]),
  };
}

function localDateTimeToUtc(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  second: number,
  ms: number,
  timeZone: string,
): Date {
  const utcGuess = Date.UTC(year, month - 1, day, hour, minute, second, ms);
  const guessDate = new Date(utcGuess);
  const inTz = guessDate.toLocaleString("en-US", { timeZone });
  const inUtc = guessDate.toLocaleString("en-US", { timeZone: "UTC" });
  const offsetMs = new Date(inTz).getTime() - new Date(inUtc).getTime();
  return new Date(utcGuess - offsetMs);
}

export function parseBillingPeriodRange(
  period: BillingSummaryResponse["period"],
  timeZone: string = reportsConfig.catalogCompetitionTimezone,
): CalendarDateRange | null {
  if (!period?.date_from || !period?.date_to) return null;

  const fromParts = parseYmd(period.date_from);
  const toParts = parseYmd(period.date_to);
  if (!fromParts || !toParts) return null;

  return {
    from: localDateTimeToUtc(
      fromParts.year,
      fromParts.month,
      fromParts.day,
      0,
      0,
      0,
      0,
      timeZone,
    ),
    to: localDateTimeToUtc(
      toParts.year,
      toParts.month,
      toParts.day,
      23,
      59,
      59,
      999,
      timeZone,
    ),
  };
}

export function extractBillingSummaryEntries(
  data: BillingSummaryResponse,
): { charges: BillingCharge[]; bonuses: BillingCharge[] } {
  return {
    charges: [
      ...(data.bill_includes?.charges ?? []),
      ...(data.charges ?? []),
    ],
    bonuses: [
      ...(data.bill_includes?.bonuses ?? []),
      ...(data.bonuses ?? []),
    ],
  };
}

/** Mapeia charges/bonuses do summary ML para linhas do DRE (valores negativos = custo). */
export function mapBillingSummaryToDreLines(
  data: BillingSummaryResponse,
): Omit<MlBillingDreLines, "source" | "billingPeriod" | "detailsUsed" | "detailsAggregation"> {
  const { charges, bonuses } = extractBillingSummaryEntries(data);
  const aggregated = aggregateSummaryCharges(charges, bonuses);

  const operationDiscount = Number(data.payment_collected?.operation_discount ?? NaN);
  const revenueMl =
    Number.isFinite(operationDiscount) && operationDiscount > 0
      ? roundMoney(operationDiscount)
      : null;

  return {
    revenueMl,
    saleFee: aggregated.saleFeeMl,
    sellerShipping: aggregated.sellerShippingMl,
    cancelledSales: aggregated.cancelledSalesMl,
    partialReturns: aggregated.partialReturnsMl,
    returnFee: aggregated.returnFeeMl,
    specialFees: aggregated.specialFeesMl,
    fullShipping: aggregated.fullShippingMl,
    fullStorage: aggregated.fullStorageMl,
    fullNonCompliance: aggregated.fullNonComplianceMl,
    adsCost: aggregated.adsCost,
    minhaPagina: aggregated.minhaPaginaMl,
    affiliateFee: aggregated.affiliateFeeMl,
  };
}

export function isBillingSummaryEmpty(
  mapped: Omit<MlBillingDreLines, "source" | "detailsUsed" | "detailsAggregation">,
): boolean {
  const hasRevenue = mapped.revenueMl !== null && mapped.revenueMl > 0;
  const hasCosts =
    mapped.saleFee !== 0 ||
    mapped.sellerShipping !== 0 ||
    mapped.cancelledSales !== 0 ||
    mapped.partialReturns !== 0 ||
    mapped.returnFee !== 0 ||
    mapped.specialFees !== 0 ||
    mapped.fullShipping !== 0 ||
    mapped.fullStorage !== 0 ||
    mapped.fullNonCompliance !== 0 ||
    mapped.adsCost !== 0 ||
    mapped.minhaPagina !== 0 ||
    mapped.affiliateFee !== 0;

  return !hasRevenue && !hasCosts;
}

async function fetchBillingSummaryRaw(
  accessToken: string,
  key: string,
  documentType: "BILL" | "CREDIT_NOTE",
): Promise<BillingSummaryResponse | null> {
  const { apiBase } = getMercadoLibreConfig();
  const u = new URL(
    `${apiBase}/billing/integration/periods/key/${key}/summary/details`,
  );
  u.searchParams.set("group", "ML");
  u.searchParams.set("document_type", documentType);

  const res = await fetch(u.toString(), {
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: "no-store",
  });

  if (!res.ok) {
    return null;
  }

  return (await res.json()) as BillingSummaryResponse;
}

function mergeBillingResponses(
  bill: BillingSummaryResponse | null,
  creditNote: BillingSummaryResponse | null,
): BillingSummaryResponse {
  const billEntries = bill
    ? extractBillingSummaryEntries(bill)
    : { charges: [], bonuses: [] };
  const creditEntries = creditNote
    ? extractBillingSummaryEntries(creditNote)
    : { charges: [], bonuses: [] };

  return {
    period: bill?.period ?? creditNote?.period,
    payment_collected: bill?.payment_collected ?? creditNote?.payment_collected,
    bill_includes: {
      charges: [...billEntries.charges, ...creditEntries.charges],
      bonuses: [...billEntries.bonuses, ...creditEntries.bonuses],
    },
  };
}

async function fetchFullBillingTotals(
  accessToken: string,
  key: string,
  cache?: import("./billing-full-collect").FullBillingDetailsCache,
): Promise<{
  fullShipping: number;
  fullStorage: number;
  fullNonCompliance: number;
}> {
  const {
    fetchAllMlFullBillingDetails,
    aggregateFullDetailsToDreTotals,
  } = await import("./billing-full-collect");
  const rows = await fetchAllMlFullBillingDetails(accessToken, key, {
    documentTypes: ["BILL", "CREDIT_NOTE"],
    cache,
  });
  return aggregateFullDetailsToDreTotals(rows);
}

function mergeFullTotals(
  summaryTotals: Pick<
    MlBillingDreLines,
    "fullShipping" | "fullStorage" | "fullNonCompliance"
  >,
  detailTotals: Pick<
    MlBillingDreLines,
    "fullShipping" | "fullStorage" | "fullNonCompliance"
  >,
): Pick<MlBillingDreLines, "fullShipping" | "fullStorage" | "fullNonCompliance"> {
  return {
    fullShipping: preferCompleteBillingAmount(
      detailTotals.fullShipping,
      summaryTotals.fullShipping,
    ),
    fullStorage: preferCompleteBillingAmount(
      detailTotals.fullStorage,
      summaryTotals.fullStorage,
    ),
    fullNonCompliance: preferCompleteBillingAmount(
      detailTotals.fullNonCompliance,
      summaryTotals.fullNonCompliance,
    ),
  };
}

export async function fetchMlBillingSummaryForMonth(
  accessToken: string,
  year: number,
  month: number,
  options?: {
    fullDetailsCache?: import("./billing-full-collect").FullBillingDetailsCache;
  },
): Promise<MlBillingMonthResult | null> {
  const key = billingPeriodKey(year, month);

  const [bill, creditNote, fullTotals, detailEntries] = await Promise.all([
    fetchBillingSummaryRaw(accessToken, key, "BILL"),
    fetchBillingSummaryRaw(accessToken, key, "CREDIT_NOTE"),
    fetchFullBillingTotals(accessToken, key, options?.fullDetailsCache),
    fetchAllMlBillingDetails(accessToken, key),
  ]);

  const detailsAggregation =
    detailEntries.length > 0
      ? aggregateMlBillingDetails(detailEntries)
      : null;

  if (!bill && !creditNote && !detailsAggregation) {
    return null;
  }

  const merged = mergeBillingResponses(bill, creditNote);
  const summaryMapped = mapBillingSummaryToDreLines(merged);
  const fullMerged = mergeFullTotals(summaryMapped, fullTotals);
  const mergedLines = mergeBillingLines(
    detailsAggregation,
    summaryMapped,
    fullMerged,
  );

  const billingPeriod =
    parseBillingPeriodRange(merged.period) ??
    getCalendarMonthRange(year, month);

  const detailsUsed = detailsAggregation !== null && detailsAggregation.chargeCount > 0;
  const mergeWarnings = listBillingMergeDivergences(
    detailsAggregation,
    summaryMapped,
    fullMerged,
  );

  return {
    ...mergedLines,
    billingPeriod,
    source: "billing",
    detailsUsed,
    detailsAggregation,
    detailEntries,
    mergeWarnings,
  };
}

export async function fetchBillingSummaryRawForDebug(
  accessToken: string,
  key: string,
  documentType: "BILL" | "CREDIT_NOTE",
): Promise<{ ok: boolean; status: number; data: BillingSummaryResponse | null }> {
  const { apiBase } = getMercadoLibreConfig();
  const u = new URL(
    `${apiBase}/billing/integration/periods/key/${key}/summary/details`,
  );
  u.searchParams.set("group", "ML");
  u.searchParams.set("document_type", documentType);

  const res = await fetch(u.toString(), {
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: "no-store",
  });

  if (!res.ok) {
    return { ok: false, status: res.status, data: null };
  }

  return {
    ok: true,
    status: res.status,
    data: (await res.json()) as BillingSummaryResponse,
  };
}
