import {
  computeFinancialMargin,
  computeMarginAfterAds,
  computeMinSalePriceForTargetMargin,
  type MarginBasis,
  type MinSalePriceResult,
} from "@/lib/pricing/financial-margin";
import type { FinancialEvaluationRow } from "@/lib/lucratividade/financial-evaluation-data";
import {
  MARGIN_EXCLUSION_LABEL,
  marginExclusionReason,
} from "@/lib/lucratividade/margin-summary";

/** Patch de `GET /api/financial-evaluation/min-prices` — sempre no preço de hoje. */
export type MinPricePatch = {
  mlItemId: string;
  currentSalePrice: number;
  minSalePriceForTarget: MinSalePriceResult | null;
  minSalePriceTargetPercent: number | null;
  minSalePriceMarginBasis: MarginBasis | null;
  minSalePriceRefined: boolean;
};

export type MinPricesApiResponse = {
  targetMarginPercent: number;
  marginBasis: MarginBasis;
  patches: MinPricePatch[];
  notOperationalIds?: string[];
};

/** Margem do anúncio na base da meta. Pós ADS sem dado de ADS cai na de
 * contribuição (sem TACOS conhecido, é o que se sabe). */
export function rowBasisMarginPercent(
  row: Pick<FinancialEvaluationRow, "breakdown" | "marginAfterAdsPercent" | "adsMetricsAvailable">,
  basis: MarginBasis,
): number | null {
  const contribution = row.breakdown?.marginPercent ?? null;
  if (basis === "afterAds" && row.adsMetricsAvailable) {
    return row.marginAfterAdsPercent ?? contribution;
  }
  return contribution;
}

/** Abaixo da meta — só para quem entra na média (excluído não tem margem confiável). */
export function isRowBelowTarget(
  row: FinancialEvaluationRow,
  targetMarginPercent: number,
  basis: MarginBasis,
): boolean {
  if (row.pending || marginExclusionReason(row) !== null) return false;
  const margin = rowBasisMarginPercent(row, basis);
  return margin !== null && margin < targetMarginPercent;
}

/** Estimativa local do preço mínimo (taxa ML proporcional ao preço, frete
 * fixo) — usada enquanto o cálculo exato no ML não volta. */
export function estimateMinPriceForTarget(
  row: FinancialEvaluationRow,
  targetMarginPercent: number,
  marginBasis: MarginBasis,
): MinSalePriceResult {
  if (
    row.mlFeeAmount === null ||
    row.shippingCost === null ||
    !row.breakdown ||
    row.salePrice <= 0
  ) {
    return {
      minSalePrice: null,
      currentMarginPercent: null,
      alreadyMeetsTarget: false,
      reason: "incomplete",
    };
  }

  const breakdown = computeFinancialMargin({
    salePrice: row.salePrice,
    mlFeeAmount: row.mlFeeAmount,
    mlFeeRebate: row.mlFeeRebate ?? 0,
    shippingCost: row.shippingCost,
    productCost: row.productCost,
    extraCosts: row.extraCosts,
    taxRatePercent: row.taxRatePercent,
    listingTypeLabel: row.listingTypeLabel,
  });

  const afterAds =
    row.adsMetricsAvailable && marginBasis === "afterAds"
      ? computeMarginAfterAds({
          marginBreakdown: breakdown,
          tacosPercent: row.tacosPercent,
          adsCost: row.adsCost,
          unitsSold: row.adsUnitsSold,
        })
      : null;

  return computeMinSalePriceForTargetMargin({
    salePrice: row.salePrice,
    mlFeeAmount: row.mlFeeAmount,
    mlFeeRebate: row.mlFeeRebate ?? 0,
    shippingCost: row.shippingCost,
    productCost: row.productCost,
    extraCosts: row.extraCosts,
    taxRatePercent: row.taxRatePercent,
    targetMarginPercent,
    marginBasis,
    tacosPercent: row.tacosPercent,
    currentContributionMarginPercent: breakdown.marginPercent,
    currentAfterAdsMarginPercent: afterAds?.marginAfterAdsPercent ?? null,
  });
}

/** O que a célula "Preço p/ meta" mostra. */
export type TargetPriceCell =
  | { kind: "pending" }
  | { kind: "excluded"; label: string }
  | { kind: "meets" }
  | { kind: "refining" }
  | { kind: "unavailable"; reason: string }
  | { kind: "impossible" }
  | {
      kind: "price";
      minSalePrice: number;
      /** Preço de hoje no ML (null = ainda não consultado). */
      livePrice: number | null;
      /** `minSalePrice − livePrice`; ≤ 0 = o preço de hoje já atinge a meta. */
      delta: number | null;
      /** true = estimativa proporcional (taxa/frete não consultados no ML). */
      estimate: boolean;
    };

export function resolveTargetPriceCell(input: {
  row: FinancialEvaluationRow;
  /** Resultado do ML no preço de hoje (ou "not_operational"). */
  patch: MinPricePatch | "not_operational" | undefined;
  refining: boolean;
  targetMarginPercent: number;
  marginBasis: MarginBasis;
  /** Simulação: a linha já é o preço de hoje. */
  rowIsLive: boolean;
}): TargetPriceCell {
  const { row, patch, refining, targetMarginPercent, marginBasis, rowIsLive } =
    input;
  if (row.pending) return { kind: "pending" };
  const exclusion = marginExclusionReason(row);
  if (exclusion) {
    return { kind: "excluded", label: MARGIN_EXCLUSION_LABEL[exclusion] };
  }
  if (!isRowBelowTarget(row, targetMarginPercent, marginBasis)) {
    return { kind: "meets" };
  }
  if (patch === "not_operational") {
    return { kind: "unavailable", reason: "Anúncio não está mais ativo no ML." };
  }

  const fromMl = patch?.minSalePriceForTarget ?? null;
  if (patch && fromMl) {
    if (fromMl.reason === "impossible") return { kind: "impossible" };
    if (fromMl.minSalePrice === null) {
      return { kind: "unavailable", reason: "Dados insuficientes no ML." };
    }
    return {
      kind: "price",
      minSalePrice: fromMl.minSalePrice,
      livePrice: patch.currentSalePrice,
      delta: fromMl.minSalePrice - patch.currentSalePrice,
      estimate: !patch.minSalePriceRefined,
    };
  }
  if (refining) return { kind: "refining" };

  const estimate = estimateMinPriceForTarget(row, targetMarginPercent, marginBasis);
  if (estimate.reason === "impossible") return { kind: "impossible" };
  if (estimate.minSalePrice === null) {
    return { kind: "unavailable", reason: "Dados insuficientes." };
  }
  return {
    kind: "price",
    minSalePrice: estimate.minSalePrice,
    livePrice: rowIsLive ? row.salePrice : null,
    delta: rowIsLive ? estimate.minSalePrice - row.salePrice : null,
    estimate: true,
  };
}
