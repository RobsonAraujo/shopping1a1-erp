import type { FinancialEvaluationRow } from "@/lib/lucratividade/financial-evaluation-data";
import { marginExclusionReason } from "@/lib/lucratividade/margin-summary";
import {
  fetchListingSaleFee,
  siteIdFromItemId,
} from "@/lib/mercadolibre/listing-fees";
import { fetchSellerShippingCost } from "@/lib/mercadolibre/seller-shipping-cost";
import type { ItemBody } from "@/lib/mercadolibre/types";
import {
  roundMoney,
  type MinSalePriceInput,
  type MinSalePriceReason,
} from "@/lib/pricing/financial-margin";
import {
  findMinSalePriceBySegments,
  type MinPriceBand,
  type PriceQuoteFn,
  type SegmentedMinPriceResult,
  type ShippingQuoteFn,
} from "@/lib/pricing/min-price-segments";
import type { MarginAtPriceParams } from "@/lib/pricing/refine-min-sale-price";

/**
 * Os dois preços mínimos de um anúncio (MC e após ADS) com cotação real do ML
 * em cada preço sondado. Taxa e frete ficam em cache por preço e são
 * compartilhados entre os dois cálculos — o limiar do frete é achado uma vez só,
 * e com a cotação de frete apenas (sem pagar a de taxa).
 */

export type ListingFloors = {
  targetPercent: number;
  mcPrice: number | null;
  afterAdsPrice: number | null;
  reason: MinSalePriceReason;
  refined: boolean;
  /** Faixas proibidas do mínimo que vale (após ADS, ou MC sem ele). */
  bands: MinPriceBand[];
  /** Chamadas ao ML feitas para este anúncio (log de custo da rodada). */
  mlCalls: number;
};

function createPriceQuotes(
  accessToken: string,
  userId: number,
  item: ItemBody,
  seed: { price: number; mlFeeAmount: number; shippingCost: number },
): { quote: PriceQuoteFn; shippingAt: ShippingQuoteFn; calls: () => number } {
  const feeMemo = new Map<number, Promise<number | null>>();
  const shippingMemo = new Map<number, Promise<number | null>>();
  let calls = 0;

  const seedKey = roundMoney(seed.price);
  feeMemo.set(seedKey, Promise.resolve(seed.mlFeeAmount));
  shippingMemo.set(seedKey, Promise.resolve(seed.shippingCost));

  const shippingAt: ShippingQuoteFn = (price) => {
    const key = roundMoney(price);
    let pending = shippingMemo.get(key);
    if (!pending) {
      calls += 1;
      pending = fetchSellerShippingCost(accessToken, {
        sellerId: userId,
        item,
        effectiveSalePrice: key,
      })
        .then((shipping) => (shipping.applicable ? shipping.cost : 0))
        .catch(() => null);
      shippingMemo.set(key, pending);
    }
    return pending;
  };

  const feeAt = (price: number): Promise<number | null> => {
    const key = roundMoney(price);
    let pending = feeMemo.get(key);
    if (!pending) {
      if (!item.category_id || !item.listing_type_id) return Promise.resolve(null);
      calls += 1;
      pending = fetchListingSaleFee(accessToken, {
        siteId: siteIdFromItemId(item.id),
        price: key,
        categoryId: item.category_id,
        listingTypeId: item.listing_type_id,
        currencyId: item.currency_id ?? null,
        logisticType: item.shipping?.logistic_type ?? null,
        shippingMode: item.shipping?.mode ?? null,
      })
        .then((fee) => fee.feeAmount)
        .catch(() => null);
      feeMemo.set(key, pending);
    }
    return pending;
  };

  const quote: PriceQuoteFn = async (price) => {
    const [mlFeeAmount, shippingCost] = await Promise.all([
      feeAt(price),
      shippingAt(price),
    ]);
    if (mlFeeAmount === null || shippingCost === null) return null;
    return { mlFeeAmount, shippingCost };
  };

  return { quote, shippingAt, calls: () => calls };
}

export async function computeListingFloors(
  accessToken: string,
  userId: number,
  row: FinancialEvaluationRow,
  item: ItemBody,
  targetPercent: number,
): Promise<ListingFloors> {
  const empty = {
    targetPercent,
    mcPrice: null,
    afterAdsPrice: null,
    refined: false,
    bands: [],
    mlCalls: 0,
  };

  // Sem custo/alíquota/kit completo o mínimo sairia com R$ 0 / 0% no lugar —
  // um número pior que nenhum.
  const exclusion = marginExclusionReason(row);
  if (exclusion === "missing_cost") return { ...empty, reason: "missing_product_cost" };
  if (exclusion) return { ...empty, reason: "incomplete" };
  if (
    row.mlFeeAmount === null ||
    row.shippingCost === null ||
    !row.breakdown ||
    row.salePrice <= 0 ||
    row.productCost === null
  ) {
    return { ...empty, reason: "incomplete" };
  }

  const { quote, shippingAt, calls } = createPriceQuotes(accessToken, userId, item, {
    price: row.salePrice,
    mlFeeAmount: row.mlFeeAmount,
    shippingCost: row.shippingCost,
  });

  const input: MinSalePriceInput = {
    salePrice: row.salePrice,
    mlFeeAmount: row.mlFeeAmount,
    mlFeeRebate: row.mlFeeRebate ?? 0,
    shippingCost: row.shippingCost,
    productCost: row.productCost,
    extraCosts: row.extraCosts,
    taxRatePercent: row.taxRatePercent,
    targetMarginPercent: targetPercent,
    marginBasis: "contribution",
    tacosPercent: row.tacosPercent,
    currentContributionMarginPercent: row.breakdown.marginPercent,
    currentAfterAdsMarginPercent: row.marginAfterAdsPercent,
  };
  const params: MarginAtPriceParams = {
    mlFeeRebate: row.mlFeeRebate ?? 0,
    productCost: row.productCost,
    extraCosts: row.extraCosts ?? 0,
    taxRatePercent: row.taxRatePercent ?? 0,
    listingTypeLabel: row.listingTypeLabel,
    marginBasis: "contribution",
    tacosPercent: row.tacosPercent,
    adsCost: row.adsCost,
    adsUnitsSold: row.adsUnitsSold,
    adsMetricsAvailable: row.adsMetricsAvailable,
  };

  const mc = await findMinSalePriceBySegments(input, params, quote, shippingAt);

  // Após ADS = MC com meta + TACOS. Sem ADS (TACOS 0) é o mesmo número; com
  // gasto sem venda (TACOS indefinido) ou ADS fora do ar, não existe.
  let afterAds: SegmentedMinPriceResult | null = null;
  const spendWithoutSales = row.tacosPercent === null && (row.adsCost ?? 0) > 0;
  if (row.adsMetricsAvailable && !spendWithoutSales) {
    afterAds =
      (row.tacosPercent ?? 0) === 0
        ? mc
        : await findMinSalePriceBySegments(
            { ...input, marginBasis: "afterAds" },
            { ...params, marginBasis: "afterAds" },
            quote,
            shippingAt,
          );
  }

  const effective = afterAds ?? mc;
  return {
    targetPercent,
    mcPrice: mc.minSalePrice,
    afterAdsPrice: afterAds?.minSalePrice ?? null,
    reason: effective.reason,
    refined: effective.refined,
    bands: effective.bands,
    mlCalls: calls(),
  };
}
