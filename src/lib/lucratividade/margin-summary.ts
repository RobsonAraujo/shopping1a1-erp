import { roundMoney } from "@/lib/pricing/financial-margin";
import type { FinancialEvaluationRow } from "@/lib/lucratividade/financial-evaluation-data";

/**
 * Por que um anúncio fica fora da média da Lucratividade. Sem custo ou sem
 * alíquota, a margem é calculada com R$ 0 / 0% no lugar — fica inflada e
 * distorceria a média; por isso o anúncio aparece na tabela, mas não entra
 * na conta até ser completado. Vale igual no período e na simulação.
 */
export type MarginExclusionReason =
  | "missing_cost"
  | "missing_tax"
  | "kit_incomplete"
  | "incomplete";

export const MARGIN_EXCLUSION_LABEL: Record<MarginExclusionReason, string> = {
  missing_cost: "Sem custo",
  missing_tax: "Sem alíquota",
  kit_incomplete: "Kit incompleto",
  incomplete: "Erro no cálculo",
};

type SummaryRow = Pick<
  FinancialEvaluationRow,
  | "pending"
  | "breakdown"
  | "productCost"
  | "taxRatePercent"
  | "kitMissingSkus"
  | "adsMetricsAvailable"
  | "marginAfterAdsPercent"
  | "marginAfterAdsValue"
  | "periodUnitsSold"
  | "periodRevenue"
>;

/** `null` = entra na média. Linhas ainda carregando (`pending`) também
 * devolvem `null` — quem soma deve pulá-las à parte. */
export function marginExclusionReason(
  row: SummaryRow,
): MarginExclusionReason | null {
  if (row.pending) return null;
  if (!row.breakdown || row.breakdown.marginPercent === null) {
    return "incomplete";
  }
  if (row.kitMissingSkus && row.kitMissingSkus.length > 0) {
    return "kit_incomplete";
  }
  if (row.productCost === null) return "missing_cost";
  if (row.taxRatePercent === null) return "missing_tax";
  return null;
}

export type MarginSummary = {
  /** `weighted`: período de vendas, cada anúncio pesa pelo faturamento.
   * `simple`: simulação no preço de hoje, peso igual. */
  mode: "weighted" | "simple";
  contributionPercent: number | null;
  afterAdsPercent: number | null;
  /** Margem total em R$ das vendas incluídas (só `weighted`). */
  contributionValueTotal: number | null;
  afterAdsValueTotal: number | null;
  includedCount: number;
  /** Faturamento e unidades que entraram na média (só `weighted`). */
  includedRevenue: number;
  includedUnits: number;
  /** Quantos anúncios entraram na média pós ADS (ADS disponível). */
  afterAdsIncludedCount: number;
  /** Ainda carregando — a média é parcial enquanto > 0. */
  pendingCount: number;
  excluded: {
    count: number;
    revenue: number;
    units: number;
    byReason: Record<MarginExclusionReason, number>;
  };
  totalCount: number;
  totalRevenue: number;
  totalUnits: number;
};

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

export function computeMarginSummary(
  rows: SummaryRow[],
  options: { weighted: boolean },
): MarginSummary {
  const byReason: Record<MarginExclusionReason, number> = {
    missing_cost: 0,
    missing_tax: 0,
    kit_incomplete: 0,
    incomplete: 0,
  };
  let excludedCount = 0;
  let excludedRevenue = 0;
  let excludedUnits = 0;
  let pendingCount = 0;
  let totalRevenue = 0;
  let totalUnits = 0;

  let includedCount = 0;
  let includedRevenue = 0;
  let includedUnits = 0;
  // ponderado: Σ margem R$ (un. × margem/un.) ÷ Σ receita (un. × preço)
  let contributionValue = 0;
  let saleBase = 0;
  let afterAdsValue = 0;
  let afterAdsSaleBase = 0;
  // simples: Σ % ÷ n
  let contributionPercentSum = 0;
  let afterAdsPercentSum = 0;
  let afterAdsCount = 0;

  for (const row of rows) {
    const units = options.weighted ? (row.periodUnitsSold ?? 0) : 0;
    const revenue = options.weighted ? (row.periodRevenue ?? 0) : 0;
    totalUnits += units;
    totalRevenue += revenue;

    if (row.pending) {
      pendingCount += 1;
      continue;
    }

    const reason = marginExclusionReason(row);
    if (reason || (options.weighted && units <= 0)) {
      excludedCount += 1;
      excludedRevenue += revenue;
      excludedUnits += units;
      byReason[reason ?? "incomplete"] += 1;
      continue;
    }

    const breakdown = row.breakdown!;
    const marginPercent = breakdown.marginPercent!;
    const hasAfterAds =
      row.adsMetricsAvailable &&
      row.marginAfterAdsPercent !== null &&
      row.marginAfterAdsValue !== null;

    includedCount += 1;
    if (options.weighted) {
      const lineSale = breakdown.salePrice * units;
      includedRevenue += revenue;
      includedUnits += units;
      contributionValue += breakdown.marginValue * units;
      saleBase += lineSale;
      if (hasAfterAds) {
        afterAdsValue += row.marginAfterAdsValue! * units;
        afterAdsSaleBase += lineSale;
        afterAdsCount += 1;
      }
    } else {
      contributionPercentSum += marginPercent;
      if (hasAfterAds) {
        afterAdsPercentSum += row.marginAfterAdsPercent!;
        afterAdsCount += 1;
      }
    }
  }

  const contributionPercent = options.weighted
    ? saleBase > 0
      ? round2((contributionValue / saleBase) * 100)
      : null
    : includedCount > 0
      ? round2(contributionPercentSum / includedCount)
      : null;
  const afterAdsPercent = options.weighted
    ? afterAdsSaleBase > 0
      ? round2((afterAdsValue / afterAdsSaleBase) * 100)
      : null
    : afterAdsCount > 0
      ? round2(afterAdsPercentSum / afterAdsCount)
      : null;

  return {
    mode: options.weighted ? "weighted" : "simple",
    contributionPercent,
    afterAdsPercent,
    contributionValueTotal:
      options.weighted && includedCount > 0 ? roundMoney(contributionValue) : null,
    afterAdsValueTotal:
      options.weighted && afterAdsCount > 0 ? roundMoney(afterAdsValue) : null,
    includedCount,
    includedRevenue: roundMoney(includedRevenue),
    includedUnits,
    afterAdsIncludedCount: afterAdsCount,
    pendingCount,
    excluded: {
      count: excludedCount,
      revenue: roundMoney(excludedRevenue),
      units: excludedUnits,
      byReason,
    },
    totalCount: rows.length,
    totalRevenue: roundMoney(totalRevenue),
    totalUnits,
  };
}
