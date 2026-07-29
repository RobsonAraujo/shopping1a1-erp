import {
  computeFinancialMargin,
  computeMarginAfterAds,
  listingTypeLabelFromId,
  roundMoney,
  type FinancialMarginBreakdown,
  type MarginBasis,
  type MinSalePriceResult,
} from "@/lib/financial-margin";
import { calendarYmdRangeToUtc } from "@/lib/financial-evaluation-period";
import {
  fetchItemsByIdsBatched,
  fetchOperationalListingIds,
  fetchPaidOrdersByPeriod,
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
import type { ItemBody, OrderSearchOrder } from "@/lib/mercadolibre/types";
import { loadProductsMapBySku } from "@/lib/product-data";
import {
  normalizeProductSku,
  type ResolvedProductPricing,
} from "@/lib/product-pricing";
import { loadProductTaxFromLatestReport } from "@/lib/product-tax-from-report";
import { refineMinSalePriceForTargetMargin } from "@/lib/refine-min-sale-price";

export {
  calendarYmdRangeToUtc,
  parseFinancialEvaluationYmd,
} from "@/lib/financial-evaluation-period";

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
  adsPeriodDays: number = PRODUCT_ADS_PERIOD_DAYS,
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
      adsPeriodDays,
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
      adsPeriodDays,
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
    adsPeriodDays,
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
  taxBySku: Map<string, number>,
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
  const taxRatePercent = sku
    ? (taxBySku.get(normalizeProductSku(sku)) ?? null)
    : null;

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
  } else if (taxRatePercent === null) {
    warnings.push(
      `SKU ${sku} sem dados no relatório tributário — recalcule em Relatório tributário para obter o imposto.`,
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
  dateRange?: { dateFrom: string; dateTo: string },
): Promise<{ map: Map<string, ItemAdMetrics>; available: boolean }> {
  try {
    const advertiserId = await fetchPadsAdvertiserId(accessToken, siteId);
    if (!advertiserId) {
      return { map: new Map(), available: true };
    }

    const { dateFrom, dateTo } = dateRange ?? getProductAdsDateRange();
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

type PeriodSaleAgg = {
  itemId: string;
  quantity: number;
  revenue: number;
  saleFeeSum: number;
  saleFeeKnownQty: number;
};

function quantityFromOrderLine(line: { quantity?: unknown }): number {
  const q = line.quantity;
  if (typeof q === "number" && Number.isFinite(q)) return Math.max(0, q);
  if (typeof q === "string") {
    const n = parseInt(q, 10);
    return Number.isFinite(n) ? Math.max(0, n) : 0;
  }
  return 0;
}

function revenueFromOrderLine(line: {
  quantity?: unknown;
  unit_price?: unknown;
}): number {
  const qty = quantityFromOrderLine(line);
  const price = line.unit_price;
  if (typeof price !== "number" || !Number.isFinite(price) || price < 0) {
    return 0;
  }
  return price * qty;
}

function saleFeeFromOrderLine(line: { sale_fee?: unknown }): number | null {
  const fee = line.sale_fee;
  if (typeof fee === "number" && Number.isFinite(fee) && fee >= 0) {
    return fee;
  }
  return null;
}

function listingIdFromOrderLine(line: {
  item?: { id?: string };
  item_id?: string;
}): string | undefined {
  return line.item?.id ?? line.item_id ?? undefined;
}

function aggregatePeriodSalesByItem(
  orders: OrderSearchOrder[],
): Map<string, PeriodSaleAgg> {
  const byItem = new Map<string, PeriodSaleAgg>();

  for (const order of orders) {
    if (order.status === "cancelled") continue;
    for (const line of order.order_items ?? []) {
      const itemId = listingIdFromOrderLine(line);
      if (!itemId) continue;
      const quantity = quantityFromOrderLine(line);
      const revenue = revenueFromOrderLine(line);
      if (quantity <= 0 && revenue <= 0) continue;

      const existing = byItem.get(itemId) ?? {
        itemId,
        quantity: 0,
        revenue: 0,
        saleFeeSum: 0,
        saleFeeKnownQty: 0,
      };
      existing.quantity += quantity;
      existing.revenue += revenue;

      const saleFee = saleFeeFromOrderLine(line);
      if (saleFee !== null && quantity > 0) {
        existing.saleFeeSum += saleFee;
        existing.saleFeeKnownQty += quantity;
      }

      byItem.set(itemId, existing);
    }
  }

  return byItem;
}

async function buildRowForPeriodItem(
  accessToken: string,
  userId: number,
  item: ItemBody,
  pricing: ResolvedProductPricing | null,
  agg: PeriodSaleAgg,
  taxBySku: Map<string, number>,
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
  const taxRatePercent = sku
    ? (taxBySku.get(normalizeProductSku(sku)) ?? null)
    : null;

  const salePrice =
    agg.quantity > 0 ? roundMoney(agg.revenue / agg.quantity) : 0;
  const currencyId = item.currency_id ?? null;

  warnings.push(
    `Preço médio de ${agg.quantity} un. vendidas no período (custos/impostos do cadastro atual).`,
  );

  if (!sku) {
    warnings.push(
      "Anúncio sem SKU — cadastre o produto em Meus produtos com o mesmo SKU do ML.",
    );
  } else if (!pricing) {
    warnings.push(
      `SKU ${sku} sem cadastro completo em Meus produtos — preencha o custo de precificação.`,
    );
  } else if (taxRatePercent === null) {
    warnings.push(
      `SKU ${sku} sem dados no relatório tributário — recalcule em Relatório tributário para obter o imposto.`,
    );
  }

  let mlFeeAmount: number | null = null;
  let listingTypeLabel = listingTypeLabelFromId(item.listing_type_id);
  let usedOrderFee = false;

  if (agg.saleFeeKnownQty > 0) {
    mlFeeAmount = roundMoney(agg.saleFeeSum / agg.saleFeeKnownQty);
    usedOrderFee = true;
    warnings.push("Taxa ML média das vendas do período.");
  } else if (!item.category_id || !item.listing_type_id) {
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
      warnings.push(
        "Taxa ML estimada no preço médio (pedido sem sale_fee).",
      );
    } catch (e) {
      errors.push(
        e instanceof Error ? e.message : "Falha ao consultar taxa ML.",
      );
    }
  }

  if (usedOrderFee && item.listing_type_id) {
    listingTypeLabel = listingTypeLabelFromId(item.listing_type_id);
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
    } else {
      warnings.push("Frete estimado no preço médio do período.");
    }
  } catch (e) {
    errors.push(
      e instanceof Error ? e.message : "Falha ao consultar frete do vendedor.",
    );
  }

  const breakdown =
    mlFeeAmount !== null && shippingCost !== null
      ? computeFinancialMargin({
          salePrice,
          mlFeeAmount,
          mlFeeRebate: 0,
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
    regularPrice: null,
    hasPromotion: false,
    listingTypeId: item.listing_type_id ?? null,
    listingTypeLabel,
    productCost,
    extraCosts,
    taxRatePercent,
    mlFeeAmount,
    mlFeeRebate: null,
    mlFeeRebateOrderId: null,
    shippingCost,
    breakdown,
    errors,
    warnings,
  };
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
  const [pricingBySku, taxFromReport] = await Promise.all([
    loadProductsMapBySku(skus),
    loadProductTaxFromLatestReport(userId),
  ]);
  const taxBySku = new Map(
    [...taxFromReport.bySku].map(([sku, entry]) => [sku, entry.taxPercent]),
  );

  const baseRows = await mapWithConcurrency(
    operationalItems,
    5,
    async (item) => {
      const sku = getItemSku(item);
      const pricing = sku
        ? (pricingBySku.get(normalizeProductSku(sku)) ?? null)
        : null;
      return buildRowForItem(accessToken, userId, item, pricing, taxBySku);
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

export type FinancialEvaluationPeriodResult = {
  items: FinancialEvaluationRow[];
  from: string;
  to: string;
  salesCount: number;
  periodDays: number;
};

export async function loadFinancialEvaluationRowsForPeriod(
  accessToken: string,
  userId: number,
  fromYmd: string,
  toYmd: string,
): Promise<FinancialEvaluationPeriodResult> {
  const range = calendarYmdRangeToUtc(fromYmd, toYmd);
  if (!range) {
    throw new Error("Invalid date range");
  }

  const orders = await fetchPaidOrdersByPeriod(
    accessToken,
    userId,
    range.from,
    range.to,
  );
  const salesByItem = aggregatePeriodSalesByItem(orders);
  const itemIds = [...salesByItem.keys()];

  if (itemIds.length === 0) {
    return {
      items: [],
      from: range.dateFrom,
      to: range.dateTo,
      salesCount: 0,
      periodDays: range.periodDays,
    };
  }

  const siteId = siteIdFromItemId(itemIds[0]!) || "MLB";
  const [items, adsLoad] = await Promise.all([
    fetchItemsByIdsBatched(accessToken, itemIds),
    loadAdsMetricsByItem(accessToken, siteId, itemIds, {
      dateFrom: range.dateFrom,
      dateTo: range.dateTo,
    }),
  ]);

  const itemById = new Map(items.map((item) => [item.id, item]));
  const skus = items
    .map((item) => getItemSku(item))
    .filter((sku): sku is string => Boolean(sku));
  const [pricingBySku, taxFromReport] = await Promise.all([
    loadProductsMapBySku(skus),
    loadProductTaxFromLatestReport(userId),
  ]);
  const taxBySku = new Map(
    [...taxFromReport.bySku].map(([sku, entry]) => [sku, entry.taxPercent]),
  );

  const orderedAggs = itemIds
    .map((id) => {
      const agg = salesByItem.get(id);
      const item = itemById.get(id);
      if (!agg || !item) return null;
      return { agg, item };
    })
    .filter((row): row is { agg: PeriodSaleAgg; item: ItemBody } => row !== null);

  const baseRows = await mapWithConcurrency(orderedAggs, 5, async ({ agg, item }) => {
    const sku = getItemSku(item);
    const pricing = sku
      ? (pricingBySku.get(normalizeProductSku(sku)) ?? null)
      : null;
    return buildRowForPeriodItem(accessToken, userId, item, pricing, agg, taxBySku);
  });

  const rows = baseRows.map((row) => {
    const withAds = applyAdsToRow(
      row,
      adsLoad.map.get(row.mlItemId),
      adsLoad.available,
      range.periodDays,
    );
    if (!adsLoad.available) {
      withAds.warnings.push(
        "Métricas de Product Ads indisponíveis; margem pós ADS não calculada.",
      );
    }
    return withAds;
  });

  const sorted = rows.sort((a, b) => {
    const keyA = (a.sku ?? a.title ?? a.mlItemId).toLowerCase();
    const keyB = (b.sku ?? b.title ?? b.mlItemId).toLowerCase();
    return keyA.localeCompare(keyB, "pt-BR");
  });

  const salesCount = [...salesByItem.values()].reduce(
    (sum, agg) => sum + agg.quantity,
    0,
  );

  return {
    items: sorted,
    from: range.dateFrom,
    to: range.dateTo,
    salesCount,
    periodDays: range.periodDays,
  };
}
