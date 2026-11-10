import {
  computeFinancialMargin,
  computeMarginAfterAds,
  type FinancialMarginLine,
} from "@/lib/pricing/financial-margin";
import type { MlCostsAtPrice } from "@/lib/pricing/refine-min-sale-price";
import type { RotinaPricingInputs } from "@/lib/rotina/types";

/**
 * "E se eu vender a R$ X?" — a mesma conta da Lucratividade
 * (`computeFinancialMargin` + `computeMarginAfterAds`) e do preço mínimo, com
 * taxa e frete cotados no ML para o preço pedido. Por usar a mesma conta,
 * simular o preço mínimo devolve a margem-alvo.
 */

export type SimulatedPrice = {
  price: number;
  /** `false` = o ML não cotou taxa/frete neste preço. */
  quoted: boolean;
  mlFeeAmount: number | null;
  shippingCost: number | null;
  marginPercent: number | null;
  marginValue: number | null;
  marginAfterAdsPercent: number | null;
  marginAfterAdsValue: number | null;
  /** A margem que decide contra a meta: após ADS, ou MC sem ADS utilizável. */
  decidingBasis: "afterAds" | "contribution";
  meetsTarget: boolean | null;
  /** Linhas da conta (taxa, frete, custo, imposto…, margem, ADS, após ADS). */
  lines: FinancialMarginLine[];
};

export function simulateMarginAtPrice(
  price: number,
  costs: MlCostsAtPrice | null,
  inputs: RotinaPricingInputs,
  targetPercent: number,
): SimulatedPrice {
  const spendWithoutSales = inputs.tacosPercent === null && (inputs.adsCost ?? 0) > 0;
  const adsUsable = inputs.adsMetricsAvailable && !spendWithoutSales;
  const decidingBasis = adsUsable ? "afterAds" : "contribution";

  if (!costs) {
    return {
      price,
      quoted: false,
      mlFeeAmount: null,
      shippingCost: null,
      marginPercent: null,
      marginValue: null,
      marginAfterAdsPercent: null,
      marginAfterAdsValue: null,
      decidingBasis,
      meetsTarget: null,
      lines: [],
    };
  }

  const breakdown = computeFinancialMargin({
    salePrice: price,
    mlFeeAmount: costs.mlFeeAmount,
    mlFeeRebate: inputs.mlFeeRebate ?? 0,
    shippingCost: costs.shippingCost,
    productCost: inputs.productCost,
    extraCosts: inputs.extraCosts ?? 0,
    taxRatePercent: inputs.taxRatePercent,
    listingTypeLabel: inputs.listingTypeLabel,
  });

  const afterAds = adsUsable
    ? computeMarginAfterAds({
        marginBreakdown: breakdown,
        tacosPercent: inputs.tacosPercent ?? 0,
        adsCost: inputs.adsCost,
        unitsSold: inputs.adsUnitsSold,
      })
    : null;

  const deciding =
    decidingBasis === "afterAds"
      ? (afterAds?.marginAfterAdsPercent ?? null)
      : breakdown.marginPercent;

  return {
    price,
    quoted: true,
    mlFeeAmount: costs.mlFeeAmount,
    shippingCost: costs.shippingCost,
    marginPercent: breakdown.marginPercent,
    marginValue: breakdown.marginValue,
    marginAfterAdsPercent: afterAds?.marginAfterAdsPercent ?? null,
    marginAfterAdsValue: afterAds?.marginAfterAdsValue ?? null,
    decidingBasis,
    meetsTarget: deciding === null ? null : deciding >= targetPercent - 1e-9,
    lines: afterAds?.extendedLines ?? breakdown.lines,
  };
}
