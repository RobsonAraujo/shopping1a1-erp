import { stockPlanningConfig } from "@/config/stock-planning";
import { reportsConfig } from "@/config/reports";
import { prisma } from "@/lib/db/db";
import { logServerError } from "@/lib/infra/server-public-error";
import {
  applyManualLineEdit,
  applyRestoreLineFromSync,
  breakdownIdentityKey,
  computeDreTotals,
  isDreEditableLineKey,
  mergeLineBreakdowns,
  mergeProductCostBreakdowns,
  mergeSyncedSnapshot,
  productCostAuditKey,
  type DreCancelledIncludeOverlay,
  type DreEditableLineKey,
  type DreKeptFromPrevious,
  type DreLineAuditMismatch,
  type DreLineBreakdownItem,
  type DreMonthReconciliation,
  type DreMonthSnapshotPayload,
  type DreProductCostBreakdownItem,
  type DreTaxBreakdownItem,
  type DreTaxRateSource,
  type DreTaxSource,
  type MergeSyncedSnapshotOptions,
} from "@/lib/dre/dre-calculations";
import { checkLineAuditConsistency } from "@/lib/dre/dre-line-audit";
import {
  buildDreTaxSource,
  computeDreSalesTax,
  taxLinesFromBreakdown,
  type DreTaxLine,
  type DreTaxLineKind,
  type DreTaxRates,
} from "@/lib/dre/dre-sales-tax";
import { loadDreTaxRates } from "@/lib/dre/dre-sales-tax-data";
import { loadProductsMapBySku } from "@/lib/products/product-data";
import { resolveEffectiveSkuByItemId } from "@/lib/products/product-resolver";
import { roundMoney } from "@/lib/pricing/financial-margin";
import { getItemSku, isKitItem } from "@/lib/mercadolibre/item-sku";
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
  applyLevelingsForOrderDate,
  loadLevelingsOverlappingMonth,
  resolveLevelingCostForOrderDate,
  type DreProductCostLevelingPricing,
} from "@/lib/dre/dre-product-cost-leveling";
import {
  fetchCancelledOrderLinesInDateRange,
  fetchPaidOrdersByPeriod,
  fetchItemsByIdsBatched,
  paidOrderLinesFromOrders,
  splitOrderLinesByCancelledOrderIds,
  returnedPaidOrderIdsFromOrders,
  orderIdentityKeys,
  type PaidOrderLine,
} from "@/lib/mercadolibre/api";
import type { ItemBody } from "@/lib/mercadolibre/types";
import type { TaxReportPayload } from "@/lib/tax-report/types";
import {
  fetchMlBillingSummaryForMonth,
  isBillingSummaryEmpty,
} from "@/lib/mercadolibre/billing-summary";
import { billingPeriodKey } from "@/lib/mercadolibre/billing-shared";
import { aggregateBillingDetailsForCivilMonthOrders, type MlDetailsAggregation } from "@/lib/mercadolibre/billing-details";
import {
  createFullBillingDetailsCache,
  type FullBillingDetailsCache,
} from "@/lib/mercadolibre/billing-full-collect";
import { listFullShipmentsForPeriod, importFullCollectChargesFromBilling } from "@/lib/envios-full/full-shipment-data";
import {
  fetchListingSaleFee,
  siteIdFromItemId,
} from "@/lib/mercadolibre/listing-fees";
import {
  fetchPadsAdvertiserId,
  fetchProductAdsMetricsByItem,
  getProductAdsDateRangeForMonth,
  isProductAdsLookbackLimitError,
  isProductAdsMetricsRangeAvailable,
} from "@/lib/mercadolibre/product-ads-metrics";
import {
  formatCalendarRangeYmd,
  getCalendarMonthRange,
  isCurrentCalendarMonth,
  isMlBillingPeriodCivilMonth,
  type CalendarDateRange,
} from "@/lib/mercadolibre/revenue-periods";
import { fetchSellerShippingCost } from "@/lib/mercadolibre/seller-shipping-cost";
import { mapWithConcurrency } from "@/lib/mercadolibre/concurrency";

const FALLBACK_ML_COST_CONCURRENCY = 8;

export type DreSyncProgressPhase =
  | "billing"
  | "orders"
  | "ads"
  | "erp"
  | "ml_costs"
  | "full"
  | "cancelled"
  | "persist"
  | "done";

export type DreSyncProgress = {
  phase: DreSyncProgressPhase;
  message: string;
};

export type BuildDreMonthSnapshotOptions = {
  onProgress?: (progress: DreSyncProgress) => void;
  fullDetailsCache?: FullBillingDetailsCache;
};

/**
 * Busca anúncios no ML uma vez por sync. Antes o mesmo anúncio era pedido até
 * 3× (custo dos pedidos pagos, dos cancelados e estimativa de tarifas).
 */
async function fetchItemsWithCache(
  accessToken: string,
  ids: readonly string[],
  cache: Map<string, ItemBody>,
): Promise<ItemBody[]> {
  const unique = [...new Set(ids.filter(Boolean))];
  const missing = unique.filter((id) => !cache.has(id));
  if (missing.length > 0) {
    const fetched = await fetchItemsByIdsBatched(accessToken, missing);
    for (const item of fetched) cache.set(item.id, item);
  }
  return unique
    .map((id) => cache.get(id))
    .filter((item): item is ItemBody => item !== undefined);
}

/**
 * Tudo que custo e imposto das linhas de pedido precisam — carregado uma vez
 * por sync para pedidos pagos, cancelados e devolvidos juntos.
 */
type ErpCostContext = {
  itemById: Map<string, ItemBody>;
  skuByItemId: Map<string, string | null>;
  kitsByMlItemId: Map<string, KitComponent[]>;
  pricingByMlItemIdBase: Map<string, ResolvedProductPricing>;
  pricingBySkuBase: Map<string, ResolvedProductPricing>;
  levelings: DreProductCostLevelingPricing[];
  taxRates: DreTaxRates;
  /** % por SKU — componente de kit só tem SKU. */
  kitTaxRateBySku: Map<string, number>;
};

async function loadErpCostContext(input: {
  accessToken: string;
  sellerId: number;
  organizationId: string;
  itemIds: readonly string[];
  year: number;
  month: number;
  itemCache: Map<string, ItemBody>;
}): Promise<ErpCostContext> {
  const { accessToken, sellerId, organizationId, year, month } = input;
  const itemIds = [...new Set(input.itemIds)];
  const items = await fetchItemsWithCache(accessToken, itemIds, input.itemCache);
  const itemById = new Map(items.map((item) => [item.id, item]));
  // SKU "efetivo": segue o cadastro do Product vinculado ao anúncio via
  // mlItemId quando existe (estável mesmo se o SKU mudar no anúncio ML);
  // cai para o SKU ao vivo do anúncio quando não há vínculo ainda.
  const skuByItemId = await resolveEffectiveSkuByItemId(
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
  const skus = [...skuByItemId.values()]
    .filter((sku): sku is string => Boolean(sku))
    .map((sku) => normalizeProductSku(sku))
    .concat(kitComponentSkus);
  const [pricingLookup, taxRates, levelings] = await Promise.all([
    loadProductsMapBySku(organizationId, skus, itemIds),
    loadDreTaxRates(organizationId, sellerId, year, month),
    loadLevelingsOverlappingMonth(organizationId, year, month),
  ]);
  return {
    itemById,
    skuByItemId,
    kitsByMlItemId,
    pricingByMlItemIdBase: pricingLookup.byMlItemId,
    pricingBySkuBase: pricingLookup.bySku,
    levelings,
    taxRates,
    kitTaxRateBySku: new Map(
      [...taxRates.bySku].map(([sku, entry]) => [sku, entry.ratePercent]),
    ),
  };
}

type ErpLineCosts = {
  /** Soma positiva do custo das linhas com custo conhecido. */
  productCost: number;
  /** Anúncios sem custo cadastrado (nem nivelamento, nem kit completo). */
  incompleteItemIds: Set<string>;
  breakdown: DreProductCostBreakdownItem[];
  revenueBreakdown: DreLineBreakdownItem[];
  /** Entrada do imposto: uma por linha, com ou sem custo cadastrado. */
  taxLines: DreTaxLine[];
};

/**
 * Custo produto (cadastro, nivelamento ou kit) e as linhas do imposto de um
 * grupo de pedidos. O imposto não depende de custo: antes, anúncio sem custo
 * cadastrado ficava com imposto 0 mesmo tendo % no relatório tributário.
 */
function computeErpCostsForLines(
  context: ErpCostContext,
  orderLines: readonly PaidOrderLine[],
  kind: DreTaxLineKind,
  year: number,
  month: number,
): ErpLineCosts {
  const {
    itemById,
    skuByItemId,
    kitsByMlItemId,
    pricingByMlItemIdBase,
    pricingBySkuBase,
    levelings,
    kitTaxRateBySku,
  } = context;

  let productCost = 0;
  const incompleteItemIds = new Set<string>();
  const breakdownByKey = new Map<string, DreProductCostBreakdownItem>();
  const revenueBreakdownByKey = new Map<string, DreLineBreakdownItem>();
  const taxLines: DreTaxLine[] = [];

  function addToRevenueBreakdown(
    key: string,
    sku: string | null,
    title: string,
    quantity: number,
    amount: number,
  ) {
    const existing = revenueBreakdownByKey.get(key);
    if (existing) {
      existing.quantity = (existing.quantity ?? 0) + quantity;
      existing.amount = roundMoney(existing.amount + amount);
      return;
    }
    revenueBreakdownByKey.set(key, {
      key,
      sku,
      title,
      quantity,
      amount: roundMoney(amount),
    });
  }

  function addToBreakdown(
    baseKey: string,
    sku: string | null,
    title: string,
    quantity: number,
    cost: number,
    missingCost: boolean,
    leveled = false,
  ) {
    const key = productCostAuditKey(baseKey, leveled);
    const existing = breakdownByKey.get(key);
    if (existing) {
      existing.quantity += quantity;
      existing.totalCost = roundMoney(existing.totalCost + cost);
      existing.unitCost =
        existing.quantity > 0
          ? roundMoney(existing.totalCost / existing.quantity)
          : 0;
      existing.missingCost = existing.missingCost || missingCost;
      existing.leveled = leveled || undefined;
      return;
    }
    breakdownByKey.set(key, {
      key,
      sku,
      title,
      quantity,
      unitCost: quantity > 0 ? roundMoney(cost / quantity) : 0,
      totalCost: roundMoney(cost),
      missingCost,
      leveled: leveled || undefined,
    });
  }

  for (const line of orderLines) {
    const sku = skuByItemId.get(line.itemId);
    const normalizedSku = sku ? normalizeProductSku(sku) : "";
    const { pricing: pricingBySku, leveledSkus } = applyLevelingsForOrderDate(
      pricingBySkuBase,
      levelings,
      line.orderDateYmd ?? null,
      year,
      month,
    );
    // Preferir a base resolvida por identidade (mlItemId) — sku-texto não é
    // mais único, `pricingBySku` (por sku) só serve de fallback pra linha
    // sem Product resolvido e de base pro componente de kit (que só tem
    // sku). O nivelamento também casa por identidade: `Product.sku` é
    // ressincronizado com o anúncio, então comparar com o texto congelado em
    // DreProductCostLeveling.sku fazia o nivelamento sumir sem aviso quando o
    // vendedor trocava o SKU no ML.
    const pricingBaseForItem = pricingByMlItemIdBase.get(line.itemId);
    const leveledCostForItem = resolveLevelingCostForOrderDate(
      levelings,
      line.itemId,
      normalizedSku,
      line.orderDateYmd ?? null,
      year,
      month,
    );
    const isLeveledForItem = leveledCostForItem !== null;
    const pricing: ResolvedProductPricing | undefined = isLeveledForItem
      ? {
          ...(pricingBaseForItem ?? { taxPercent: 0, extraCosts: 0 }),
          pricingCost: leveledCostForItem,
        }
      : (pricingBaseForItem ??
        (normalizedSku ? pricingBySkuBase.get(normalizedSku) : undefined));
    const item = itemById.get(line.itemId);
    const title = item?.title ?? line.itemId;
    const identityKey = breakdownIdentityKey(line.itemId, sku ?? null);
    const taxLineBase = {
      itemId: line.itemId,
      sku: sku ?? null,
      title,
      quantity: line.quantity,
      revenue: line.revenue,
      kind,
    };

    addToRevenueBreakdown(
      identityKey,
      sku ?? null,
      title,
      line.quantity,
      line.revenue,
    );

    if (pricing) {
      const cost = line.quantity * pricing.pricingCost;
      productCost += cost;
      addToBreakdown(
        identityKey,
        sku ?? null,
        title,
        line.quantity,
        cost,
        false,
        isLeveledForItem,
      );
      taxLines.push({ ...taxLineBase, key: identityKey });
      continue;
    }

    const kitComponents = item ? kitsByMlItemId.get(item.id) : undefined;
    if (!normalizedSku && item && isKitItem(item) && kitComponents) {
      const resolved = resolveKitPricing(
        kitComponents,
        pricingBySku,
        kitTaxRateBySku,
      );
      // O % do kit vem primeiro do próprio anúncio no relatório tributário;
      // a média dos componentes só entra quando o kit não tem % próprio.
      taxLines.push({
        ...taxLineBase,
        key: `kit:${item.id}`,
        sku: null,
        kitComponentsRatePercent: resolved.taxRatePercent,
      });
      if (resolved.missingSkus.length === 0) {
        const cost = line.quantity * resolved.productCost;
        productCost += cost;
        const kitLeveled = kitComponents.some((c) =>
          leveledSkus.has(normalizeProductSku(c.sku)),
        );
        addToBreakdown(
          `kit:${item.id}`,
          null,
          title,
          line.quantity,
          cost,
          false,
          kitLeveled,
        );
        continue;
      }
    } else {
      taxLines.push({ ...taxLineBase, key: identityKey });
    }

    addToBreakdown(
      `missing:${line.itemId}`,
      sku ?? null,
      title,
      line.quantity,
      0,
      true,
    );
    incompleteItemIds.add(line.itemId);
  }

  return {
    productCost,
    incompleteItemIds,
    breakdown: [...breakdownByKey.values()].sort(
      (a, b) => b.totalCost - a.totalCost,
    ),
    revenueBreakdown: [...revenueBreakdownByKey.values()].sort(
      (a, b) => b.amount - a.amount,
    ),
    taxLines,
  };
}

/**
 * Tarifa e frete estimados pelos pedidos quando a fatura não serve. Canceladas
 * não sai daqui: a linha vem dos mesmos pedidos que a auditoria lista (ver
 * `buildDreMonthSnapshot`) — antes era uma segunda busca no ML, e quando só uma
 * das duas voltava vazia a linha zerava com a auditoria cheia.
 */
async function estimateMlCostsFallback(
  accessToken: string,
  sellerId: number,
  organizationId: string,
  orderLines: Array<{ itemId: string; quantity: number; revenue: number }>,
  itemCache: Map<string, ItemBody>,
): Promise<{
  saleFeeMl: number;
  sellerShippingMl: number;
  partialReturnsMl: number;
  fullShippingMl: number;
  fullStorageMl: number;
  fullNonComplianceMl: number;
  saleFeeBreakdown: DreLineBreakdownItem[];
  sellerShippingBreakdown: DreLineBreakdownItem[];
}> {
  const itemIds = [...new Set(orderLines.map((line) => line.itemId))];
  const items = await fetchItemsWithCache(accessToken, itemIds, itemCache);
  const itemById = new Map(items.map((item) => [item.id, item]));
  const skuByItemId = await resolveEffectiveSkuByItemId(
    organizationId,
    items.map((item) => ({ id: item.id, sku: getItemSku(item) })),
  );

  const feeCache = new Map<string, number>();
  const shippingCache = new Map<string, number>();
  const feeInflight = new Map<string, Promise<number>>();
  const shippingInflight = new Map<string, Promise<number>>();

  async function resolveUnitFee(
    line: { itemId: string; quantity: number; revenue: number },
  ): Promise<number> {
    const item = itemById.get(line.itemId);
    if (!item || line.quantity <= 0) return 0;
    const unitPrice =
      line.quantity > 0 ? line.revenue / line.quantity : item.price;
    const feeKey = `${line.itemId}:${roundMoney(unitPrice)}`;
    const cached = feeCache.get(feeKey);
    if (cached !== undefined) return cached;
    const inflight = feeInflight.get(feeKey);
    if (inflight) return inflight;

    const promise = (async () => {
      let unitFee = 0;
      if (item.category_id && item.listing_type_id) {
        try {
          const fee = await fetchListingSaleFee(accessToken, {
            siteId: siteIdFromItemId(line.itemId),
            price: unitPrice,
            categoryId: item.category_id,
            listingTypeId: item.listing_type_id,
            currencyId: item.currency_id,
            logisticType: item.shipping?.logistic_type,
            shippingMode: item.shipping?.mode,
          });
          unitFee = fee.feeAmount;
        } catch {
          unitFee = 0;
        }
      }
      feeCache.set(feeKey, unitFee);
      feeInflight.delete(feeKey);
      return unitFee;
    })();
    feeInflight.set(feeKey, promise);
    return promise;
  }

  async function resolveUnitShip(
    line: { itemId: string; quantity: number; revenue: number },
  ): Promise<number> {
    const item = itemById.get(line.itemId);
    if (!item || line.quantity <= 0) return 0;
    const shipKey = line.itemId;
    const cached = shippingCache.get(shipKey);
    if (cached !== undefined) return cached;
    const inflight = shippingInflight.get(shipKey);
    if (inflight) return inflight;

    const unitPrice =
      line.quantity > 0 ? line.revenue / line.quantity : item.price;
    const promise = (async () => {
      let unitShip = 0;
      try {
        const shipping = await fetchSellerShippingCost(accessToken, {
          sellerId,
          item,
          effectiveSalePrice: unitPrice,
        });
        unitShip = shipping.applicable ? shipping.cost : 0;
      } catch {
        unitShip = 0;
      }
      shippingCache.set(shipKey, unitShip);
      shippingInflight.delete(shipKey);
      return unitShip;
    })();
    shippingInflight.set(shipKey, promise);
    return promise;
  }

  const lineCosts = await mapWithConcurrency(
    orderLines,
    FALLBACK_ML_COST_CONCURRENCY,
    async (line) => {
      const [unitFee, unitShip] = await Promise.all([
        resolveUnitFee(line),
        resolveUnitShip(line),
      ]);
      return {
        line,
        feeAmount: unitFee * line.quantity,
        shipAmount: unitShip * line.quantity,
      };
    },
  );

  let saleFeeTotal = 0;
  let shippingTotal = 0;
  const saleFeeBreakdownByKey = new Map<string, DreLineBreakdownItem>();
  const sellerShippingBreakdownByKey = new Map<string, DreLineBreakdownItem>();

  function addToLineBreakdown(
    map: Map<string, DreLineBreakdownItem>,
    key: string,
    sku: string | null,
    title: string,
    quantity: number,
    amount: number,
  ) {
    const existing = map.get(key);
    if (existing) {
      existing.quantity = (existing.quantity ?? 0) + quantity;
      existing.amount = roundMoney(existing.amount + amount);
      return;
    }
    map.set(key, { key, sku, title, quantity, amount: roundMoney(amount) });
  }

  for (const { line, feeAmount, shipAmount } of lineCosts) {
    const item = itemById.get(line.itemId);
    if (!item || line.quantity <= 0) continue;

    const sku = skuByItemId.get(line.itemId) ?? null;
    const key = breakdownIdentityKey(line.itemId, sku);
    const title = item.title ?? line.itemId;

    saleFeeTotal += feeAmount;
    addToLineBreakdown(
      saleFeeBreakdownByKey,
      key,
      sku,
      title,
      line.quantity,
      -feeAmount,
    );

    shippingTotal += shipAmount;
    addToLineBreakdown(
      sellerShippingBreakdownByKey,
      key,
      sku,
      title,
      line.quantity,
      -shipAmount,
    );
  }

  return {
    saleFeeMl: roundMoney(-Math.max(0, saleFeeTotal)),
    sellerShippingMl: roundMoney(-Math.max(0, shippingTotal)),
    partialReturnsMl: 0,
    fullShippingMl: 0,
    fullStorageMl: 0,
    fullNonComplianceMl: 0,
    saleFeeBreakdown: [...saleFeeBreakdownByKey.values()].sort(
      (a, b) => a.amount - b.amount,
    ),
    sellerShippingBreakdown: [...sellerShippingBreakdownByKey.values()].sort(
      (a, b) => a.amount - b.amount,
    ),
  };
}

async function fetchOrderDataForRange(
  accessToken: string,
  sellerId: number,
  range: CalendarDateRange,
) {
  const dateField = stockPlanningConfig.salesWindowDateField;
  // Uma única paginação de pedidos pagos — lines + orderIds saem do mesmo scrape.
  const orders = await fetchPaidOrdersByPeriod(
    accessToken,
    sellerId,
    range.from,
    range.to,
    dateField,
  );
  const orderLines = paidOrderLinesFromOrders(orders);
  const orderIds = new Set<string>();
  for (const order of orders) {
    for (const key of orderIdentityKeys(order)) orderIds.add(key);
  }
  const returnedByTagIds = returnedPaidOrderIdsFromOrders(orders);

  const revenueMl = roundMoney(
    orderLines.reduce((sum, line) => sum + line.revenue, 0),
  );

  return {
    orderLines,
    revenueMl,
    orderIds,
    returnedByTagIds,
    paidOrderCount: orders.length,
  };
}

/**
 * Pedidos cancelados do mês — uma busca só, que alimenta a linha Canceladas e
 * a auditoria dela. A busca do ML às vezes volta vazia sem erro; com vendas no
 * mês isso é suspeito, então tenta mais uma vez. `failed` = não deu para saber
 * (erro nas duas tentativas): a linha mantém o valor do sync anterior.
 */
async function fetchCancelledLinesForMonth(
  accessToken: string,
  sellerId: number,
  range: CalendarDateRange,
): Promise<{ lines: PaidOrderLine[]; failed: boolean }> {
  try {
    const lines = await fetchCancelledOrderLinesInDateRange(
      accessToken,
      sellerId,
      range.from,
      range.to,
      stockPlanningConfig.salesWindowDateField,
    );
    return { lines, failed: false };
  } catch (error) {
    logServerError("dre-month-data cancelled orders", error);
    return { lines: [], failed: true };
  }
}

/** Linhas que só a fatura do ML traz — a estimativa pelos pedidos devolve 0 fixo nelas. */
const BILLING_ONLY_LINE_KEYS: DreEditableLineKey[] = [
  "partialReturnsMl",
  "returnFeeMl",
  "specialFeesMl",
  "fullStorageMl",
  "minhaPaginaMl",
  "affiliateFeeMl",
];

export type DreMonthSyncResult = {
  payload: DreMonthSnapshotPayload;
  /**
   * Linhas cuja fonte não respondeu neste sync (fatura fora do ar, ADS além
   * dos 90 dias da API, pedidos cancelados com erro). Fonte indisponível não é
   * zero: `persistDreMonthSnapshot` mantém o valor sincronizado anterior delas.
   */
  unavailableLineKeys: DreEditableLineKey[];
};

export async function buildDreMonthSnapshot(
  accessToken: string,
  sellerId: number,
  organizationId: string,
  year: number,
  month: number,
  options: BuildDreMonthSnapshotOptions = {},
): Promise<DreMonthSyncResult> {
  const timeZone = reportsConfig.catalogCompetitionTimezone;
  const calendarRange = getCalendarMonthRange(year, month, timeZone);
  const syncWarnings: string[] = [];
  const unavailableLineKeys = new Set<DreEditableLineKey>();
  const itemCache = new Map<string, ItemBody>();
  const fullDetailsCache =
    options.fullDetailsCache ?? createFullBillingDetailsCache();
  const report = (progress: DreSyncProgress) => {
    options.onProgress?.(progress);
  };

  report({ phase: "billing", message: "Buscando fatura e pedidos do ML…" });

  const [billingResult, orderResult, firstCancelledFetch] = await Promise.all([
    (async () => {
      try {
        // Popula fullDetailsCache com /full/details do mês — reutilizado no
        // auto-import Full sem re-paginar.
        return await fetchMlBillingSummaryForMonth(accessToken, year, month, {
          fullDetailsCache,
        });
      } catch (error) {
        logServerError("dre-month-data billing", error);
        syncWarnings.push(
          "API de faturamento ML indisponível; tarifas estimadas pelos pedidos.",
        );
        return null;
      }
    })(),
    fetchOrderDataForRange(accessToken, sellerId, calendarRange),
    fetchCancelledLinesForMonth(accessToken, sellerId, calendarRange),
  ]);

  const billing = billingResult;
  const {
    orderLines,
    revenueMl: ordersRevenueMl,
    orderIds,
    returnedByTagIds,
    paidOrderCount,
  } = orderResult;
  const revenueMl = ordersRevenueMl;

  // A busca de cancelados às vezes volta vazia sem erro. Com vendas no mês
  // isso é suspeito (ou deu erro): mais uma tentativa antes de aceitar.
  let cancelledFetch = firstCancelledFetch;
  if (
    cancelledFetch.failed ||
    (cancelledFetch.lines.length === 0 && revenueMl > 0)
  ) {
    const retry = await fetchCancelledLinesForMonth(
      accessToken,
      sellerId,
      calendarRange,
    );
    if (!retry.failed) cancelledFetch = retry;
  }
  const cancelledLines = cancelledFetch.lines;
  const cancelledFetchFailed = cancelledFetch.failed;

  const billingAlignsWithCivil =
    billing?.billingPeriod !== null &&
    billing?.billingPeriod !== undefined &&
    isMlBillingPeriodCivilMonth(
      billing.billingPeriod,
      year,
      month,
      timeZone,
    );

  if (billing?.billingPeriod && !billingAlignsWithCivil) {
    const mlPeriod = formatCalendarRangeYmd(billing.billingPeriod, timeZone);
    syncWarnings.push(
      `Fatura ML (key ${year}-${String(month).padStart(2, "0")}-01) cobre ${mlPeriod.from} → ${mlPeriod.to}; tarifas e frete vêm dos pedidos do mês civil.`,
    );
  }

  report({ phase: "ads", message: "Carregando ADS e custos ERP…" });

  const adsPromise = (async (): Promise<{
    adsCost: number;
    adsCostBreakdown: DreLineBreakdownItem[] | undefined;
    /** O valor veio da fatura (então a auditoria da fatura é a dele). */
    fromBilling: boolean;
    /** A API não cobriu o mês: o valor anterior continua valendo. */
    unavailable: boolean;
  }> => {
    const fromBillingOrUnavailable = (warning: string) => {
      if (billing && billing.adsCost > 0 && billingAlignsWithCivil) {
        return {
          adsCost: billing.adsCost,
          adsCostBreakdown: undefined,
          fromBilling: true,
          unavailable: false,
        };
      }
      syncWarnings.push(warning);
      return {
        adsCost: 0,
        adsCostBreakdown: undefined,
        fromBilling: false,
        unavailable: true,
      };
    };
    try {
      const advertiserId = await fetchPadsAdvertiserId(accessToken);
      if (advertiserId === null) {
        return {
          adsCost: 0,
          adsCostBreakdown: undefined,
          fromBilling: false,
          unavailable: false,
        };
      }
      const { dateFrom, dateTo } = getProductAdsDateRangeForMonth(year, month);
      if (!isProductAdsMetricsRangeAvailable(dateFrom)) {
        return fromBillingOrUnavailable(
          "Campanhas ADS: a API do ML só cobre os últimos 90 dias; neste mês o detalhe por anúncio não está disponível.",
        );
      }
      const adsMetrics = await fetchProductAdsMetricsByItem(accessToken, {
        advertiserId,
        siteId: "MLB",
        dateFrom,
        dateTo,
      });
      const adsCost = roundMoney(
        [...adsMetrics.values()].reduce((sum, row) => sum + row.cost, 0),
      );
      const adsItemIds = [...adsMetrics.keys()].filter(
        (id) => (adsMetrics.get(id)?.cost ?? 0) !== 0,
      );
      const adsItems = await fetchItemsWithCache(
        accessToken,
        adsItemIds,
        itemCache,
      );
      const adsItemById = new Map(adsItems.map((item) => [item.id, item]));
      const adsSkuByItemId = await resolveEffectiveSkuByItemId(
        organizationId,
        adsItems.map((item) => ({ id: item.id, sku: getItemSku(item) })),
      );
      const adsCostBreakdown = adsItemIds
        .map((itemId) => {
          const metrics = adsMetrics.get(itemId)!;
          const sku = adsSkuByItemId.get(itemId) ?? null;
          const title = adsItemById.get(itemId)?.title ?? itemId;
          return {
            key: breakdownIdentityKey(itemId, sku),
            sku,
            title,
            quantity: metrics.unitsQuantity,
            amount: roundMoney(-metrics.cost),
          };
        })
        .sort((a, b) => a.amount - b.amount);
      return { adsCost, adsCostBreakdown, fromBilling: false, unavailable: false };
    } catch (error) {
      const lookbackLimited = isProductAdsLookbackLimitError(error);
      if (!lookbackLimited) {
        logServerError("dre-month-data ads", error);
      }
      return fromBillingOrUnavailable(
        lookbackLimited
          ? "Campanhas ADS: a API do ML só cobre os últimos 90 dias; neste mês o detalhe por anúncio não está disponível."
          : "Não foi possível carregar o gasto com campanhas ADS neste mês.",
      );
    }
  })();

  report({ phase: "ml_costs", message: "Mapeando custos ML…" });

  let saleFeeMl = 0;
  let sellerShippingMl = 0;
  /** Canceladas segundo a fatura — só conferência ou plano B da linha. */
  let billingCancelledSalesMl: number | null = null;
  let partialReturnsMl = 0;
  let returnFeeMl = 0;
  let specialFeesMl = 0;
  let fullShippingMl = 0;
  let fullStorageMl = 0;
  let fullNonComplianceMl = 0;
  let minhaPaginaMl = 0;
  let affiliateFeeMl = 0;
  let saleFeeBreakdown: DreLineBreakdownItem[] | undefined;
  let sellerShippingBreakdown: DreLineBreakdownItem[] | undefined;
  let billingAuditAgg: MlDetailsAggregation | null =
    billing?.detailsAggregation ?? null;
  let billingSource: DreMonthSnapshotPayload["billingSource"] = "fallback";
  let usedCivilDetails = false;
  let isPartial = isCurrentCalendarMonth(year, month);

  const billingHasMappedLines =
    billing !== null && !isBillingSummaryEmpty(billing);

  if (billingHasMappedLines && billingAlignsWithCivil) {
    billingSource = "billing";
    saleFeeMl = billing!.saleFee;
    sellerShippingMl = billing!.sellerShipping;
    billingCancelledSalesMl = billing!.cancelledSales;
    partialReturnsMl = billing!.partialReturns;
    returnFeeMl = billing!.returnFee;
    specialFeesMl = billing!.specialFees;
    fullShippingMl = billing!.fullShipping;
    fullStorageMl = billing!.fullStorage;
    fullNonComplianceMl = billing!.fullNonCompliance;
    minhaPaginaMl = billing!.minhaPagina;
    affiliateFeeMl = billing!.affiliateFee;
    if (billing!.detailsUsed) {
      if ((billing!.mergeWarnings?.length ?? 0) > 0) {
        syncWarnings.push(
          `Fatura ML: summary e /details divergem em ${billing!.mergeWarnings.length} linha(s); o DRE usou o total mais completo (maior magnitude).`,
        );
        for (const note of billing!.mergeWarnings.slice(0, 4)) {
          syncWarnings.push(`• ${note}`);
        }
      } else {
        syncWarnings.push(
          "Custos ML conferidos com o detalhamento de faturamento (/group/ML/details).",
        );
      }
    }
    const unmapped = billing!.detailsAggregation?.unmappedCharges ?? 0;
    if (unmapped !== 0) {
      syncWarnings.push(
        `Há cobranças ML não mapeadas no DRE (R$ ${Math.abs(unmapped).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}).`,
      );
    }
    if (isPartial) {
      isPartial = saleFeeMl === 0 && sellerShippingMl === 0;
    }
  } else if (billingHasMappedLines && !billingAlignsWithCivil) {
    billingSource = "fallback";
    try {
      const civil = await aggregateBillingDetailsForCivilMonthOrders(
        accessToken,
        year,
        month,
        orderIds,
          billing?.detailEntries?.length
            ? {
                key: billingPeriodKey(year, month),
                entries: billing.detailEntries,
              }
            : undefined,
      );
      if (
        civil &&
        (civil.saleFeeMl !== 0 ||
          civil.sellerShippingMl !== 0 ||
          civil.returnFeeMl !== 0 ||
          civil.specialFeesMl !== 0)
      ) {
        saleFeeMl = civil.saleFeeMl;
        sellerShippingMl = civil.sellerShippingMl;
        returnFeeMl = civil.returnFeeMl;
        specialFeesMl = civil.specialFeesMl;
        if (civil.cancelledSalesMl !== 0) {
          billingCancelledSalesMl = civil.cancelledSalesMl;
        }
        usedCivilDetails = true;
        billingAuditAgg = civil;
        billingSource = "billing";
        syncWarnings.push(
          "Tarifa ML / frete / devolução / especiais agregados dos detalhes da fatura pelos pedidos do mês civil (ciclo ML não alinha ao calendário).",
        );
      }
    } catch (error) {
      logServerError("dre-month-data civil-billing-details", error);
    }

    if (!usedCivilDetails) {
      try {
        const fallback = await estimateMlCostsFallback(
          accessToken,
          sellerId,
          organizationId,
          orderLines,
          itemCache,
        );
        saleFeeMl = fallback.saleFeeMl;
        sellerShippingMl = fallback.sellerShippingMl;
        saleFeeBreakdown = fallback.saleFeeBreakdown;
        sellerShippingBreakdown = fallback.sellerShippingBreakdown;
        syncWarnings.push(
          "Não foi possível agregar a fatura por pedidos do mês; tarifas/frete estimados pelos pedidos.",
        );
      } catch (error) {
        logServerError("dre-month-data ml-fallback", error);
        syncWarnings.push(
          "Não foi possível estimar tarifas e frete do Mercado Livre.",
        );
      }
    } else if (billingCancelledSalesMl === null) {
      billingCancelledSalesMl = billing!.cancelledSales;
    }

    partialReturnsMl = billing!.partialReturns;
    if (!usedCivilDetails) {
      returnFeeMl = billing!.returnFee;
      specialFeesMl = billing!.specialFees;
    }
    fullShippingMl = billing!.fullShipping;
    fullStorageMl = billing!.fullStorage;
    fullNonComplianceMl = billing!.fullNonCompliance;
    minhaPaginaMl = billing!.minhaPagina;
    affiliateFeeMl = billing!.affiliateFee;
    syncWarnings.push(
      "Custos Full (envios, armazenamento, inconformidades), Minha Página e afiliados da fatura ML do ciclo próximo a este mês.",
    );
  } else {
    // Resumo de fatura vazio (chamada funcionou, só não veio com cobranças
    // mapeadas): antes de estimar (preço de tabela via
    // listing_prices/shipping_options, que não é o valor realmente
    // cobrado), tentar os dados reais do /group/ML/details do ciclo
    // próximo ao mês civil — mesma função já usada quando o resumo existe
    // mas não alinha ao mês civil.
    //
    // Só tenta quando `billing !== null` (resumo respondeu, só veio vazio).
    // Quando o resumo falhou de vez (`billing === null`), pular direto
    // pro fallback rápido: insistir em outro endpoint pesado e paginado
    // nesse cenário já causou sync travado (ver histórico do DRE).
    if (billing !== null) {
      try {
        const civil = await aggregateBillingDetailsForCivilMonthOrders(
          accessToken,
          year,
          month,
          orderIds,
          billing?.detailEntries?.length
            ? {
                key: billingPeriodKey(year, month),
                entries: billing.detailEntries,
              }
            : undefined,
        );
        if (
          civil &&
          (civil.saleFeeMl !== 0 ||
            civil.sellerShippingMl !== 0 ||
            civil.returnFeeMl !== 0 ||
            civil.specialFeesMl !== 0)
        ) {
          saleFeeMl = civil.saleFeeMl;
          sellerShippingMl = civil.sellerShippingMl;
          returnFeeMl = civil.returnFeeMl;
          specialFeesMl = civil.specialFeesMl;
          billingCancelledSalesMl = civil.cancelledSalesMl;
          partialReturnsMl = civil.partialReturnsMl;
          fullShippingMl = civil.fullShippingMl;
          fullStorageMl = civil.fullStorageMl;
          fullNonComplianceMl = civil.fullNonComplianceMl;
          minhaPaginaMl = civil.minhaPaginaMl;
          affiliateFeeMl = civil.affiliateFeeMl;
          usedCivilDetails = true;
          billingAuditAgg = civil;
          billingSource = "billing";
          syncWarnings.push(
            "Resumo de faturamento ML sem cobranças mapeadas; tarifas/frete/devolução/especiais agregados dos detalhes reais da fatura pelos pedidos do mês.",
          );
        }
      } catch (error) {
        logServerError(
          "dre-month-data civil-billing-details-no-summary",
          error,
        );
      }
    }

    if (!usedCivilDetails) {
      if (billing !== null && revenueMl > 0) {
        syncWarnings.push(
          "Resumo de faturamento ML retornou sem cobranças mapeadas; tarifas estimadas pelos pedidos.",
        );
      } else if (billing === null) {
        syncWarnings.push(
          "Resumo de faturamento ML não disponível; valores estimados pelos pedidos.",
        );
      }

      try {
        const fallback = await estimateMlCostsFallback(
          accessToken,
          sellerId,
          organizationId,
          orderLines,
          itemCache,
        );
        saleFeeMl = fallback.saleFeeMl;
        sellerShippingMl = fallback.sellerShippingMl;
        partialReturnsMl = fallback.partialReturnsMl;
        fullShippingMl = fallback.fullShippingMl;
        fullStorageMl = fallback.fullStorageMl;
        fullNonComplianceMl = fallback.fullNonComplianceMl;
        saleFeeBreakdown = fallback.saleFeeBreakdown;
        sellerShippingBreakdown = fallback.sellerShippingBreakdown;
      } catch (error) {
        logServerError("dre-month-data ml-fallback", error);
        syncWarnings.push(
          "Não foi possível estimar tarifas e frete do Mercado Livre.",
        );
      }
    }
  }

  // Sem fatura (nem detalhamento civil) a estimativa pelos pedidos não tem
  // como saber estas linhas e devolve 0 — não é zero de verdade.
  const billingOnlyUnavailable = !usedCivilDetails && !billingHasMappedLines;

  let partialReturnsBreakdown: DreLineBreakdownItem[] | undefined;
  let returnFeeBreakdown: DreLineBreakdownItem[] | undefined;
  let specialFeesBreakdown: DreLineBreakdownItem[] | undefined;
  let fullShippingBreakdown: DreLineBreakdownItem[] | undefined;
  let fullStorageBreakdown: DreLineBreakdownItem[] | undefined;
  let fullNonComplianceBreakdown: DreLineBreakdownItem[] | undefined;
  let minhaPaginaBreakdown: DreLineBreakdownItem[] | undefined;
  let affiliateFeeBreakdown: DreLineBreakdownItem[] | undefined;
  let cancelledSalesBreakdownFromBilling:
    | DreLineBreakdownItem[]
    | undefined;

  const cancelledBillingOrderIds = new Set([
    ...(billingAuditAgg?.cancelledOrderIds ?? []),
    ...returnedByTagIds,
  ]);
  const { activeLines, returnedOnInvoiceLines } =
    splitOrderLinesByCancelledOrderIds(orderLines, cancelledBillingOrderIds);

  // Um contexto só (anúncios, cadastro, nivelamentos, relatório tributário,
  // kits) para pedidos pagos, devolvidos e cancelados.
  const [adsResult, erpContext] = await Promise.all([
    adsPromise,
    loadErpCostContext({
      accessToken,
      sellerId,
      organizationId,
      itemIds: [...orderLines, ...cancelledLines].map((line) => line.itemId),
      year,
      month,
      itemCache,
    }),
  ]);
  const { adsCost } = adsResult;
  let adsCostBreakdown = adsResult.adsCostBreakdown;
  if (adsResult.unavailable) unavailableLineKeys.add("adsCost");

  const activeCosts = computeErpCostsForLines(
    erpContext,
    activeLines,
    "active",
    year,
    month,
  );
  const returnedCosts = computeErpCostsForLines(
    erpContext,
    returnedOnInvoiceLines,
    "returned",
    year,
    month,
  );
  const cancelledCosts = computeErpCostsForLines(
    erpContext,
    cancelledLines,
    "cancelled",
    year,
    month,
  );
  const salesTax = computeDreSalesTax(
    [
      ...activeCosts.taxLines,
      ...returnedCosts.taxLines,
      ...cancelledCosts.taxLines,
    ],
    erpContext.taxRates,
  );

  const billingLineLists = billingAuditAgg?.lineBreakdowns;
  if (billingLineLists) {
    const useInvoiceFeeAudit =
      (billingHasMappedLines && billingAlignsWithCivil) || usedCivilDetails;
    if (useInvoiceFeeAudit) {
      if ((billingLineLists.saleFeeMl?.length ?? 0) > 0) {
        saleFeeBreakdown = billingLineLists.saleFeeMl;
      }
      if ((billingLineLists.sellerShippingMl?.length ?? 0) > 0) {
        sellerShippingBreakdown = billingLineLists.sellerShippingMl;
      }
    }
    cancelledSalesBreakdownFromBilling = billingLineLists.cancelledSalesMl;
    partialReturnsBreakdown = billingLineLists.partialReturnsMl;
    returnFeeBreakdown = billingLineLists.returnFeeMl;
    specialFeesBreakdown = billingLineLists.specialFeesMl;
    fullShippingBreakdown = billingLineLists.fullShippingMl;
    fullStorageBreakdown = billingLineLists.fullStorageMl;
    fullNonComplianceBreakdown = billingLineLists.fullNonComplianceMl;
    minhaPaginaBreakdown = billingLineLists.minhaPaginaMl;
    affiliateFeeBreakdown = billingLineLists.affiliateFeeMl;
    // A cobrança de Ads da fatura só é auditoria quando o valor também veio
    // da fatura — senão a lista (do ciclo da fatura) não explica o valor.
    if (
      !adsCostBreakdown &&
      adsResult.fromBilling &&
      (billingLineLists.adsCost?.length ?? 0) > 0
    ) {
      adsCostBreakdown = billingLineLists.adsCost;
    }
  }

  const monthLabel = `${String(month).padStart(2, "0")}/${year}`;
  if (activeCosts.incompleteItemIds.size > 0) {
    syncWarnings.push(
      `${activeCosts.incompleteItemIds.size} anúncio(s) sem preço de compra no estoque.`,
    );
  }
  if (erpContext.taxRates.regime === "SIMPLES") {
    if (erpContext.taxRates.simplesRatePercent === null && revenueMl > 0) {
      syncWarnings.push(
        "Impostos sobre vendas: configure a alíquota efetiva do Simples Nacional em Configurações tributárias — sem ela o imposto fica zerado.",
      );
    }
  } else {
    if (salesTax.missingItemCount > 0) {
      syncWarnings.push(
        `${salesTax.missingItemCount} anúncio(s) sem relatório tributário apurado até ${monthLabel} — linha de Imposto ficou subestimada para eles.`,
      );
    }
    if (salesTax.fallbackItemCount > 0) {
      syncWarnings.push(
        `${salesTax.fallbackItemCount} anúncio(s) usaram % de imposto de um mês diferente (sem apuração tributária própria em ${monthLabel}).`,
      );
    }
  }

  // Canceladas / devolvidas: a linha é sempre a soma da própria auditoria —
  // pedidos cancelados + pedidos pagos que voltaram, os mesmos que já saem do
  // Custo produto e dos Impostos (e o mesmo bruto que a visão "painel ML" soma
  // ao faturamento). Antes a linha vinha de outra busca/fonte e podia zerar
  // com a auditoria cheia.
  const overlayLines = [...cancelledLines, ...returnedOnInvoiceLines];
  const overlayRevenueBreakdown = mergeLineBreakdowns([
    cancelledCosts.revenueBreakdown,
    returnedCosts.revenueBreakdown,
  ]);
  const ordersCancelledRevenue = roundMoney(
    overlayLines.reduce((sum, line) => sum + line.revenue, 0),
  );
  const overlayTax = salesTax.taxBreakdown.reduce(
    (sum, item) => sum + (item.cancelledTax ?? 0) + (item.returnedTax ?? 0),
    0,
  );
  const ordersOverlay: DreCancelledIncludeOverlay = {
    revenueGross: roundMoney(
      cancelledLines.reduce((sum, line) => sum + line.revenue, 0),
    ),
    productCostErp: roundMoney(
      -Math.max(0, cancelledCosts.productCost + returnedCosts.productCost),
    ),
    taxErp: overlayTax > 0 ? roundMoney(-overlayTax) : 0,
  };
  const billingCancelledList =
    (cancelledSalesBreakdownFromBilling?.length ?? 0) > 0
      ? cancelledSalesBreakdownFromBilling
      : undefined;

  let cancelledSalesMl = 0;
  let cancelledSalesBreakdown: DreLineBreakdownItem[] | undefined;
  let cancelledIncludeOverlay: DreCancelledIncludeOverlay | undefined;
  if (overlayLines.length > 0 && !cancelledFetchFailed) {
    cancelledSalesMl = -ordersCancelledRevenue;
    cancelledSalesBreakdown = overlayRevenueBreakdown
      .map((item) => ({ ...item, amount: roundMoney(-item.amount) }))
      .sort((a, b) => a.amount - b.amount);
    cancelledIncludeOverlay = ordersOverlay;
    if (billingCancelledSalesMl !== null && billingCancelledSalesMl !== 0) {
      const invoice = Math.abs(billingCancelledSalesMl);
      if (
        Math.abs(invoice - ordersCancelledRevenue) >
        Math.max(50, ordersCancelledRevenue * 0.1)
      ) {
        syncWarnings.push(
          `Canceladas / devolvidas: ${formatMoneyForWarning(ordersCancelledRevenue)} pelos pedidos do mês; a fatura ML mostra ${formatMoneyForWarning(invoice)} (a fatura também lança devoluções de vendas de outros meses).`,
        );
      }
    }
  } else if (
    billingCancelledList ||
    (billingCancelledSalesMl !== null && billingCancelledSalesMl !== 0)
  ) {
    // Nenhum pedido cancelado/devolvido no mês (ou a busca falhou), mas a
    // fatura tem: vale a fatura, com linha e auditoria saindo da mesma lista.
    cancelledSalesMl = billingCancelledList
      ? roundMoney(billingCancelledList.reduce((sum, item) => sum + item.amount, 0))
      : (billingCancelledSalesMl ?? 0);
    cancelledSalesBreakdown = billingCancelledList;
    if (cancelledFetchFailed) {
      syncWarnings.push(
        "Pedidos cancelados indisponíveis no ML; Canceladas / devolvidas veio da fatura.",
      );
    }
  } else if (cancelledFetchFailed) {
    unavailableLineKeys.add("cancelledSalesMl");
    cancelledSalesMl = -ordersCancelledRevenue;
    cancelledSalesBreakdown = overlayRevenueBreakdown.length
      ? overlayRevenueBreakdown
          .map((item) => ({ ...item, amount: roundMoney(-item.amount) }))
          .sort((a, b) => a.amount - b.amount)
      : undefined;
    cancelledIncludeOverlay = ordersOverlay;
    syncWarnings.push(
      "Não foi possível buscar os pedidos cancelados no Mercado Livre.",
    );
  }

  report({
    phase: "full",
    message: "Conferindo Relatório Full (envios/inconformidade)…",
  });

  let fullReportSourced = false;
  try {
    let fullShipmentRecords = await listFullShipmentsForPeriod(
      organizationId,
      year,
      month,
    );
    let autoImported = false;

    if (fullShipmentRecords.length === 0) {
      try {
        report({
          phase: "full",
          message: "Importando Relatório Full automaticamente…",
        });
        const imported = await importFullCollectChargesFromBilling(
          accessToken,
          sellerId,
          organizationId,
          year,
          month,
          { fullDetailsCache },
        );
        fullShipmentRecords = imported.shipments;
        autoImported = imported.imported > 0;
        if (autoImported) {
          syncWarnings.push(
            `Full envios/inconformidade: importamos automaticamente ${imported.imported} envio(s) pelo mesmo fluxo do Relatório Full.`,
          );
        }
      } catch (importError) {
        logServerError("dre-month-data full-report-auto-import", importError);
        syncWarnings.push(
          "Falha ao importar envios Full automaticamente; usando total consolidado da fatura ML.",
        );
      }
    }

    if (fullShipmentRecords.length > 0) {
      const totalFullCost = fullShipmentRecords.reduce(
        (sum, s) => sum + s.totalCost,
        0,
      );
      const totalNonCompliance = fullShipmentRecords.reduce(
        (sum, s) => sum + s.nonComplianceCost,
        0,
      );
      const totalCollect = roundMoney(totalFullCost - totalNonCompliance);
      fullShippingMl = roundMoney(-Math.max(0, totalCollect));
      fullNonComplianceMl = roundMoney(-Math.max(0, totalNonCompliance));
      fullReportSourced = true;
      fullShippingBreakdown = undefined;
      fullNonComplianceBreakdown = undefined;
      if (!autoImported) {
        syncWarnings.push(
          "Full envios/inconformidade vêm dos envios já importados no Relatório Full deste mês.",
        );
      }
    } else {
      syncWarnings.push(
        "Nenhum envio Full encontrado para este mês (Relatório Full / Fulfillment); Full envios/inconformidade usam o total consolidado da fatura ML.",
      );
    }
  } catch (error) {
    logServerError("dre-month-data full-report", error);
    syncWarnings.push(
      "Não foi possível ler os envios Full importados; usando total consolidado da fatura ML.",
    );
  }

  if (billingOnlyUnavailable) {
    for (const key of BILLING_ONLY_LINE_KEYS) unavailableLineKeys.add(key);
    if (!fullReportSourced) {
      unavailableLineKeys.add("fullShippingMl");
      unavailableLineKeys.add("fullNonComplianceMl");
    }
  }

  const cancelledProductCostBreakdown = mergeProductCostBreakdowns([
    cancelledCosts.breakdown,
    returnedCosts.breakdown,
  ]).map((item) => ({
    // Anotados na mesma linha do produto (cancelledQuantity/cancelledCost),
    // sem entrar em quantity/totalCost — ver applyDreIncludeCancelledView.
    ...item,
    quantity: 0,
    totalCost: 0,
    unitCost: 0,
    cancelledQuantity: item.quantity,
    cancelledCost: item.totalCost,
  }));

  const payload: DreMonthSnapshotPayload = {
    revenueMl,
    cancelledSalesMl,
    saleFeeMl,
    partialReturnsMl,
    returnFeeMl,
    specialFeesMl,
    productCostErp:
      activeCosts.productCost > 0 ? roundMoney(-activeCosts.productCost) : 0,
    taxErp: salesTax.taxErp,
    sellerShippingMl,
    fullShippingMl,
    fullStorageMl,
    fullNonComplianceMl,
    minhaPaginaMl,
    affiliateFeeMl,
    adsCost,
    billingSource,
    isPartial,
    incompleteProductCostCount: activeCosts.incompleteItemIds.size,
    syncWarnings,
    cancelledIncludeOverlay,
    productCostBreakdown: mergeProductCostBreakdowns([
      activeCosts.breakdown,
      cancelledProductCostBreakdown,
    ]),
    taxBreakdown: salesTax.taxBreakdown,
    // A receita de pedidos cancelados/devolvidos conta normalmente em
    // `amount` (o painel ML inclui canceladas no faturamento bruto — ver
    // applyDreIncludeCancelledView) e fica também anotada em
    // `cancelledAmount`, na mesma linha do produto, só para transparência.
    // Sem isso a lista não bateria com o total de Faturamento ML exibido.
    revenueBreakdown: mergeLineBreakdowns([
      activeCosts.revenueBreakdown,
      overlayRevenueBreakdown.map((item) => ({
        ...item,
        cancelledQuantity: item.quantity,
        cancelledAmount: item.amount,
      })),
    ]),
    cancelledSalesBreakdown,
    saleFeeBreakdown,
    sellerShippingBreakdown,
    adsCostBreakdown,
    partialReturnsBreakdown,
    returnFeeBreakdown,
    specialFeesBreakdown,
    fullShippingBreakdown,
    fullStorageBreakdown,
    fullNonComplianceBreakdown,
    minhaPaginaBreakdown,
    affiliateFeeBreakdown,
    fullReportSourced,
    taxSource: buildDreTaxSource({
      result: salesTax,
      rates: erpContext.taxRates,
      paidOrderCount,
      previousTaxErp: null,
      origin: "sync",
    }),
  };

  return { payload, unavailableLineKeys: [...unavailableLineKeys] };
}

function formatMoneyForWarning(value: number): string {
  return `R$ ${value.toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

/**
 * Grava o sync do mês por cima do snapshot anterior (ver `mergeSyncedSnapshot`).
 * Ler, mesclar e gravar acontecem na mesma transação: uma conciliação
 * confirmada no meio do caminho não é sobrescrita por um payload lido antes.
 * Se o usuário escolheu não manter a conciliação, o import dela vira
 * `superseded` junto — o mês volta a "não conciliado" de forma consistente.
 * Linhas cuja fonte falhou (`keepPreviousLineKeys`, vindo de
 * `DreMonthSyncResult.unavailableLineKeys`) mantêm o valor do sync anterior.
 */
export async function persistDreMonthSnapshot(
  organizationId: string,
  year: number,
  month: number,
  payload: DreMonthSnapshotPayload,
  options: Omit<MergeSyncedSnapshotOptions, "previousSyncedAt"> = {
    keepReconciliation: true,
    preserveLineKeys: [],
  },
): Promise<Date> {
  const syncedAt = new Date();

  await prisma.$transaction(
    async (tx) => {
      const existing = await tx.dreMonthSnapshot.findUnique({
        where: { organizationId_year_month: { organizationId, year, month } },
        select: { payload: true, syncedAt: true },
      });
      const previous = existing ? parseSnapshotPayload(existing.payload) : null;
      const merged = mergeSyncedSnapshot(payload, previous, {
        ...options,
        previousSyncedAt: existing?.syncedAt.toISOString() ?? null,
      });
      if (merged.taxSource) {
        merged.taxSource = {
          ...merged.taxSource,
          previousTaxErp: previous ? previous.taxErp : null,
        };
      }
      const mismatches = checkLineAuditConsistency(merged);
      if (mismatches.length > 0) merged.lineAuditMismatches = mismatches;
      else delete merged.lineAuditMismatches;

      await tx.dreMonthSnapshot.upsert({
        where: { organizationId_year_month: { organizationId, year, month } },
        create: {
          organizationId,
          year,
          month,
          syncedAt,
          payload: merged as object,
        },
        update: {
          syncedAt,
          payload: merged as object,
        },
      });

      const droppedImportId =
        previous?.reconciliation && !merged.reconciliation
          ? previous.reconciliation.importId
          : null;
      if (droppedImportId) {
        await tx.dreReconciliationImport.updateMany({
          where: { id: droppedImportId, organizationId, status: "confirmed" },
          data: { status: "superseded" },
        });
      }
    },
    { timeout: 60_000 },
  );
  return syncedAt;
}

export type DreTaxRefreshStatus =
  /** Imposto recalculado e gravado. */
  | "updated"
  /** Recalculado, mesmo valor. */
  | "unchanged"
  /** A linha tem ajuste manual: o valor fica; auditoria e baseline atualizam. */
  | "manual_edit"
  | "no_snapshot"
  /** Snapshot antigo, sem auditoria por anúncio — só um sync completo resolve. */
  | "needs_sync";

export type DreTaxRefreshResult = {
  status: DreTaxRefreshStatus;
  previousTaxErp: number | null;
  taxErp: number | null;
};

/** % do kit pela média dos componentes, para kits sem % próprio no tributário. */
async function loadKitComponentsRates(
  organizationId: string,
  kitItemIds: readonly string[],
  rates: DreTaxRates,
): Promise<Map<string, number | null>> {
  const out = new Map<string, number | null>();
  if (kitItemIds.length === 0) return out;
  const kitsByMlItemId = await loadKitsByMlItemId(organizationId, [
    ...new Set(kitItemIds),
  ]);
  const componentSkus = [...kitsByMlItemId.values()].flatMap((components) =>
    components.map((c) => c.sku),
  );
  const pricing = await loadProductsMapBySku(organizationId, componentSkus);
  const rateBySku = new Map(
    [...rates.bySku].map(([sku, entry]) => [sku, entry.ratePercent]),
  );
  for (const [itemId, components] of kitsByMlItemId) {
    out.set(
      itemId,
      resolveKitPricing(components, pricing.bySku, rateBySku).taxRatePercent,
    );
  }
  return out;
}

/**
 * Recalcula só os Impostos sobre vendas do mês com a versão atual do relatório
 * tributário, a partir da auditoria salva (receita por anúncio) — sem buscar
 * nada no ML. É o que mantém DRE e tributário andando juntos: recalcular o
 * tributário chama isto para o mesmo mês.
 */
export async function refreshDreSalesTax(
  organizationId: string,
  sellerId: number,
  year: number,
  month: number,
  options: {
    /** Só calcula e devolve o resultado — não grava (prévia antes de confirmar). */
    dryRun?: boolean;
    /** Relatório do mês ainda não gravado (prévia de recálculo do tributário). */
    monthReportOverride?: TaxReportPayload;
  } = {},
): Promise<DreTaxRefreshResult> {
  const initial = await prisma.dreMonthSnapshot.findUnique({
    where: { organizationId_year_month: { organizationId, year, month } },
    select: { payload: true },
  });
  const initialPayload = initial ? parseSnapshotPayload(initial.payload) : null;
  if (!initialPayload) {
    return { status: "no_snapshot", previousTaxErp: null, taxErp: null };
  }
  if (!initialPayload.taxBreakdown) {
    return {
      status: "needs_sync",
      previousTaxErp: initialPayload.taxErp,
      taxErp: null,
    };
  }

  const rates = await loadDreTaxRates(organizationId, sellerId, year, month, {
    monthReportOverride: options.monthReportOverride,
  });
  const kitItemIds = initialPayload.taxBreakdown
    .filter((item) => item.key.startsWith("kit:"))
    .map((item) => item.key.slice("kit:".length));
  const kitRates = await loadKitComponentsRates(
    organizationId,
    kitItemIds,
    rates,
  );

  if (options.dryRun) {
    const result = computeDreSalesTax(
      taxLinesFromBreakdown(initialPayload.taxBreakdown, kitRates),
      rates,
    );
    const manualEdit = (initialPayload.manuallyEditedLineKeys ?? []).includes(
      "taxErp",
    );
    return {
      status: manualEdit
        ? "manual_edit"
        : Math.abs(result.taxErp - initialPayload.taxErp) < 0.005
          ? "unchanged"
          : "updated",
      previousTaxErp: initialPayload.taxErp,
      taxErp: manualEdit ? initialPayload.taxErp : result.taxErp,
    };
  }

  return prisma.$transaction(
    async (tx) => {
      // Relê dentro da transação: um sync que gravou no meio do caminho ganha.
      const existing = await tx.dreMonthSnapshot.findUnique({
        where: { organizationId_year_month: { organizationId, year, month } },
        select: { payload: true },
      });
      const current = existing ? parseSnapshotPayload(existing.payload) : null;
      if (!current) {
        return { status: "no_snapshot", previousTaxErp: null, taxErp: null };
      }
      if (!current.taxBreakdown) {
        return {
          status: "needs_sync",
          previousTaxErp: current.taxErp,
          taxErp: null,
        };
      }

      const result = computeDreSalesTax(
        taxLinesFromBreakdown(current.taxBreakdown, kitRates),
        rates,
      );
      const manualEdit = (current.manuallyEditedLineKeys ?? []).includes(
        "taxErp",
      );
      const next: DreMonthSnapshotPayload = {
        ...current,
        taxErp: manualEdit ? current.taxErp : result.taxErp,
        taxBreakdown: result.taxBreakdown,
        syncedLineBaseline: {
          ...(current.syncedLineBaseline ?? {}),
          taxErp: result.taxErp,
        },
        syncedBreakdownBaseline: {
          ...(current.syncedBreakdownBaseline ?? {}),
          taxBreakdown: result.taxBreakdown,
        },
        taxSource: buildDreTaxSource({
          result,
          rates,
          paidOrderCount: current.taxSource?.paidOrderCount ?? null,
          previousTaxErp: current.taxErp,
          origin: "refresh",
        }),
      };
      if (next.cancelledIncludeOverlay) {
        const overlayTax = result.taxBreakdown.reduce(
          (sum, item) => sum + (item.cancelledTax ?? 0) + (item.returnedTax ?? 0),
          0,
        );
        next.cancelledIncludeOverlay = {
          ...next.cancelledIncludeOverlay,
          taxErp: overlayTax > 0 ? roundMoney(-overlayTax) : 0,
        };
      }
      const mismatches = checkLineAuditConsistency(next);
      if (mismatches.length > 0) next.lineAuditMismatches = mismatches;
      else delete next.lineAuditMismatches;

      await tx.dreMonthSnapshot.update({
        where: { organizationId_year_month: { organizationId, year, month } },
        data: { payload: next as object },
      });

      const status: DreTaxRefreshStatus = manualEdit
        ? "manual_edit"
        : Math.abs(result.taxErp - current.taxErp) < 0.005
          ? "unchanged"
          : "updated";
      return { status, previousTaxErp: current.taxErp, taxErp: next.taxErp };
    },
    { timeout: 30_000 },
  );
}

export function emptyDreMonthSnapshotPayload(): DreMonthSnapshotPayload {
  return {
    revenueMl: 0,
    cancelledSalesMl: 0,
    saleFeeMl: 0,
    partialReturnsMl: 0,
    returnFeeMl: 0,
    specialFeesMl: 0,
    productCostErp: 0,
    taxErp: 0,
    sellerShippingMl: 0,
    fullShippingMl: 0,
    fullStorageMl: 0,
    fullNonComplianceMl: 0,
    minhaPaginaMl: 0,
    affiliateFeeMl: 0,
    adsCost: 0,
    billingSource: "fallback",
    isPartial: false,
    incompleteProductCostCount: 0,
    syncWarnings: [
      "Valores preenchidos manualmente (ainda sem sincronização completa).",
    ],
    fullReportSourced: false,
  };
}

/**
 * Atualiza uma linha editável do snapshot do mês. Cria snapshot vazio se ainda
 * não existir. Não altera `syncedAt` em updates (só na criação).
 * Marca a linha como ajustada manualmente (vs baseline do último sync).
 */
export async function patchDreMonthLine(
  organizationId: string,
  year: number,
  month: number,
  lineKey: DreEditableLineKey,
  amount: number,
): Promise<Date> {
  if (!isDreEditableLineKey(lineKey)) {
    throw new Error(`Linha DRE não editável: ${lineKey}`);
  }
  if (!Number.isFinite(amount)) {
    throw new Error("Valor monetário inválido.");
  }

  const existing = await prisma.dreMonthSnapshot.findUnique({
    where: { organizationId_year_month: { organizationId, year, month } },
  });

  const base =
    (existing ? parseSnapshotPayload(existing.payload) : null) ??
    emptyDreMonthSnapshotPayload();

  const next = applyManualLineEdit(base, lineKey, amount);

  const syncedAt = existing?.syncedAt ?? new Date();
  await prisma.dreMonthSnapshot.upsert({
    where: { organizationId_year_month: { organizationId, year, month } },
    create: {
      organizationId,
      year,
      month,
      syncedAt,
      payload: next as object,
    },
    update: {
      payload: next as object,
    },
  });
  return syncedAt;
}

/**
 * Restaura uma linha ao valor do último sync (baseline).
 * Não altera `syncedAt`.
 */
export async function restoreDreMonthLine(
  organizationId: string,
  year: number,
  month: number,
  lineKey: DreEditableLineKey,
): Promise<Date> {
  if (!isDreEditableLineKey(lineKey)) {
    throw new Error(`Linha DRE não editável: ${lineKey}`);
  }

  const existing = await prisma.dreMonthSnapshot.findUnique({
    where: { organizationId_year_month: { organizationId, year, month } },
  });
  if (!existing) {
    throw new Error("Mês sem snapshot para restaurar.");
  }

  const base = parseSnapshotPayload(existing.payload);
  if (!base) {
    throw new Error("Snapshot inválido.");
  }

  const next = applyRestoreLineFromSync(base, lineKey);
  if (!next) {
    throw new Error("Sem valor sincronizado para restaurar nesta linha.");
  }

  await prisma.dreMonthSnapshot.update({
    where: { organizationId_year_month: { organizationId, year, month } },
    data: { payload: next as object },
  });
  return existing.syncedAt;
}

export function snapshotPayloadToLines(
  payload: DreMonthSnapshotPayload,
): Parameters<typeof computeDreTotals>[0] {
  return {
    revenueMl: payload.revenueMl,
    cancelledSalesMl: payload.cancelledSalesMl,
    saleFeeMl: payload.saleFeeMl,
    partialReturnsMl: payload.partialReturnsMl,
    returnFeeMl: payload.returnFeeMl,
    specialFeesMl: payload.specialFeesMl,
    productCostErp: payload.productCostErp,
    taxErp: payload.taxErp,
    sellerShippingMl: payload.sellerShippingMl,
    fullShippingMl: payload.fullShippingMl,
    fullStorageMl: payload.fullStorageMl,
    fullNonComplianceMl: payload.fullNonComplianceMl,
    minhaPaginaMl: payload.minhaPaginaMl,
    affiliateFeeMl: payload.affiliateFeeMl,
  };
}

export function parseSnapshotPayload(raw: unknown): DreMonthSnapshotPayload | null {
  if (!raw || typeof raw !== "object") return null;
  const p = raw as Record<string, unknown>;
  const num = (key: string) => {
    const v = Number(p[key] ?? 0);
    return Number.isFinite(v) ? v : 0;
  };
  const numFrom = (v: unknown) => {
    const n = Number(v ?? 0);
    return Number.isFinite(n) ? n : 0;
  };
  const overlayRaw = p.cancelledIncludeOverlay;
  const cancelledIncludeOverlay =
    overlayRaw &&
    typeof overlayRaw === "object" &&
    !Array.isArray(overlayRaw)
      ? {
          revenueGross: numFrom(
            (overlayRaw as Record<string, unknown>).revenueGross,
          ),
          productCostErp: numFrom(
            (overlayRaw as Record<string, unknown>).productCostErp,
          ),
          taxErp: numFrom((overlayRaw as Record<string, unknown>).taxErp),
        }
      : undefined;

  const parseProductCostBreakdown = (
    raw: unknown,
  ): DreProductCostBreakdownItem[] | undefined =>
    Array.isArray(raw)
      ? raw
          .filter(
            (item): item is Record<string, unknown> =>
              Boolean(item) && typeof item === "object",
          )
          .map((item) => ({
            key: typeof item.key === "string" ? item.key : String(item.sku ?? ""),
            sku: typeof item.sku === "string" ? item.sku : null,
            title: typeof item.title === "string" ? item.title : "",
            quantity: numFrom(item.quantity),
            unitCost: numFrom(item.unitCost),
            totalCost: numFrom(item.totalCost),
            missingCost: Boolean(item.missingCost),
            leveled: item.leveled ? true : undefined,
            cancelledQuantity:
              item.cancelledQuantity !== undefined
                ? numFrom(item.cancelledQuantity)
                : undefined,
            cancelledCost:
              item.cancelledCost !== undefined
                ? numFrom(item.cancelledCost)
                : undefined,
          }))
      : undefined;

  const parseTaxBreakdown = (
    raw: unknown,
  ): DreTaxBreakdownItem[] | undefined =>
    Array.isArray(raw)
      ? raw
          .filter(
            (item): item is Record<string, unknown> =>
              Boolean(item) && typeof item === "object",
          )
          .map((item) => ({
            key: typeof item.key === "string" ? item.key : String(item.sku ?? ""),
            sku: typeof item.sku === "string" ? item.sku : null,
            title: typeof item.title === "string" ? item.title : "",
            quantity: numFrom(item.quantity),
            revenue: numFrom(item.revenue),
            taxPercent:
              item.taxPercent === null || item.taxPercent === undefined
                ? null
                : numFrom(item.taxPercent),
            totalTax: numFrom(item.totalTax),
            missingTax: Boolean(item.missingTax),
            cancelledQuantity:
              item.cancelledQuantity !== undefined
                ? numFrom(item.cancelledQuantity)
                : undefined,
            cancelledRevenue:
              item.cancelledRevenue !== undefined
                ? numFrom(item.cancelledRevenue)
                : undefined,
            cancelledTax:
              item.cancelledTax !== undefined
                ? numFrom(item.cancelledTax)
                : undefined,
            returnedQuantity:
              item.returnedQuantity !== undefined
                ? numFrom(item.returnedQuantity)
                : undefined,
            returnedRevenue:
              item.returnedRevenue !== undefined
                ? numFrom(item.returnedRevenue)
                : undefined,
            returnedTax:
              item.returnedTax !== undefined
                ? numFrom(item.returnedTax)
                : undefined,
            rateSource: parseTaxRateSource(item.rateSource),
          }))
      : undefined;

  const productCostBreakdown = parseProductCostBreakdown(p.productCostBreakdown);
  const taxBreakdown = parseTaxBreakdown(p.taxBreakdown);

  const parseLineBreakdown = (
    raw: unknown,
  ): DreLineBreakdownItem[] | undefined =>
    Array.isArray(raw)
      ? raw
          .filter(
            (item): item is Record<string, unknown> =>
              Boolean(item) && typeof item === "object",
          )
          .map((item) => ({
            key:
              typeof item.key === "string" ? item.key : String(item.sku ?? ""),
            sku: typeof item.sku === "string" ? item.sku : null,
            title: typeof item.title === "string" ? item.title : "",
            quantity:
              item.quantity === null || item.quantity === undefined
                ? null
                : numFrom(item.quantity),
            amount: numFrom(item.amount),
            cancelledQuantity:
              item.cancelledQuantity === null ||
              item.cancelledQuantity === undefined
                ? undefined
                : numFrom(item.cancelledQuantity),
            cancelledAmount:
              item.cancelledAmount !== undefined
                ? numFrom(item.cancelledAmount)
                : undefined,
          }))
      : undefined;

  const revenueBreakdown = parseLineBreakdown(p.revenueBreakdown);
  const cancelledSalesBreakdown = parseLineBreakdown(p.cancelledSalesBreakdown);
  const saleFeeBreakdown = parseLineBreakdown(p.saleFeeBreakdown);
  const sellerShippingBreakdown = parseLineBreakdown(p.sellerShippingBreakdown);
  const adsCostBreakdown = parseLineBreakdown(p.adsCostBreakdown);
  const partialReturnsBreakdown = parseLineBreakdown(p.partialReturnsBreakdown);
  const returnFeeBreakdown = parseLineBreakdown(p.returnFeeBreakdown);
  const specialFeesBreakdown = parseLineBreakdown(p.specialFeesBreakdown);
  const fullShippingBreakdown = parseLineBreakdown(p.fullShippingBreakdown);
  const fullStorageBreakdown = parseLineBreakdown(p.fullStorageBreakdown);
  const fullNonComplianceBreakdown = parseLineBreakdown(
    p.fullNonComplianceBreakdown,
  );
  const minhaPaginaBreakdown = parseLineBreakdown(p.minhaPaginaBreakdown);
  const affiliateFeeBreakdown = parseLineBreakdown(p.affiliateFeeBreakdown);

  const syncedLineBaselineRaw = p.syncedLineBaseline;
  let syncedLineBaseline:
    | Partial<Record<DreEditableLineKey, number>>
    | undefined;
  if (
    syncedLineBaselineRaw &&
    typeof syncedLineBaselineRaw === "object" &&
    !Array.isArray(syncedLineBaselineRaw)
  ) {
    const baseline: Partial<Record<DreEditableLineKey, number>> = {};
    for (const key of Object.keys(
      syncedLineBaselineRaw as Record<string, unknown>,
    )) {
      if (!isDreEditableLineKey(key)) continue;
      const n = numFrom((syncedLineBaselineRaw as Record<string, unknown>)[key]);
      baseline[key] = n;
    }
    syncedLineBaseline = baseline;
  }

  const syncedBreakdownRaw = p.syncedBreakdownBaseline;
  let syncedBreakdownBaseline:
    | DreMonthSnapshotPayload["syncedBreakdownBaseline"]
    | undefined;
  if (
    syncedBreakdownRaw &&
    typeof syncedBreakdownRaw === "object" &&
    !Array.isArray(syncedBreakdownRaw)
  ) {
    const raw = syncedBreakdownRaw as Record<string, unknown>;
    syncedBreakdownBaseline = {
      revenueBreakdown: parseLineBreakdown(raw.revenueBreakdown),
      cancelledSalesBreakdown: parseLineBreakdown(raw.cancelledSalesBreakdown),
      saleFeeBreakdown: parseLineBreakdown(raw.saleFeeBreakdown),
      sellerShippingBreakdown: parseLineBreakdown(raw.sellerShippingBreakdown),
      adsCostBreakdown: parseLineBreakdown(raw.adsCostBreakdown),
      partialReturnsBreakdown: parseLineBreakdown(raw.partialReturnsBreakdown),
      returnFeeBreakdown: parseLineBreakdown(raw.returnFeeBreakdown),
      specialFeesBreakdown: parseLineBreakdown(raw.specialFeesBreakdown),
      fullShippingBreakdown: parseLineBreakdown(raw.fullShippingBreakdown),
      fullStorageBreakdown: parseLineBreakdown(raw.fullStorageBreakdown),
      fullNonComplianceBreakdown: parseLineBreakdown(
        raw.fullNonComplianceBreakdown,
      ),
      minhaPaginaBreakdown: parseLineBreakdown(raw.minhaPaginaBreakdown),
      affiliateFeeBreakdown: parseLineBreakdown(raw.affiliateFeeBreakdown),
      productCostBreakdown: parseProductCostBreakdown(raw.productCostBreakdown),
      taxBreakdown: parseTaxBreakdown(raw.taxBreakdown),
    };
  }

  const reconciliation = parseReconciliationMeta(p.reconciliation);

  const manuallyEditedLineKeys = Array.isArray(p.manuallyEditedLineKeys)
    ? p.manuallyEditedLineKeys.filter(
        (key): key is DreEditableLineKey =>
          typeof key === "string" && isDreEditableLineKey(key),
      )
    : undefined;

  return {
    revenueMl: num("revenueMl"),
    cancelledSalesMl: num("cancelledSalesMl"),
    saleFeeMl: num("saleFeeMl"),
    partialReturnsMl: num("partialReturnsMl"),
    returnFeeMl: num("returnFeeMl"),
    specialFeesMl: num("specialFeesMl"),
    productCostErp: num("productCostErp"),
    taxErp: num("taxErp"),
    sellerShippingMl: num("sellerShippingMl"),
    fullShippingMl: num("fullShippingMl"),
    fullStorageMl: num("fullStorageMl"),
    fullNonComplianceMl: num("fullNonComplianceMl"),
    minhaPaginaMl: num("minhaPaginaMl"),
    affiliateFeeMl: num("affiliateFeeMl"),
    adsCost: num("adsCost"),
    billingSource:
      p.billingSource === "billing" ? "billing" : "fallback",
    isPartial: Boolean(p.isPartial),
    incompleteProductCostCount: Number(p.incompleteProductCostCount ?? 0),
    syncWarnings: Array.isArray(p.syncWarnings)
      ? p.syncWarnings.filter((w): w is string => typeof w === "string")
      : [],
    cancelledIncludeOverlay,
    productCostBreakdown,
    taxBreakdown,
    revenueBreakdown,
    cancelledSalesBreakdown,
    saleFeeBreakdown,
    sellerShippingBreakdown,
    adsCostBreakdown,
    partialReturnsBreakdown,
    returnFeeBreakdown,
    specialFeesBreakdown,
    fullShippingBreakdown,
    fullStorageBreakdown,
    fullNonComplianceBreakdown,
    minhaPaginaBreakdown,
    affiliateFeeBreakdown,
    fullReportSourced: Boolean(p.fullReportSourced),
    syncedLineBaseline,
    syncedBreakdownBaseline,
    manuallyEditedLineKeys,
    hasRealSyncBaseline: Boolean(p.hasRealSyncBaseline),
    reconciliation,
    taxSource: parseTaxSource(p.taxSource),
    keptFromPrevious: parseKeptFromPrevious(p.keptFromPrevious),
    lineAuditMismatches: parseLineAuditMismatches(p.lineAuditMismatches),
  };
}

function finiteOr(value: unknown, fallback: number): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function finiteOrNull(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function parseTaxRateSource(raw: unknown): DreTaxRateSource | undefined {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return undefined;
  const r = raw as Record<string, unknown>;
  if (r.kind === "kit_components") return { kind: "kit_components" };
  if (r.kind === "simples") return { kind: "simples" };
  if (r.kind === "report") {
    const year = Number(r.year);
    const month = Number(r.month);
    if (Number.isInteger(year) && Number.isInteger(month)) {
      return { kind: "report", year, month };
    }
  }
  return undefined;
}

function parseTaxSource(raw: unknown): DreTaxSource | undefined {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return undefined;
  const r = raw as Record<string, unknown>;
  const reportRaw = r.report;
  let report: DreTaxSource["report"] = null;
  if (reportRaw && typeof reportRaw === "object" && !Array.isArray(reportRaw)) {
    const rep = reportRaw as Record<string, unknown>;
    if (typeof rep.generatedAt === "string") {
      report = {
        generatedAt: rep.generatedAt,
        ordersFetchedAt:
          typeof rep.ordersFetchedAt === "string"
            ? rep.ordersFetchedAt
            : rep.generatedAt,
        revenue: finiteOr(rep.revenue, 0),
        tax: finiteOr(rep.tax, 0),
        orderCount: finiteOr(rep.orderCount, 0),
        legacy: Boolean(rep.legacy),
      };
    }
  }
  return {
    regime: r.regime === "SIMPLES" ? "SIMPLES" : "LUCRO_REAL",
    report,
    simplesRatePercent: finiteOrNull(r.simplesRatePercent),
    paidOrderCount: finiteOrNull(r.paidOrderCount),
    baseRevenue: finiteOr(r.baseRevenue, 0),
    computedTax: finiteOr(r.computedTax, 0),
    returnedPaidRevenue: finiteOr(r.returnedPaidRevenue, 0),
    returnedPaidTax: finiteOr(r.returnedPaidTax, 0),
    fallbackItemCount: finiteOr(r.fallbackItemCount, 0),
    missingItemCount: finiteOr(r.missingItemCount, 0),
    missingRevenue: finiteOr(r.missingRevenue, 0),
    computedAt: typeof r.computedAt === "string" ? r.computedAt : "",
    previousTaxErp: finiteOrNull(r.previousTaxErp),
    origin: r.origin === "refresh" ? "refresh" : "sync",
  };
}

function parseKeptFromPrevious(raw: unknown): DreKeptFromPrevious | undefined {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return undefined;
  const r = raw as Record<string, unknown>;
  const lineKeys = Array.isArray(r.lineKeys)
    ? r.lineKeys.filter(
        (key): key is DreEditableLineKey =>
          typeof key === "string" && isDreEditableLineKey(key),
      )
    : [];
  if (lineKeys.length === 0) return undefined;
  return {
    lineKeys,
    syncedAt: typeof r.syncedAt === "string" ? r.syncedAt : null,
  };
}

function parseLineAuditMismatches(
  raw: unknown,
): DreLineAuditMismatch[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const out: DreLineAuditMismatch[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const r = item as Record<string, unknown>;
    if (typeof r.lineKey !== "string" || !isDreEditableLineKey(r.lineKey)) {
      continue;
    }
    out.push({
      lineKey: r.lineKey,
      value: finiteOr(r.value, 0),
      auditSum: finiteOr(r.auditSum, 0),
      kind: r.kind === "zero_with_audit" ? "zero_with_audit" : "differs",
    });
  }
  return out.length > 0 ? out : undefined;
}

function parseReconciliationMeta(
  raw: unknown,
): DreMonthReconciliation | undefined {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return undefined;
  const r = raw as Record<string, unknown>;
  if (typeof r.importId !== "string" || !r.importId) return undefined;

  const amounts: Partial<Record<DreEditableLineKey, number>> = {};
  if (r.amounts && typeof r.amounts === "object" && !Array.isArray(r.amounts)) {
    for (const [key, value] of Object.entries(r.amounts)) {
      if (!isDreEditableLineKey(key)) continue;
      const n = Number(value);
      if (Number.isFinite(n)) amounts[key] = n;
    }
  }
  // Só chaves com valor: sem o valor da planilha não há o que reaplicar.
  const lineKeys = Array.isArray(r.lineKeys)
    ? r.lineKeys.filter(
        (key): key is DreEditableLineKey =>
          typeof key === "string" &&
          isDreEditableLineKey(key) &&
          amounts[key] !== undefined,
      )
    : [];

  return {
    importId: r.importId,
    reconciledAt: typeof r.reconciledAt === "string" ? r.reconciledAt : "",
    fileName: typeof r.fileName === "string" ? r.fileName : "",
    lineKeys,
    amounts,
  };
}
