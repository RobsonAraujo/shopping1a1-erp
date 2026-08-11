import { reportsConfig } from "@/config/reports";
import { roundMoney } from "@/lib/financial-margin";
import {
  type CalendarDateRange,
  getCalendarMonthRange,
} from "@/lib/mercadolibre/revenue-periods";
import {
  addBillingBonus,
  billingPeriodKey,
  classifyFullChargeLabel,
  isBillingBonusType,
  normalizeBillingLabel,
  subtractBillingCost,
  type MlBillingDreLines,
} from "./billing-shared";
import {
  aggregateMlBillingDetails,
  aggregateSummaryCharges,
  fetchAllMlBillingDetails,
  listBillingMergeDivergences,
  mergeBillingLines,
  preferCompleteBillingAmount,
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

type FullBillingDetail = {
  charge_info?: {
    detail_amount?: number;
    detail_type?: string;
    transaction_detail?: string;
  };
  fulfillment_info?: {
    type?: string;
  };
};

type FullBillingResponse = {
  results?: FullBillingDetail[];
  last_id?: number;
  total?: number;
};

/** Resultado completo do fetch mensal de faturamento ML. */
export type MlBillingMonthResult = MlBillingDreLines & {
  billingPeriod: CalendarDateRange | null;
  source: "billing";
  detailsUsed: boolean;
  detailsAggregation: MlDetailsAggregation | null;
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
  if (
    normalized === "INBOUND_PENALTY" ||
    normalized === "OVERAGE"
  ) {
    return "fullNonCompliance";
  }
  if (
    normalized === "INBOUND_COLLECT" ||
    normalized === "WITHDRAWAL"
  ) {
    return "fullShipping";
  }
  return null;
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
): Promise<{
  fullShipping: number;
  fullStorage: number;
  fullNonCompliance: number;
}> {
  const { apiBase } = getMercadoLibreConfig();
  let fullShipping = 0;
  let fullStorage = 0;
  let fullNonCompliance = 0;
  let fromId = 0;
  const limit = 1000;

  for (const documentType of ["BILL", "CREDIT_NOTE"] as const) {
    fromId = 0;
    for (;;) {
      const u = new URL(
        `${apiBase}/billing/integration/periods/key/${key}/group/ML/full/details`,
      );
      u.searchParams.set("document_type", documentType);
      u.searchParams.set("limit", String(limit));
      u.searchParams.set("from_id", String(fromId));

      const res = await fetch(u.toString(), {
        headers: { Authorization: `Bearer ${accessToken}` },
        cache: "no-store",
      });

      if (!res.ok) break;

      const data = (await res.json()) as FullBillingResponse;
      const results = data.results ?? [];
      if (results.length === 0) break;

      for (const row of results) {
        const amount = Number(row.charge_info?.detail_amount ?? 0);
        if (!Number.isFinite(amount) || amount === 0) continue;

        const detailType = (row.charge_info?.detail_type ?? "").toUpperCase();
        const isBonus = isBillingBonusType(detailType);
        const label = normalizeBillingLabel(row.charge_info?.transaction_detail);
        // fulfillment_info.type é estruturado e sempre presente neste
        // endpoint dedicado ao Full — mais confiável que o texto do label,
        // então checado primeiro (protege inconformidade/armazenagem de
        // labels genéricos de Full). Toda linha aqui já é um encargo Full,
        // então na ausência de sinal específico assume-se envio (custo mais
        // comum), em vez de descartar a cobrança.
        const typeCategory = classifyFullFulfillmentType(row.fulfillment_info?.type);
        const labelCategory = classifyFullChargeLabel(label);
        const category = typeCategory ?? labelCategory ?? "fullShipping";

        if (category === "fullShipping") {
          fullShipping = isBonus
            ? addBillingBonus(fullShipping, amount)
            : subtractBillingCost(fullShipping, amount);
        } else if (category === "fullStorage") {
          fullStorage = isBonus
            ? addBillingBonus(fullStorage, amount)
            : subtractBillingCost(fullStorage, amount);
        } else if (category === "fullNonCompliance") {
          fullNonCompliance = isBonus
            ? addBillingBonus(fullNonCompliance, amount)
            : subtractBillingCost(fullNonCompliance, amount);
        }
      }

      const lastId = data.last_id;
      if (
        typeof lastId !== "number" ||
        !Number.isFinite(lastId) ||
        results.length < limit
      ) {
        break;
      }
      fromId = lastId;
    }
  }

  return { fullShipping, fullStorage, fullNonCompliance };
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
): Promise<MlBillingMonthResult | null> {
  const key = billingPeriodKey(year, month);

  const [bill, creditNote, fullTotals, detailEntries] = await Promise.all([
    fetchBillingSummaryRaw(accessToken, key, "BILL"),
    fetchBillingSummaryRaw(accessToken, key, "CREDIT_NOTE"),
    fetchFullBillingTotals(accessToken, key),
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
