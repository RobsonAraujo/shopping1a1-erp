import {
  computeFinancialMargin,
  computeMarginAfterAds,
  computeMinSalePriceForTargetMargin,
  roundMoney,
  type MarginBasis,
  type MinSalePriceInput,
  type MinSalePriceResult,
} from "@/lib/pricing/financial-margin";
import {
  fetchListingSaleFee,
  siteIdFromItemId,
} from "@/lib/mercadolibre/listing-fees";
import { fetchSellerShippingCost } from "@/lib/mercadolibre/seller-shipping-cost";
import type { ItemBody } from "@/lib/mercadolibre/types";

export type MlCostsAtPrice = {
  mlFeeAmount: number;
  shippingCost: number;
};

export type RefineMinSalePriceResult = MinSalePriceResult & {
  refined: boolean;
};

const PRICE_PRECISION = 0.01;
const MAX_BINARY_ITERATIONS = 8;
const MAX_HIGH_EXPANSIONS = 4;

export type MarginAtPriceParams = {
  mlFeeRebate: number;
  productCost: number;
  extraCosts: number;
  taxRatePercent: number;
  listingTypeLabel: string | null;
  marginBasis: MarginBasis;
  tacosPercent: number | null;
  adsCost: number | null;
  adsUnitsSold: number | null;
  adsMetricsAvailable: boolean;
};

export function marginPercentAtPrice(
  price: number,
  mlFeeAmount: number,
  shippingCost: number,
  params: MarginAtPriceParams,
): number | null {
  if (!Number.isFinite(price) || price <= 0) return null;

  const breakdown = computeFinancialMargin({
    salePrice: price,
    mlFeeAmount,
    mlFeeRebate: params.mlFeeRebate,
    shippingCost,
    productCost: params.productCost,
    extraCosts: params.extraCosts,
    taxRatePercent: params.taxRatePercent,
    listingTypeLabel: params.listingTypeLabel,
  });

  if (params.marginBasis === "afterAds" && params.adsMetricsAvailable) {
    const afterAds = computeMarginAfterAds({
      marginBreakdown: breakdown,
      tacosPercent: params.tacosPercent,
      adsCost: params.adsCost,
      unitsSold: params.adsUnitsSold,
    });
    return afterAds?.marginAfterAdsPercent ?? null;
  }

  return breakdown.marginPercent;
}

export async function resolveMlCostsAtPrice(
  accessToken: string,
  userId: number,
  item: ItemBody,
  price: number,
  currencyId: string | null,
): Promise<MlCostsAtPrice | null> {
  if (!item.category_id || !item.listing_type_id) return null;

  const siteId = siteIdFromItemId(item.id);

  const [fee, shipping] = await Promise.all([
    fetchListingSaleFee(accessToken, {
      siteId,
      price,
      categoryId: item.category_id,
      listingTypeId: item.listing_type_id,
      currencyId,
      logisticType: item.shipping?.logistic_type ?? null,
      shippingMode: item.shipping?.mode ?? null,
    }),
    fetchSellerShippingCost(accessToken, {
      sellerId: userId,
      item,
      effectiveSalePrice: price,
    }),
  ]);

  return {
    mlFeeAmount: fee.feeAmount,
    shippingCost: shipping.applicable ? shipping.cost : 0,
  };
}

export async function refineMinSalePriceForTargetMargin(
  accessToken: string,
  userId: number,
  item: ItemBody,
  input: MinSalePriceInput,
  marginParams: MarginAtPriceParams & {
    tacosPercent: number | null;
    adsCost: number | null;
    adsUnitsSold: number | null;
    adsMetricsAvailable: boolean;
    listingTypeLabel: string | null;
  },
  currencyId: string | null,
): Promise<RefineMinSalePriceResult> {
  const estimate = computeMinSalePriceForTargetMargin(input);
  if (estimate.reason !== "ok" || estimate.minSalePrice === null) {
    return { ...estimate, refined: false };
  }

  if (
    input.productCost === null ||
    !Number.isFinite(input.productCost) ||
    !item.category_id ||
    !item.listing_type_id
  ) {
    return { ...estimate, refined: false };
  }

  const productCost = roundMoney(Math.max(0, input.productCost));
  const extraCosts =
    input.extraCosts !== null && Number.isFinite(input.extraCosts)
      ? roundMoney(Math.max(0, input.extraCosts))
      : 0;
  const taxRatePercent = input.taxRatePercent ?? 0;
  const mlFeeRebate = roundMoney(
    Math.min(
      Math.max(0, input.mlFeeRebate ?? 0),
      Math.max(0, input.mlFeeAmount),
    ),
  );

  const marginAtPriceParams: MarginAtPriceParams = {
    mlFeeRebate,
    productCost,
    extraCosts,
    taxRatePercent,
    listingTypeLabel: marginParams.listingTypeLabel,
    marginBasis: input.marginBasis,
    tacosPercent: marginParams.tacosPercent,
    adsCost: marginParams.adsCost,
    adsUnitsSold: marginParams.adsUnitsSold,
    adsMetricsAvailable: marginParams.adsMetricsAvailable,
  };

  const costCache = new Map<number, MlCostsAtPrice>();

  async function marginAt(price: number): Promise<number | null> {
    const key = roundMoney(price);
    let costs = costCache.get(key);
    if (!costs) {
      const resolved = await resolveMlCostsAtPrice(
        accessToken,
        userId,
        item,
        key,
        currencyId,
      );
      if (!resolved) return null;
      costs = resolved;
      costCache.set(key, costs);
    }
    return marginPercentAtPrice(key, costs.mlFeeAmount, costs.shippingCost, {
      ...marginAtPriceParams,
    });
  }

  const target = input.targetMarginPercent;
  const salePrice = input.salePrice;
  const alreadyMeetsTarget = estimate.alreadyMeetsTarget;

  let low = roundMoney(Math.max(0.01, productCost + extraCosts));
  let high = alreadyMeetsTarget
    ? salePrice
    : Math.max(salePrice, estimate.minSalePrice * 1.25);

  if (!alreadyMeetsTarget) {
    let marginHigh = await marginAt(high);
    let expansions = 0;
    while (
      (marginHigh === null || marginHigh < target) &&
      expansions < MAX_HIGH_EXPANSIONS
    ) {
      high = roundMoney(high * 1.35);
      marginHigh = await marginAt(high);
      expansions += 1;
    }
    if (marginHigh === null || marginHigh < target) {
      return { ...estimate, refined: false };
    }
    low = salePrice;
  } else {
    const marginLow = await marginAt(low);
    if (marginLow !== null && marginLow >= target) {
      return {
        ...estimate,
        minSalePrice: low,
        refined: true,
      };
    }
  }

  for (let i = 0; i < MAX_BINARY_ITERATIONS; i++) {
    if (high - low <= PRICE_PRECISION) break;

    const mid = roundMoney((low + high) / 2);
    const marginMid = await marginAt(mid);
    if (marginMid === null) {
      return { ...estimate, refined: false };
    }

    if (marginMid >= target) {
      high = mid;
    } else {
      low = mid;
    }
  }

  const refinedPrice = roundMoney(high);
  const refinedMargin = await marginAt(refinedPrice);

  return {
    minSalePrice: refinedPrice,
    currentMarginPercent: estimate.currentMarginPercent,
    alreadyMeetsTarget:
      estimate.currentMarginPercent !== null &&
      estimate.currentMarginPercent >= target,
    reason: "ok",
    refined: refinedMargin !== null,
  };
}
