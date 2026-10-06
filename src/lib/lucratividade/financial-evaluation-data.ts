import {
  computeFinancialMargin,
  computeMarginAfterAds,
  listingTypeLabelFromId,
  roundMoney,
  type FinancialMarginBreakdown,
  type MarginBasis,
  type MinSalePriceResult,
} from "@/lib/pricing/financial-margin";
import { prisma } from "@/lib/db/db";
import { calendarYmdRangeToUtc } from "@/lib/lucratividade/financial-evaluation-period";
import {
  fetchItemsByIdsBatched,
  fetchOperationalListingIds,
  fetchPaidOrdersByPeriod,
} from "@/lib/mercadolibre/api";
import { bestItemImageUrl } from "@/lib/mercadolibre/item-image";
import { buyerFacingItemPermalink } from "@/lib/mercadolibre/item-permalink";
import { getItemSku, isKitItem } from "@/lib/mercadolibre/item-sku";
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
  isProductAdsLookbackLimitError,
  isProductAdsMetricsRangeAvailable,
  PRODUCT_ADS_PERIOD_DAYS,
  type ItemAdMetrics,
} from "@/lib/mercadolibre/product-ads-metrics";
import { fetchSellerShippingCost } from "@/lib/mercadolibre/seller-shipping-cost";
import type { ItemBody } from "@/lib/mercadolibre/types";
import {
  getCompanySettings,
  loadProductsMapBySku,
  type CompanySettings,
} from "@/lib/products/product-data";
import { resolveEffectiveSkuByItemId } from "@/lib/products/product-resolver";
import {
  loadKitsByMlItemId,
  resolveKitPricing,
  type KitComponent,
} from "@/lib/products/kit-data";
import {
  normalizeProductSku,
  type ResolvedProductPricing,
} from "@/lib/pricing/product-pricing";
import {
  loadProductTaxFromLatestReport,
  type ProductTaxReportLookup,
} from "@/lib/products/product-tax-from-report";
import {
  aggregatePeriodSalesByItem,
  type PeriodSaleAgg,
} from "@/lib/lucratividade/period-sales-aggregate";
import { refineMinSalePriceForTargetMargin } from "@/lib/pricing/refine-min-sale-price";

export {
  calendarYmdRangeToUtc,
  parseFinancialEvaluationYmd,
} from "@/lib/lucratividade/financial-evaluation-period";

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
  /** Problemas que pedem ação do usuário (ex.: gasto em ADS sem venda). */
  warnings: string[];
  /** Informativos de "como foi calculado" — não pedem ação (ex.: frete
   * estimado no preço médio, TACOS 0% sem campanha). */
  notes?: string[];
  /** SKUs de componentes do kit sem cadastro em Meus produtos — com algum,
   * o custo do kit fica parcial e a margem, inflada. */
  kitMissingSkus?: string[];
  /** Só no modo período: unidades vendidas e faturamento bruto do anúncio
   * no intervalo (base da média ponderada). */
  periodUnitsSold?: number;
  periodRevenue?: number;
  minSalePriceForTarget?: MinSalePriceResult | null;
  minSalePriceTargetPercent?: number | null;
  minSalePriceMarginBasis?: MarginBasis | null;
  minSalePriceRefined?: boolean;
  /** true quando o anúncio é um kit do ML (com ou sem composição cadastrada). */
  isKit?: boolean;
  /** true quando custo/imposto vieram da composição de um kit cadastrado manualmente. */
  isKitComposition?: boolean;
  kitComponents?: KitComponent[] | null;
  /** Preço Mínimo Anunciável cadastrado para o SKU (null se não cadastrado). */
  pmaPrice: number | null;
  /** `true` enquanto salePrice/mlFeeAmount/shippingCost/mlFeeRebate/breakdown
   * (e a margem pós ADS, que depende de breakdown) ainda não vieram do
   * streaming — só usado no modo `stream=1` de `loadFinancialEvaluationRows`.
   * Ausente/`false` em qualquer outro caminho (linha já resolvida). */
  pending?: boolean;
};

async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T, index: number) => Promise<R>,
  onEach?: (result: R, index: number) => void,
  /** Abortado → para de agendar itens e rejeita (o client desistiu). */
  signal?: AbortSignal,
): Promise<R[]> {
  if (items.length === 0) return [];
  const results = new Array<R>(items.length);
  let nextIndex = 0;

  async function worker() {
    while (nextIndex < items.length) {
      signal?.throwIfAborted();
      const index = nextIndex;
      nextIndex += 1;
      const result = await fn(items[index], index);
      results[index] = result;
      onEach?.(result, index);
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
  const notes = [...(row.notes ?? [])];

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
      notes,
    };
  }

  if (!adMetrics) {
    notes.push("Sem Product Ads no período (TACOS considerado 0%).");
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
      notes,
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
    notes.push("Poucas vendas no período; TACOS pode variar bastante.");
  }
  if (adMetrics.status === "idle" && !row.isKit) {
    notes.push("Anúncio disponível para ADS, mas sem campanha ativa.");
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
    notes,
  };
}

type FastRowFields = Omit<
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
>;

/**
 * PMA indexado por identidade do anúncio (`mlItemId`, 1:1) com fallback por
 * texto de SKU — mesma convenção do custo (ver `indexProductPricingLookup` em
 * src/lib/products/product-data.ts). `Product.sku` não é único, então casar só
 * por SKU fazia o PMA de um anúncio vazar para todo anúncio que
 * compartilhasse o mesmo texto de SKU (inclusive componentes de kit).
 */
export type PmaLookup = {
  byMlItemId: Map<string, number>;
  bySku: Map<string, number>;
  /** Anúncios que têm cadastro próprio em Meus Produtos, com ou sem PMA. */
  linkedMlItemIds: Set<string>;
};

export function indexPmaLookup(
  products: { mlItemId: string; sku: string | null; pmaPrice: unknown }[],
): PmaLookup {
  const byMlItemId = new Map<string, number>();
  const bySku = new Map<string, number>();
  const linkedMlItemIds = new Set<string>();
  for (const product of products) {
    linkedMlItemIds.add(product.mlItemId);
    if (product.pmaPrice == null) continue;
    const pmaPrice = Number(product.pmaPrice);
    if (!Number.isFinite(pmaPrice)) continue;
    byMlItemId.set(product.mlItemId, pmaPrice);
    const sku = product.sku ? normalizeProductSku(product.sku) : null;
    // "primeiro que chega" vence no fallback por sku-texto, igual a todo
    // fallback por SKU do projeto.
    if (sku && !bySku.has(sku)) bySku.set(sku, pmaPrice);
  }
  return { byMlItemId, bySku, linkedMlItemIds };
}

export function resolvePmaPrice(
  lookup: PmaLookup | undefined,
  mlItemId: string,
  sku: string | null | undefined,
): number | null {
  if (!lookup) return null;
  const own = lookup.byMlItemId.get(mlItemId);
  if (own !== undefined) return own;
  // Anúncio com cadastro próprio e sem PMA não herda o PMA de um irmão de
  // mesmo texto de SKU — era assim que o selo "Abaixo do PMA" aparecia em
  // produto que não está no PMA. O fallback por SKU só vale para anúncio sem
  // vínculo nenhum (tem vendedor que nem SKU cadastra).
  if (lookup.linkedMlItemIds.has(mlItemId)) return null;
  return sku ? (lookup.bySku.get(normalizeProductSku(sku)) ?? null) : null;
}

/**
 * Só a parte síncrona de `buildRowForItem` (sem chamada ao ML) — usada pra
 * emitir uma pré-visualização imediata de cada linha no modo streaming
 * (`loadFinancialEvaluationRows({ onRow })`), antes de preço/taxa ML/
 * frete/rebate/margem resolverem (dependem de `fetchItemSalePrice` e afins).
 * Mantida separada de propósito — `buildRowForItem` fica intocada, pra não
 * arriscar a lógica financeira já validada.
 */
type KitContext = {
  pricingBySku: Map<string, ResolvedProductPricing>;
  kitsByMlItemId: Map<string, KitComponent[]>;
};

type RowCostResolution = {
  sku: string | null;
  productCost: number | null;
  extraCosts: number | null;
  taxRatePercent: number | null;
  isKitComposition: boolean;
  kitComponents: KitComponent[] | null;
  kitMissingSkus: string[];
};

/**
 * Custo, extras e alíquota de um anúncio — do cadastro vinculado (mlItemId →
 * SKU) ou, em kit sem SKU próprio, da composição cadastrada. Os avisos
 * acionáveis (sem SKU/custo/alíquota) são montados no client a partir desses
 * campos + regime (`src/lib/lucratividade/row-issues.ts`).
 */
function resolveRowCosts(
  item: ItemBody,
  pricing: ResolvedProductPricing | null,
  taxBySku: Map<string, number>,
  taxByMlItemId: Map<string, number>,
  kitContext: KitContext | undefined,
  effectiveSku: string | null | undefined,
): RowCostResolution {
  const sku = effectiveSku ?? getItemSku(item);
  const taxRatePercent =
    taxByMlItemId.get(item.id) ??
    (sku ? (taxBySku.get(normalizeProductSku(sku)) ?? null) : null);

  if (!sku && isKitItem(item) && kitContext) {
    const components = kitContext.kitsByMlItemId.get(item.id);
    if (components && components.length > 0) {
      const resolved = resolveKitPricing(
        components,
        kitContext.pricingBySku,
        taxBySku,
      );
      return {
        sku,
        productCost: resolved.productCost,
        extraCosts: resolved.extraCosts,
        taxRatePercent: resolved.taxRatePercent,
        isKitComposition: true,
        kitComponents: components,
        kitMissingSkus: resolved.missingSkus,
      };
    }
  }

  return {
    sku,
    productCost: pricing?.pricingCost ?? null,
    extraCosts: pricing?.extraCosts ?? null,
    taxRatePercent,
    isKitComposition: false,
    kitComponents: null,
    kitMissingSkus: [],
  };
}

function buildFastRowPreview(
  item: ItemBody,
  pricing: ResolvedProductPricing | null,
  taxBySku: Map<string, number>,
  taxByMlItemId: Map<string, number>,
  kitContext: KitContext | undefined,
  pmaLookup: PmaLookup | undefined,
  effectiveSku: string | null | undefined,
): FastRowFields {
  const costs = resolveRowCosts(
    item,
    pricing,
    taxBySku,
    taxByMlItemId,
    kitContext,
    effectiveSku,
  );

  return {
    mlItemId: item.id,
    title: item.title,
    sku: costs.sku,
    imageUrl: bestItemImageUrl(item) ?? null,
    permalink: buyerFacingItemPermalink(item.permalink, item.id),
    status: item.status,
    salePrice: item.price,
    regularPrice: null,
    hasPromotion: false,
    listingTypeId: item.listing_type_id ?? null,
    listingTypeLabel: listingTypeLabelFromId(item.listing_type_id),
    productCost: costs.productCost,
    extraCosts: costs.extraCosts,
    taxRatePercent: costs.taxRatePercent,
    mlFeeAmount: null,
    mlFeeRebate: null,
    mlFeeRebateOrderId: null,
    shippingCost: null,
    breakdown: null,
    errors: [],
    warnings: [],
    notes: [],
    isKit: isKitItem(item),
    isKitComposition: costs.isKitComposition,
    kitComponents: costs.kitComponents,
    kitMissingSkus: costs.kitMissingSkus,
    pmaPrice: resolvePmaPrice(pmaLookup, item.id, costs.sku),
    pending: true,
  };
}

async function buildRowForItem(
  accessToken: string,
  userId: number,
  item: ItemBody,
  pricing: ResolvedProductPricing | null,
  taxBySku: Map<string, number>,
  taxByMlItemId: Map<string, number>,
  kitContext?: KitContext,
  pmaLookup?: PmaLookup,
  /** SKU cadastrado no Product vinculado por mlItemId, quando existe — sobrepõe o SKU ao vivo do anúncio (ver src/lib/product-resolver.ts). */
  effectiveSku?: string | null,
): Promise<FastRowFields> {
  const errors: string[] = [];
  const warnings: string[] = [];
  const notes: string[] = [];

  const {
    sku,
    productCost,
    extraCosts,
    taxRatePercent,
    isKitComposition,
    kitComponents,
    kitMissingSkus,
  } = resolveRowCosts(
    item,
    pricing,
    taxBySku,
    taxByMlItemId,
    kitContext,
    effectiveSku,
  );

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
    notes.push(
      e instanceof Error
        ? `Preço promocional indisponível: ${e.message}`
        : "Preço promocional indisponível; usando preço do anúncio.",
    );
  }

  let mlFeeAmount: number | null = null;
  let listingTypeLabel = listingTypeLabelFromId(item.listing_type_id);

  async function loadFee(): Promise<void> {
    if (!item.category_id || !item.listing_type_id) {
      errors.push("Anúncio sem categoria ou tipo de listagem para calcular taxa.");
      return;
    }
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

  async function loadShipping(): Promise<void> {
    try {
      const shipping = await fetchSellerShippingCost(accessToken, {
        sellerId: userId,
        item,
        effectiveSalePrice: salePrice,
      });
      shippingCost = shipping.applicable ? shipping.cost : 0;
      if (!shipping.applicable) {
        notes.push("Frete grátis não aplicável ou indisponível (considerado 0).");
      }
    } catch (e) {
      errors.push(
        e instanceof Error ? e.message : "Falha ao consultar frete do vendedor.",
      );
    }
  }

  // fetchListingSaleFee e fetchSellerShippingCost só dependem do salePrice já resolvido
  // acima, não uma da outra — rodam em paralelo pra reduzir a latência por item.
  await Promise.all([loadFee(), loadShipping()]);

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
      notes.push(
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
          taxRatePercent,
          listingTypeLabel,
        })
      : null;

  return {
    mlItemId: item.id,
    title: item.title,
    sku,
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
    notes,
    isKit: isKitItem(item),
    isKitComposition,
    kitComponents,
    kitMissingSkus,
    pmaPrice: resolvePmaPrice(pmaLookup, item.id, sku),
  };
}

/** Por que a margem pós ADS não pôde ser calculada na página inteira. */
export type AdsUnavailableReason = "lookback_limit" | "api_error";

type AdsLoad = {
  map: Map<string, ItemAdMetrics>;
  available: boolean;
  unavailableReason: AdsUnavailableReason | null;
};

async function loadAdsMetricsByItem(
  accessToken: string,
  siteId: string,
  itemIds?: string[],
  dateRange?: { dateFrom: string; dateTo: string },
): Promise<AdsLoad> {
  const { dateFrom, dateTo } = dateRange ?? getProductAdsDateRange();
  // A API de Product Ads recusa `date_from` com mais de 90 dias — nem tenta.
  if (!isProductAdsMetricsRangeAvailable(dateFrom)) {
    return {
      map: new Map(),
      available: false,
      unavailableReason: "lookback_limit",
    };
  }
  try {
    const advertiserId = await fetchPadsAdvertiserId(accessToken, siteId);
    if (!advertiserId) {
      return { map: new Map(), available: true, unavailableReason: null };
    }

    const map = await fetchProductAdsMetricsByItem(accessToken, {
      advertiserId,
      siteId,
      dateFrom,
      dateTo,
      itemIds,
    });
    return { map, available: true, unavailableReason: null };
  } catch (e) {
    return {
      map: new Map(),
      available: false,
      unavailableReason: isProductAdsLookbackLimitError(e)
        ? "lookback_limit"
        : "api_error",
    };
  }
}

async function buildRowForPeriodItem(
  accessToken: string,
  userId: number,
  item: ItemBody,
  pricing: ResolvedProductPricing | null,
  agg: PeriodSaleAgg,
  taxBySku: Map<string, number>,
  taxByMlItemId: Map<string, number>,
  kitContext?: KitContext,
  pmaLookup?: PmaLookup,
  /** SKU cadastrado no Product vinculado por mlItemId, quando existe — sobrepõe o SKU ao vivo do anúncio (ver src/lib/product-resolver.ts). */
  effectiveSku?: string | null,
): Promise<FastRowFields> {
  const errors: string[] = [];
  const warnings: string[] = [];
  const notes: string[] = [];

  const {
    sku,
    productCost,
    extraCosts,
    taxRatePercent,
    isKitComposition,
    kitComponents,
    kitMissingSkus,
  } = resolveRowCosts(
    item,
    pricing,
    taxBySku,
    taxByMlItemId,
    kitContext,
    effectiveSku,
  );

  const salePrice =
    agg.quantity > 0 ? roundMoney(agg.revenue / agg.quantity) : 0;
  const currencyId = item.currency_id ?? null;

  notes.push(
    `Preço médio de ${agg.quantity} un. vendidas no período (custos/impostos do cadastro atual).`,
  );

  let mlFeeAmount: number | null = null;
  let listingTypeLabel = listingTypeLabelFromId(item.listing_type_id);
  let usedOrderFee = false;

  async function loadFee(): Promise<void> {
    if (agg.saleFeeKnownQty > 0) {
      mlFeeAmount = roundMoney(agg.saleFeeSum / agg.saleFeeKnownQty);
      usedOrderFee = true;
      notes.push("Taxa ML média das vendas do período.");
      return;
    }
    if (!item.category_id || !item.listing_type_id) {
      errors.push("Anúncio sem categoria ou tipo de listagem para calcular taxa.");
      return;
    }
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
      notes.push(
        "Taxa ML estimada no preço médio (pedido sem sale_fee).",
      );
    } catch (e) {
      errors.push(
        e instanceof Error ? e.message : "Falha ao consultar taxa ML.",
      );
    }
  }

  let shippingCost: number | null = null;

  async function loadShipping(): Promise<void> {
    try {
      const shipping = await fetchSellerShippingCost(accessToken, {
        sellerId: userId,
        item,
        effectiveSalePrice: salePrice,
      });
      shippingCost = shipping.applicable ? shipping.cost : 0;
      if (!shipping.applicable) {
        notes.push("Frete grátis não aplicável ou indisponível (considerado 0).");
      } else {
        notes.push("Frete estimado no preço médio do período.");
      }
    } catch (e) {
      errors.push(
        e instanceof Error ? e.message : "Falha ao consultar frete do vendedor.",
      );
    }
  }

  // fetchListingSaleFee (quando necessário) e fetchSellerShippingCost não dependem
  // uma da outra — rodam em paralelo pra reduzir a latência por item.
  await Promise.all([loadFee(), loadShipping()]);

  if (usedOrderFee && item.listing_type_id) {
    listingTypeLabel = listingTypeLabelFromId(item.listing_type_id);
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
          taxRatePercent,
          listingTypeLabel,
        })
      : null;

  return {
    mlItemId: item.id,
    title: item.title,
    sku,
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
    notes,
    isKit: isKitItem(item),
    isKitComposition,
    kitComponents,
    kitMissingSkus,
    pmaPrice: resolvePmaPrice(pmaLookup, item.id, sku),
    periodUnitsSold: agg.quantity,
    periodRevenue: roundMoney(agg.revenue),
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

/**
 * Alíquota por anúncio/SKU conforme o regime: no Simples é a alíquota efetiva
 * única da empresa (vale também pra anúncio sem SKU); fora dele, o % apurado
 * no relatório tributário (último mês fechado, com fallback).
 */
function buildTaxLookups(
  companySettings: CompanySettings,
  taxFromReport: ProductTaxReportLookup,
  skus: string[],
  itemIds: string[],
): { taxBySku: Map<string, number>; taxByMlItemId: Map<string, number> } {
  if (companySettings.taxRegime === "SIMPLES") {
    const rate = companySettings.simplesAliquotaEfetivaPercent;
    if (rate == null) {
      return { taxBySku: new Map(), taxByMlItemId: new Map() };
    }
    return {
      taxBySku: new Map(skus.map((sku) => [normalizeProductSku(sku), rate])),
      taxByMlItemId: new Map(itemIds.map((id) => [id, rate])),
    };
  }
  return {
    taxBySku: new Map(
      [...taxFromReport.bySku].map(([sku, entry]) => [sku, entry.taxPercent]),
    ),
    taxByMlItemId: new Map(
      [...taxFromReport.byMlItemId].map(([mlItemId, entry]) => [
        mlItemId,
        entry.taxPercent,
      ]),
    ),
  };
}

/** Custo/imposto/PMA de um conjunto de anúncios já buscados no ML. */
async function loadRowContext(
  userId: number,
  organizationId: string,
  items: ItemBody[],
) {
  // SKU "efetivo" por anúncio: segue o cadastro do Product vinculado via
  // mlItemId quando existe (estável mesmo se o SKU mudar no anúncio ML);
  // cai pro SKU ao vivo do anúncio quando não há vínculo.
  const effectiveSkuByItemId = await resolveEffectiveSkuByItemId(
    organizationId,
    items.map((item) => ({ id: item.id, sku: getItemSku(item) })),
  );

  const kitItemIds = items
    .filter((item) => !getItemSku(item) && isKitItem(item))
    .map((item) => item.id);
  const kitsByMlItemId = await loadKitsByMlItemId(organizationId, kitItemIds);
  const kitComponentSkus = [...kitsByMlItemId.values()].flatMap((components) =>
    components.map((c) => c.sku),
  );

  const itemIds = items.map((item) => item.id);
  const skus = [...effectiveSkuByItemId.values()]
    .filter((sku): sku is string => Boolean(sku))
    .concat(kitComponentSkus);
  const [pricingLookup, taxFromReport, productsForPma, companySettings] =
    await Promise.all([
      loadProductsMapBySku(organizationId, skus, itemIds),
      loadProductTaxFromLatestReport(userId),
      prisma.product.findMany({
        where: {
          organizationId,
          OR: [{ mlItemId: { in: itemIds } }, { sku: { in: skus } }],
        },
        select: { mlItemId: true, sku: true, pmaPrice: true },
      }),
      getCompanySettings(organizationId),
    ]);
  const { byMlItemId: pricingByMlItemId, bySku: pricingBySku } = pricingLookup;
  const { taxBySku, taxByMlItemId } = buildTaxLookups(
    companySettings,
    taxFromReport,
    skus,
    itemIds,
  );
  const kitContext: KitContext = { pricingBySku, kitsByMlItemId };

  return {
    taxBySku,
    taxByMlItemId,
    kitContext,
    pmaLookup: indexPmaLookup(productsForPma),
    skuFor: (itemId: string) => effectiveSkuByItemId.get(itemId) ?? null,
    pricingFor: (itemId: string, sku: string | null) =>
      pricingByMlItemId.get(itemId) ??
      (sku ? (pricingBySku.get(normalizeProductSku(sku)) ?? null) : null),
  };
}

function sortRowsByProduct(rows: FinancialEvaluationRow[]) {
  return rows.sort((a, b) => {
    const keyA = (a.sku ?? a.title ?? a.mlItemId).toLowerCase();
    const keyB = (b.sku ?? b.title ?? b.mlItemId).toLowerCase();
    return keyA.localeCompare(keyB, "pt-BR");
  });
}

/** Fatos da página inteira, emitidos antes das linhas no streaming. */
export type FinancialEvaluationMeta = {
  /** Anúncios que vão chegar (linhas). */
  listingCount: number;
  adsAvailable: boolean;
  adsUnavailableReason: AdsUnavailableReason | null;
  /** Só período: vendas de anúncios que o ML não devolveu mais (excluídos/
   * inacessíveis) — somem da tabela, mas são reportadas pra fechar a conta. */
  droppedListings?: { count: number; units: number; revenue: number };
};

export type FinancialEvaluationProgress = {
  stage: "orders";
  fetched: number;
  total: number | null;
};

type LoadStreamOptions = {
  /** Chamado a cada linha pronta (com ADS já aplicado), pra permitir streaming incremental. */
  onRow?: (row: FinancialEvaluationRow) => void;
  onMeta?: (meta: FinancialEvaluationMeta) => void;
  onProgress?: (progress: FinancialEvaluationProgress) => void;
  signal?: AbortSignal;
};

export async function loadFinancialEvaluationRows(
  accessToken: string,
  userId: number,
  organizationId: string,
  options?: LoadStreamOptions & {
    itemIds?: string[];
    targetMarginPercent?: number;
    marginBasis?: MarginBasis;
  },
): Promise<FinancialEvaluationRow[]> {
  const signal = options?.signal;
  const listingIds =
    options?.itemIds && options.itemIds.length > 0
      ? [...new Set(options.itemIds)]
      : await fetchOperationalListingIds(accessToken, userId, organizationId);

  if (listingIds.length === 0) {
    options?.onMeta?.({
      listingCount: 0,
      adsAvailable: true,
      adsUnavailableReason: null,
    });
    return [];
  }

  const siteId = listingIds[0]
    ? siteIdFromItemId(listingIds[0])
    : "MLB";

  const [items, adsLoad] = await Promise.all([
    fetchItemsByIdsBatched(accessToken, listingIds),
    loadAdsMetricsByItem(accessToken, siteId, listingIds),
  ]);
  signal?.throwIfAborted();

  const operationalItems = items.filter((item) =>
    isOperationalStatus(item.status),
  );
  const ctx = await loadRowContext(userId, organizationId, operationalItems);
  signal?.throwIfAborted();

  options?.onMeta?.({
    listingCount: operationalItems.length,
    adsAvailable: adsLoad.available,
    adsUnavailableReason: adsLoad.unavailableReason,
  });

  // Modo streaming: emite uma pré-visualização de TODAS as linhas na hora
  // (título/imagem/custo/PMA já disponíveis, sem chamada ao ML) — antes do
  // preço/taxa/frete/rebate/margem, que só resolvem no loop lento abaixo.
  // O client desborra cada linha individualmente quando o `onRow` final
  // (com `pending` ausente) daquele item chegar.
  if (options?.onRow) {
    for (const item of operationalItems) {
      const sku = ctx.skuFor(item.id);
      const preview = buildFastRowPreview(
        item,
        ctx.pricingFor(item.id, sku),
        ctx.taxBySku,
        ctx.taxByMlItemId,
        ctx.kitContext,
        ctx.pmaLookup,
        sku,
      );
      options.onRow(
        applyAdsToRow(preview, adsLoad.map.get(item.id), adsLoad.available),
      );
    }
  }

  const baseRows = await mapWithConcurrency(
    operationalItems,
    5,
    async (item) => {
      const sku = ctx.skuFor(item.id);
      return buildRowForItem(
        accessToken,
        userId,
        item,
        ctx.pricingFor(item.id, sku),
        ctx.taxBySku,
        ctx.taxByMlItemId,
        ctx.kitContext,
        ctx.pmaLookup,
        sku,
      );
    },
    options?.onRow
      ? (row) => {
          options.onRow!(
            applyAdsToRow(
              row,
              adsLoad.map.get(row.mlItemId),
              adsLoad.available,
            ),
          );
        }
      : undefined,
    signal,
  );

  const rows = baseRows.map((row) =>
    applyAdsToRow(row, adsLoad.map.get(row.mlItemId), adsLoad.available),
  );

  const itemById = new Map(operationalItems.map((item) => [item.id, item]));

  const targetMarginPercent = options?.targetMarginPercent;
  const marginBasis = options?.marginBasis ?? "contribution";
  const shouldRefineMinPrice =
    targetMarginPercent !== undefined &&
    Number.isFinite(targetMarginPercent) &&
    targetMarginPercent >= 0 &&
    targetMarginPercent <= 100;

  const rowsWithMinPrice = shouldRefineMinPrice
    ? await mapWithConcurrency(
        rows,
        3,
        async (row) => {
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
        },
        undefined,
        signal,
      )
    : rows;

  return sortRowsByProduct(rowsWithMinPrice);
}

export type FinancialEvaluationPeriodResult = {
  items: FinancialEvaluationRow[];
  from: string;
  to: string;
  salesCount: number;
  periodDays: number;
  meta: FinancialEvaluationMeta;
};

export async function loadFinancialEvaluationRowsForPeriod(
  accessToken: string,
  userId: number,
  organizationId: string,
  fromYmd: string,
  toYmd: string,
  options?: LoadStreamOptions,
): Promise<FinancialEvaluationPeriodResult> {
  const signal = options?.signal;
  const range = calendarYmdRangeToUtc(fromYmd, toYmd);
  if (!range) {
    throw new Error("Invalid date range");
  }

  const orders = await fetchPaidOrdersByPeriod(
    accessToken,
    userId,
    range.from,
    range.to,
    undefined,
    {
      signal,
      onPage: options?.onProgress
        ? ({ fetched, total }) =>
            options.onProgress!({ stage: "orders", fetched, total })
        : undefined,
    },
  );
  const salesByItem = aggregatePeriodSalesByItem(orders);
  const itemIds = [...salesByItem.keys()];
  const salesCount = [...salesByItem.values()].reduce(
    (sum, agg) => sum + agg.quantity,
    0,
  );

  if (itemIds.length === 0) {
    const meta: FinancialEvaluationMeta = {
      listingCount: 0,
      adsAvailable: true,
      adsUnavailableReason: null,
      droppedListings: { count: 0, units: 0, revenue: 0 },
    };
    options?.onMeta?.(meta);
    return {
      items: [],
      from: range.dateFrom,
      to: range.dateTo,
      salesCount: 0,
      periodDays: range.periodDays,
      meta,
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
  signal?.throwIfAborted();

  const itemById = new Map(items.map((item) => [item.id, item]));
  const ctx = await loadRowContext(userId, organizationId, items);
  signal?.throwIfAborted();

  const orderedAggs: Array<{ agg: PeriodSaleAgg; item: ItemBody }> = [];
  const dropped = { count: 0, units: 0, revenue: 0 };
  for (const id of itemIds) {
    const agg = salesByItem.get(id);
    if (!agg) continue;
    const item = itemById.get(id);
    if (!item) {
      dropped.count += 1;
      dropped.units += agg.quantity;
      dropped.revenue = roundMoney(dropped.revenue + agg.revenue);
      continue;
    }
    orderedAggs.push({ agg, item });
  }

  const meta: FinancialEvaluationMeta = {
    listingCount: orderedAggs.length,
    adsAvailable: adsLoad.available,
    adsUnavailableReason: adsLoad.unavailableReason,
    droppedListings: dropped,
  };
  options?.onMeta?.(meta);

  const withAds = (row: FastRowFields) =>
    applyAdsToRow(
      row,
      adsLoad.map.get(row.mlItemId),
      adsLoad.available,
      range.periodDays,
    );

  const baseRows = await mapWithConcurrency(
    orderedAggs,
    5,
    async ({ agg, item }) => {
      const sku = ctx.skuFor(item.id);
      return buildRowForPeriodItem(
        accessToken,
        userId,
        item,
        ctx.pricingFor(item.id, sku),
        agg,
        ctx.taxBySku,
        ctx.taxByMlItemId,
        ctx.kitContext,
        ctx.pmaLookup,
        sku,
      );
    },
    options?.onRow ? (row) => options.onRow!(withAds(row)) : undefined,
    signal,
  );

  return {
    items: sortRowsByProduct(baseRows.map(withAds)),
    from: range.dateFrom,
    to: range.dateTo,
    salesCount,
    periodDays: range.periodDays,
    meta,
  };
}
