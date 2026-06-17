import {
  computeFinancialMargin,
  computeMarginAfterAds,
  listingTypeLabelFromId,
  type FinancialMarginBreakdown,
  type MarginBasis,
  type MinSalePriceResult,
} from "@/lib/financial-margin";
import {
  fetchItemsByIdsBatched,
  fetchOperationalListingIds,
} from "@/lib/mercadolibre/api";
import { bestItemImageUrl } from "@/lib/mercadolibre/item-image";
import { buyerFacingItemPermalink } from "@/lib/mercadolibre/item-permalink";
import { getItemSku } from "@/lib/mercadolibre/item-sku";
import {
  fetchListingSaleFee,
  siteIdFromItemId,
} from "@/lib/mercadolibre/listing-fees";
import { fetchItemSalePrice } from "@/lib/mercadolibre/item-sale-price";
import { fetchLastSaleFeeRebate } from "@/lib/mercadolibre/last-sale-fee-rebate";
import {
  fetchPadsAdvertiserId,
  fetchProductAdsMetricsByItem,
  getProductAdsDateRange,
  PRODUCT_ADS_PERIOD_DAYS,
  type ItemAdMetrics,
} from "@/lib/mercadolibre/product-ads-metrics";
import { fetchSellerShippingCost } from "@/lib/mercadolibre/seller-shipping-cost";
import type { ItemBody } from "@/lib/mercadolibre/types";
import { loadProductsMapBySku } from "@/lib/product-data";
import {
  normalizeProductSku,
  type ResolvedProductPricing,
} from "@/lib/product-pricing";
import { refineMinSalePriceForTargetMargin } from "@/lib/refine-min-sale-price";

export type FinancialEvaluationRow = {
  mlItemId: string;
  title: string;
  sku: string | null;
  imageUrl: string | null;
  permalink: string;
  status: string;
  salePrice: number;
  regularPrice: number | null;
  hasPromotion: boolean;
  listingTypeId: string | null;
  listingTypeLabel: string | null;
  productCost: number | null;
  extraCosts: number | null;
  taxRatePercent: number | null;
  mlFeeAmount: number | null;
  mlFeeRebate: number | null;
  mlFeeRebateOrderId: string | null;
  shippingCost: number | null;
  breakdown: FinancialMarginBreakdown | null;
  acosPercent: number | null;
  tacosPercent: number | null;
  adsCost: number | null;
  adsUnitsSold: number | null;
  adsCostPerUnit: number | null;
  adsPeriodDays: number;
  marginAfterAdsPercent: number | null;
  marginAfterAdsValue: number | null;
  hasActiveAds: boolean;
  adsStatus: string | null;
  adsMetricsAvailable: boolean;
  errors: string[];
  warnings: string[];
  minSalePriceForTarget?: MinSalePriceResult | null;
  minSalePriceTargetPercent?: number | null;
  minSalePriceMarginBasis?: MarginBasis | null;
  minSalePriceRefined?: boolean;
};

async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  if (items.length === 0) return [];
  const results = new Array<R>(items.length);
  let nextIndex = 0;

  async function worker() {
    while (nextIndex < items.length) {
      const index = nextIndex;
      nextIndex += 1;
      results[index] = await fn(items[index], index);
    }
  }

  const workers = Array.from(
    { length: Math.min(concurrency, items.length) },
    () => worker(),
  );
  await Promise.all(workers);
  return results;
}

function isOperationalStatus(status: string | undefined): boolean {
  return status === "active" || status === "paused";
}

function applyAdsToRow(
  row: Omit<
    FinancialEvaluationRow,
    | "acosPercent"
    | "tacosPercent"
    | "adsCost"
    | "adsUnitsSold"
    | "adsCostPerUnit"
    | "adsPeriodDays"
    | "marginAfterAdsPercent"
    | "marginAfterAdsValue"
    | "hasActiveAds"
    | "adsStatus"
    | "adsMetricsAvailable"
  >,
  adMetrics: ItemAdMetrics | undefined,
  adsMetricsAvailable: boolean,
): FinancialEvaluationRow {
  const warnings = [...row.warnings];

  if (!adsMetricsAvailable) {
    return {
      ...row,
      acosPercent: null,
      tacosPercent: null,
      adsCost: null,
      adsUnitsSold: null,
      adsCostPerUnit: null,
      adsPeriodDays: PRODUCT_ADS_PERIOD_DAYS,
      marginAfterAdsPercent: null,
      marginAfterAdsValue: null,
      hasActiveAds: false,
      adsStatus: null,
      adsMetricsAvailable: false,
      warnings,
    };
  }

  if (!adMetrics) {
    warnings.push("Sem Product Ads no período (TACOS considerado 0%).");
    const afterAds =
      row.breakdown &&
      computeMarginAfterAds({
        marginBreakdown: row.breakdown,
        tacosPercent: 0,
        adsCost: 0,
        unitsSold: 0,
      });

    return {
      ...row,
      breakdown: afterAds
        ? { ...row.breakdown!, lines: afterAds.extendedLines }
        : row.breakdown,
      acosPercent: null,
      tacosPercent: 0,
      adsCost: 0,
      adsUnitsSold: 0,
      adsCostPerUnit: 0,
      adsPeriodDays: PRODUCT_ADS_PERIOD_DAYS,
      marginAfterAdsPercent: afterAds?.marginAfterAdsPercent ?? null,
      marginAfterAdsValue: afterAds?.marginAfterAdsValue ?? null,
      hasActiveAds: false,
      adsStatus: null,
      adsMetricsAvailable: true,
      warnings,
    };
  }

  const hasActiveAds =
    adMetrics.status === "active" || adMetrics.status === "paused";
  const tacosPercent = adMetrics.tacosPercent;

  if (adMetrics.cost > 0 && tacosPercent === null) {
    warnings.push("Gasto em ADS sem vendas no período; TACOS indisponível.");
  }
  if (
    adMetrics.unitsQuantity > 0 &&
    adMetrics.unitsQuantity < 3 &&
    tacosPercent !== null
  ) {
    warnings.push("Poucas vendas no período; TACOS pode variar bastante.");
  }
  if (adMetrics.status === "idle") {
    warnings.push("Anúncio disponível para ADS, mas sem campanha ativa.");
  }

  const afterAds =
    row.breakdown &&
    computeMarginAfterAds({
      marginBreakdown: row.breakdown,
      tacosPercent: tacosPercent ?? 0,
      adsCost: adMetrics.cost,
      unitsSold: adMetrics.unitsQuantity,
    });

  return {
    ...row,
    breakdown: afterAds
      ? { ...row.breakdown!, lines: afterAds.extendedLines }
      : row.breakdown,
    acosPercent: adMetrics.acosPercent,
    tacosPercent,
    adsCost: adMetrics.cost,
    adsUnitsSold: adMetrics.unitsQuantity,
    adsCostPerUnit: afterAds?.adsCostPerUnit ?? null,
    adsPeriodDays: PRODUCT_ADS_PERIOD_DAYS,
    marginAfterAdsPercent: afterAds?.marginAfterAdsPercent ?? null,
    marginAfterAdsValue: afterAds?.marginAfterAdsValue ?? null,
    hasActiveAds,
    adsStatus: adMetrics.status,
    adsMetricsAvailable: true,
    warnings,
  };
}

async function buildRowForItem(
  accessToken: string,
  userId: number,
  item: ItemBody,
  pricing: ResolvedProductPricing | null,
): Promise<
  Omit<
    FinancialEvaluationRow,
    | "acosPercent"
    | "tacosPercent"
    | "adsCost"
    | "adsUnitsSold"
    | "adsCostPerUnit"
    | "adsPeriodDays"
    | "marginAfterAdsPercent"
    | "marginAfterAdsValue"
    | "hasActiveAds"
    | "adsStatus"
    | "adsMetricsAvailable"
  >
> {
  const errors: string[] = [];
  const warnings: string[] = [];

  const sku = getItemSku(item);
  const productCost = pricing?.pricingCost ?? null;
  const extraCosts = pricing?.extraCosts ?? null;
  const taxRatePercent = pricing?.taxPercent ?? null;

  let salePrice = item.price;
  let regularPrice: number | null = null;
  let hasPromotion = false;
  let currencyId = item.currency_id ?? null;

  try {
    const salePriceInfo = await fetchItemSalePrice(
      accessToken,
      item.id,
      item.price,
    );
    salePrice = salePriceInfo.amount;
    regularPrice = salePriceInfo.regularAmount;
    hasPromotion = salePriceInfo.hasPromotion;
    currencyId = salePriceInfo.currencyId ?? currencyId;
  } catch (e) {
    warnings.push(
      e instanceof Error
        ? `Preço promocional indisponível: ${e.message}`
        : "Preço promocional indisponível; usando preço do anúncio.",
    );
  }

  if (!sku) {
    warnings.push(
      "Anúncio sem SKU — cadastre o produto em Meus produtos com o mesmo SKU do ML.",
    );
  } else if (!pricing) {
    warnings.push(
      `SKU ${sku} sem cadastro completo em Meus produtos — preencha o custo de precificação.`,
    );
  }

  let mlFeeAmount: number | null = null;
  let listingTypeLabel = listingTypeLabelFromId(item.listing_type_id);

  if (!item.category_id || !item.listing_type_id) {
    errors.push("Anúncio sem categoria ou tipo de listagem para calcular taxa.");
  } else {
    try {
      const fee = await fetchListingSaleFee(accessToken, {
        siteId: siteIdFromItemId(item.id),
        price: salePrice,
        categoryId: item.category_id,
        listingTypeId: item.listing_type_id,
        currencyId,
        logisticType: item.shipping?.logistic_type ?? null,
        shippingMode: item.shipping?.mode ?? null,
      });
      mlFeeAmount = fee.feeAmount;
      listingTypeLabel = fee.listingTypeLabel ?? listingTypeLabel;
    } catch (e) {
      errors.push(
        e instanceof Error ? e.message : "Falha ao consultar taxa ML.",
      );
    }
  }

  let shippingCost: number | null = null;
  try {
    const shipping = await fetchSellerShippingCost(accessToken, {
      sellerId: userId,
      item,
      effectiveSalePrice: salePrice,
    });
    shippingCost = shipping.applicable ? shipping.cost : 0;
    if (!shipping.applicable) {
      warnings.push("Frete grátis não aplicável ou indisponível (considerado 0).");
    }
  } catch (e) {
    errors.push(
      e instanceof Error ? e.message : "Falha ao consultar frete do vendedor.",
    );
  }

  let mlFeeRebate: number | null = null;
  let mlFeeRebateOrderId: string | null = null;
  if (
    hasPromotion &&
    siteIdFromItemId(item.id) === "MLB" &&
    mlFeeAmount !== null
  ) {
    const lastRebate = await fetchLastSaleFeeRebate(
      accessToken,
      userId,
      item.id,
      item.category_id && item.listing_type_id
        ? {
            categoryId: item.category_id,
            listingTypeId: item.listing_type_id,
            currencyId,
            logisticType: item.shipping?.logistic_type ?? null,
            shippingMode: item.shipping?.mode ?? null,
          }
        : undefined,
    );
    if (lastRebate) {
      mlFeeRebate = lastRebate.rebate;
      mlFeeRebateOrderId = lastRebate.orderId;
      warnings.push(
        `Desconto de tarifa baseado na última venda paga (pedido ${lastRebate.orderId}).`,
      );
    }
  }

  const breakdown =
    mlFeeAmount !== null && shippingCost !== null
      ? computeFinancialMargin({
          salePrice,
          mlFeeAmount,
          mlFeeRebate: mlFeeRebate ?? 0,
          shippingCost,
          productCost,
          extraCosts: extraCosts ?? 0,
          taxRatePercent: taxRatePercent ?? 0,
          listingTypeLabel,
        })
      : null;

  return {
    mlItemId: item.id,
    title: item.title,
    sku: getItemSku(item),
    imageUrl: bestItemImageUrl(item) ?? null,
    permalink: buyerFacingItemPermalink(item.permalink, item.id),
    status: item.status,
    salePrice,
    regularPrice,
    hasPromotion,
    listingTypeId: item.listing_type_id ?? null,
    listingTypeLabel,
    productCost,
    extraCosts,
    taxRatePercent,
    mlFeeAmount,
    mlFeeRebate,
    mlFeeRebateOrderId,
    shippingCost,
    breakdown,
    errors,
    warnings,
  };
}

async function loadAdsMetricsByItem(
  accessToken: string,
  siteId: string,
  itemIds?: string[],
): Promise<{ map: Map<string, ItemAdMetrics>; available: boolean }> {
  try {
    const advertiserId = await fetchPadsAdvertiserId(accessToken, siteId);
    if (!advertiserId) {
      return { map: new Map(), available: true };
    }

    const { dateFrom, dateTo } = getProductAdsDateRange();
    const map = await fetchProductAdsMetricsByItem(accessToken, {
      advertiserId,
      siteId,
      dateFrom,
      dateTo,
      itemIds,
    });
    return { map, available: true };
  } catch {
    return { map: new Map(), available: false };
  }
}

async function applyMinPriceRefinement(
  accessToken: string,
  userId: number,
  row: FinancialEvaluationRow,
  item: ItemBody,
  targetMarginPercent: number,
  marginBasis: MarginBasis,
): Promise<FinancialEvaluationRow> {
  if (
    row.mlFeeAmount === null ||
    row.shippingCost === null ||
    !row.breakdown ||
    row.salePrice <= 0
  ) {
    return {
      ...row,
      minSalePriceForTarget: null,
      minSalePriceTargetPercent: targetMarginPercent,
      minSalePriceMarginBasis: marginBasis,
      minSalePriceRefined: false,
    };
  }

  const afterAds =
    row.adsMetricsAvailable && marginBasis === "afterAds"
      ? computeMarginAfterAds({
          marginBreakdown: row.breakdown,
          tacosPercent: row.tacosPercent,
          adsCost: row.adsCost,
          unitsSold: row.adsUnitsSold,
        })
      : null;

  const refined = await refineMinSalePriceForTargetMargin(
    accessToken,
    userId,
    item,
    {
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
      currentContributionMarginPercent: row.breakdown.marginPercent,
      currentAfterAdsMarginPercent: afterAds?.marginAfterAdsPercent ?? null,
    },
    {
      mlFeeRebate: row.mlFeeRebate ?? 0,
      productCost: row.productCost ?? 0,
      extraCosts: row.extraCosts ?? 0,
      taxRatePercent: row.taxRatePercent ?? 0,
      listingTypeLabel: row.listingTypeLabel,
      marginBasis,
      tacosPercent: row.tacosPercent,
      adsCost: row.adsCost,
      adsUnitsSold: row.adsUnitsSold,
      adsMetricsAvailable: row.adsMetricsAvailable,
    },
    item.currency_id ?? null,
  );

  const { refined: isRefined, ...minSalePriceForTarget } = refined;

  return {
    ...row,
    minSalePriceForTarget,
    minSalePriceTargetPercent: targetMarginPercent,
    minSalePriceMarginBasis: marginBasis,
    minSalePriceRefined: isRefined,
  };
}

export async function loadFinancialEvaluationRows(
  accessToken: string,
  userId: number,
  options?: {
    itemIds?: string[];
    targetMarginPercent?: number;
    marginBasis?: MarginBasis;
  },
): Promise<FinancialEvaluationRow[]> {
  const listingIds =
    options?.itemIds && options.itemIds.length > 0
      ? [...new Set(options.itemIds)]
      : await fetchOperationalListingIds(accessToken, userId);

  if (listingIds.length === 0) return [];

  const siteId = listingIds[0]
    ? siteIdFromItemId(listingIds[0])
    : "MLB";

  const [items, adsLoad] = await Promise.all([
    fetchItemsByIdsBatched(accessToken, listingIds),
    loadAdsMetricsByItem(accessToken, siteId, listingIds),
  ]);

  const operationalItems = items.filter((item) =>
    isOperationalStatus(item.status),
  );

  const skus = operationalItems
    .map((item) => getItemSku(item))
    .filter((sku): sku is string => Boolean(sku));
  const pricingBySku = await loadProductsMapBySku(skus);

  const baseRows = await mapWithConcurrency(
    operationalItems,
    5,
    async (item) => {
      const sku = getItemSku(item);
      const pricing = sku
        ? (pricingBySku.get(normalizeProductSku(sku)) ?? null)
        : null;
      return buildRowForItem(accessToken, userId, item, pricing);
    },
  );

  const rows = baseRows.map((row) => {
    const withAds = applyAdsToRow(
      row,
      adsLoad.map.get(row.mlItemId),
      adsLoad.available,
    );
    if (!adsLoad.available) {
      withAds.warnings.push(
        "Métricas de Product Ads indisponíveis; margem pós ADS não calculada.",
      );
    }
    return withAds;
  });

  const itemById = new Map(operationalItems.map((item) => [item.id, item]));

  const targetMarginPercent = options?.targetMarginPercent;
  const marginBasis = options?.marginBasis ?? "contribution";
  const shouldRefineMinPrice =
    targetMarginPercent !== undefined &&
    Number.isFinite(targetMarginPercent) &&
    targetMarginPercent >= 0 &&
    targetMarginPercent <= 100;

  const rowsWithMinPrice = shouldRefineMinPrice
    ? await mapWithConcurrency(rows, 3, async (row) => {
        const item = itemById.get(row.mlItemId);
        if (!item) return row;
        return applyMinPriceRefinement(
          accessToken,
          userId,
          row,
          item,
          targetMarginPercent,
          marginBasis,
        );
      })
    : rows;

  return rowsWithMinPrice.sort((a, b) => {
    const keyA = (a.sku ?? a.title ?? a.mlItemId).toLowerCase();
    const keyB = (b.sku ?? b.title ?? b.mlItemId).toLowerCase();
    return keyA.localeCompare(keyB, "pt-BR");
  });
}
