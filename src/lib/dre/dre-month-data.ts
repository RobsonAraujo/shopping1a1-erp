import { stockPlanningConfig } from "@/config/stock-planning";
import { reportsConfig } from "@/config/reports";
import { prisma } from "@/lib/db";
import { logServerError } from "@/lib/server-public-error";
import {
  applyManualLineEdit,
  applyRestoreLineFromSync,
  computeDreTotals,
  isDreEditableLineKey,
  mergeLineBreakdowns,
  mergePreservedManualLines,
  mergeProductCostBreakdowns,
  mergeTaxBreakdowns,
  productCostAuditKey,
  type DreCancelledIncludeOverlay,
  type DreEditableLineKey,
  type DreLineBreakdownItem,
  type DreMonthSnapshotPayload,
  type DreProductCostBreakdownItem,
  type DreTaxBreakdownItem,
} from "@/lib/dre/dre-calculations";
import { loadProductsMapBySku } from "@/lib/product-data";
import { resolveEffectiveSkuByItemId } from "@/lib/product-resolver";
import { loadProductTaxFromLatestReport } from "@/lib/product-tax-from-report";
import { roundMoney } from "@/lib/financial-margin";
import { getItemSku, isKitItem } from "@/lib/mercadolibre/item-sku";
import { loadKitsByMlItemId, resolveKitPricing } from "@/lib/kit-data";
import { normalizeProductSku } from "@/lib/product-pricing";
import {
  applyLevelingsForOrderDate,
  loadLevelingsOverlappingMonth,
} from "@/lib/dre/dre-product-cost-leveling";
import {
  fetchCancelledOrderLinesInDateRange,
  fetchPaidOrdersByPeriod,
  fetchItemsByIdsBatched,
  paidOrderLinesFromOrders,
  splitOrderLinesByCancelledOrderIds,
  returnedPaidOrderIdsFromOrders,
  orderIdentityKeys,
} from "@/lib/mercadolibre/api";
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

async function computeErpCostsFromOrderLines(
  accessToken: string,
  sellerId: number,
  organizationId: string,
  orderLines: Array<{
    itemId: string;
    quantity: number;
    revenue: number;
    orderDateYmd?: string | null;
  }>,
  year: number,
  month: number,
): Promise<{
  productCostErp: number;
  taxErp: number;
  incompleteProductCostCount: number;
  missingTaxCount: number;
  taxFromDifferentPeriodCount: number;
  breakdown: DreProductCostBreakdownItem[];
  taxBreakdown: DreTaxBreakdownItem[];
  revenueBreakdown: DreLineBreakdownItem[];
}> {
  const itemIds = [...new Set(orderLines.map((line) => line.itemId))];
  const items = await fetchItemsByIdsBatched(accessToken, itemIds);
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
  const [pricingBySkuBase, taxFromReport, levelings] = await Promise.all([
    loadProductsMapBySku(organizationId, skus),
    loadProductTaxFromLatestReport(sellerId, undefined, { year, month }),
    loadLevelingsOverlappingMonth(organizationId, year, month),
  ]);
  const taxPercentBySku = new Map(
    [...taxFromReport.bySku].map(([sku, entry]) => [sku, entry.taxPercent]),
  );

  let productCostErp = 0;
  let taxErp = 0;
  let incompleteProductCostCount = 0;
  const missingItems = new Set<string>();
  const missingTaxItems = new Set<string>();
  const differentPeriodTaxItems = new Set<string>();
  const breakdownByKey = new Map<string, DreProductCostBreakdownItem>();
  const taxBreakdownByKey = new Map<string, DreTaxBreakdownItem>();
  const revenueBreakdownByKey = new Map<string, DreLineBreakdownItem>();

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

  function addToTaxBreakdown(
    key: string,
    sku: string | null,
    title: string,
    quantity: number,
    revenue: number,
    tax: number,
    missingTax: boolean,
  ) {
    const existing = taxBreakdownByKey.get(key);
    if (existing) {
      existing.quantity += quantity;
      existing.revenue = roundMoney(existing.revenue + revenue);
      existing.totalTax = roundMoney(existing.totalTax + tax);
      existing.taxPercent =
        existing.revenue > 0
          ? roundMoney((existing.totalTax / existing.revenue) * 100)
          : null;
      existing.missingTax = existing.missingTax || missingTax;
      return;
    }
    taxBreakdownByKey.set(key, {
      key,
      sku,
      title,
      quantity,
      revenue: roundMoney(revenue),
      taxPercent: revenue > 0 ? roundMoney((tax / revenue) * 100) : null,
      totalTax: roundMoney(tax),
      missingTax,
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
    const pricing = normalizedSku ? pricingBySku.get(normalizedSku) : undefined;
    const taxEntry = normalizedSku
      ? (taxFromReport.bySku.get(normalizedSku) ?? null)
      : null;
    const taxPercent = taxEntry?.taxPercent ?? null;
    const item = itemById.get(line.itemId);
    const title = item?.title ?? line.itemId;

    addToRevenueBreakdown(
      normalizedSku || `item:${line.itemId}`,
      sku ?? null,
      title,
      line.quantity,
      line.revenue,
    );

    if (pricing) {
      const cost = line.quantity * pricing.pricingCost;
      productCostErp += cost;
      addToBreakdown(
        normalizedSku,
        sku ?? null,
        title,
        line.quantity,
        cost,
        false,
        leveledSkus.has(normalizedSku),
      );
      if (taxPercent !== null && taxPercent > 0 && line.revenue > 0) {
        const tax = line.revenue * (taxPercent / 100);
        taxErp += tax;
        addToTaxBreakdown(
          normalizedSku,
          sku ?? null,
          title,
          line.quantity,
          line.revenue,
          tax,
          false,
        );
      } else {
        addToTaxBreakdown(
          normalizedSku,
          sku ?? null,
          title,
          line.quantity,
          line.revenue,
          0,
          taxEntry === null,
        );
      }
      if (taxEntry === null) {
        missingTaxItems.add(line.itemId);
      } else if (taxEntry.year !== year || taxEntry.month !== month) {
        differentPeriodTaxItems.add(line.itemId);
      }
      continue;
    }

    const kitComponents = item ? kitsByMlItemId.get(item.id) : undefined;
    if (!normalizedSku && item && isKitItem(item) && kitComponents) {
      const resolved = resolveKitPricing(
        kitComponents,
        pricingBySku,
        taxPercentBySku,
      );
      if (resolved.missingSkus.length === 0) {
        const cost = line.quantity * resolved.productCost;
        productCostErp += cost;
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
        if (resolved.taxRatePercent !== null && line.revenue > 0) {
          const tax = line.revenue * (resolved.taxRatePercent / 100);
          taxErp += tax;
          addToTaxBreakdown(
            `kit:${item.id}`,
            null,
            title,
            line.quantity,
            line.revenue,
            tax,
            false,
          );
        } else {
          addToTaxBreakdown(
            `kit:${item.id}`,
            null,
            title,
            line.quantity,
            line.revenue,
            0,
            true,
          );
          missingTaxItems.add(line.itemId);
        }
        continue;
      }
    }

    addToBreakdown(
      `missing:${line.itemId}`,
      sku ?? null,
      title,
      line.quantity,
      0,
      true,
    );
    addToTaxBreakdown(
      `missing:${line.itemId}`,
      sku ?? null,
      title,
      line.quantity,
      line.revenue,
      0,
      true,
    );
    missingItems.add(line.itemId);
  }

  incompleteProductCostCount = missingItems.size;

  return {
    productCostErp: roundMoney(-Math.max(0, productCostErp)),
    taxErp: roundMoney(-Math.max(0, taxErp)),
    incompleteProductCostCount,
    missingTaxCount: missingTaxItems.size,
    taxFromDifferentPeriodCount: differentPeriodTaxItems.size,
    breakdown: [...breakdownByKey.values()].sort(
      (a, b) => b.totalCost - a.totalCost,
    ),
    taxBreakdown: [...taxBreakdownByKey.values()].sort(
      (a, b) => b.totalTax - a.totalTax,
    ),
    revenueBreakdown: [...revenueBreakdownByKey.values()].sort(
      (a, b) => b.amount - a.amount,
    ),
  };
}

async function estimateMlCostsFallback(
  accessToken: string,
  sellerId: number,
  organizationId: string,
  from: Date,
  to: Date,
  orderLines: Array<{ itemId: string; quantity: number; revenue: number }>,
): Promise<{
  saleFeeMl: number;
  sellerShippingMl: number;
  cancelledSalesMl: number;
  partialReturnsMl: number;
  fullShippingMl: number;
  fullStorageMl: number;
  fullNonComplianceMl: number;
  saleFeeBreakdown: DreLineBreakdownItem[];
  sellerShippingBreakdown: DreLineBreakdownItem[];
}> {
  const cancelledLines = await fetchCancelledOrderLinesInDateRange(
    accessToken,
    sellerId,
    from,
    to,
    stockPlanningConfig.salesWindowDateField,
  );
  const cancelledRevenue = roundMoney(
    cancelledLines.reduce((sum, line) => sum + line.revenue, 0),
  );

  const itemIds = [...new Set(orderLines.map((line) => line.itemId))];
  const items = await fetchItemsByIdsBatched(accessToken, itemIds);
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
    const key = sku ? normalizeProductSku(sku) : `item:${line.itemId}`;
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
    cancelledSalesMl: roundMoney(-Math.max(0, cancelledRevenue)),
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

  return { orderLines, revenueMl, orderIds, returnedByTagIds };
}

export async function buildDreMonthSnapshot(
  accessToken: string,
  sellerId: number,
  organizationId: string,
  year: number,
  month: number,
  options: BuildDreMonthSnapshotOptions = {},
): Promise<DreMonthSnapshotPayload> {
  const timeZone = reportsConfig.catalogCompetitionTimezone;
  const calendarRange = getCalendarMonthRange(year, month, timeZone);
  const syncWarnings: string[] = [];
  const fullDetailsCache =
    options.fullDetailsCache ?? createFullBillingDetailsCache();
  const report = (progress: DreSyncProgress) => {
    options.onProgress?.(progress);
  };

  report({ phase: "billing", message: "Buscando fatura e pedidos do ML…" });

  const [billingResult, orderResult] = await Promise.all([
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
  ]);

  const billing = billingResult;
  const { orderLines, revenueMl: ordersRevenueMl, orderIds, returnedByTagIds } =
    orderResult;
  const revenueMl = ordersRevenueMl;

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

  const adsPromise = (async () => {
      let adsCost = 0;
      let adsCostBreakdown: DreLineBreakdownItem[] | undefined;
      try {
        const advertiserId = await fetchPadsAdvertiserId(accessToken);
        if (advertiserId !== null) {
          const { dateFrom, dateTo } = getProductAdsDateRangeForMonth(
            year,
            month,
          );
          if (!isProductAdsMetricsRangeAvailable(dateFrom)) {
            if (billing && billing.adsCost > 0 && billingAlignsWithCivil) {
              adsCost = billing.adsCost;
              adsCostBreakdown = undefined;
            } else {
              syncWarnings.push(
                "Campanhas ADS: a API do ML só cobre os últimos 90 dias; neste mês o detalhe por anúncio não está disponível.",
              );
            }
            return { adsCost, adsCostBreakdown };
          }
          const adsMetrics = await fetchProductAdsMetricsByItem(accessToken, {
            advertiserId,
            siteId: "MLB",
            dateFrom,
            dateTo,
          });
          adsCost = roundMoney(
            [...adsMetrics.values()].reduce((sum, row) => sum + row.cost, 0),
          );
          const adsItemIds = [...adsMetrics.keys()].filter(
            (id) => (adsMetrics.get(id)?.cost ?? 0) !== 0,
          );
          const adsItems = await fetchItemsByIdsBatched(accessToken, adsItemIds);
          const adsItemById = new Map(adsItems.map((item) => [item.id, item]));
          const adsSkuByItemId = await resolveEffectiveSkuByItemId(
            organizationId,
            adsItems.map((item) => ({ id: item.id, sku: getItemSku(item) })),
          );
          adsCostBreakdown = adsItemIds
            .map((itemId) => {
              const metrics = adsMetrics.get(itemId)!;
              const sku = adsSkuByItemId.get(itemId) ?? null;
              const title = adsItemById.get(itemId)?.title ?? itemId;
              return {
                key: sku ? normalizeProductSku(sku) : `item:${itemId}`,
                sku,
                title,
                quantity: metrics.unitsQuantity,
                amount: roundMoney(-metrics.cost),
              };
            })
            .sort((a, b) => a.amount - b.amount);
        }
      } catch (error) {
        const lookbackLimited = isProductAdsLookbackLimitError(error);
        if (!lookbackLimited) {
          logServerError("dre-month-data ads", error);
        }
        if (billing && billing.adsCost > 0 && billingAlignsWithCivil) {
          adsCost = billing.adsCost;
          adsCostBreakdown = undefined;
        } else if (lookbackLimited) {
          syncWarnings.push(
            "Campanhas ADS: a API do ML só cobre os últimos 90 dias; neste mês o detalhe por anúncio não está disponível.",
          );
        } else {
          syncWarnings.push(
            "Não foi possível carregar o gasto com campanhas ADS neste mês.",
          );
        }
      }
      return { adsCost, adsCostBreakdown };
    })();

  report({ phase: "ml_costs", message: "Mapeando custos ML…" });

  let saleFeeMl = 0;
  let sellerShippingMl = 0;
  let cancelledSalesMl = 0;
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
    cancelledSalesMl = billing!.cancelledSales;
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
          cancelledSalesMl = civil.cancelledSalesMl;
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
          calendarRange.from,
          calendarRange.to,
          orderLines,
        );
        saleFeeMl = fallback.saleFeeMl;
        sellerShippingMl = fallback.sellerShippingMl;
        cancelledSalesMl = fallback.cancelledSalesMl;
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
    } else if (cancelledSalesMl === 0) {
      cancelledSalesMl = billing!.cancelledSales;
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
          cancelledSalesMl = civil.cancelledSalesMl;
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
          calendarRange.from,
          calendarRange.to,
          orderLines,
        );
        saleFeeMl = fallback.saleFeeMl;
        sellerShippingMl = fallback.sellerShippingMl;
        cancelledSalesMl = fallback.cancelledSalesMl;
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

  const [adsResult, erpCosts] = await Promise.all([
    adsPromise,
    computeErpCostsFromOrderLines(
      accessToken,
      sellerId,
      organizationId,
      activeLines,
      year,
      month,
    ),
  ]);
  const { adsCost } = adsResult;
  let adsCostBreakdown = adsResult.adsCostBreakdown;

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
    if (!adsCostBreakdown && (billingLineLists.adsCost?.length ?? 0) > 0) {
      adsCostBreakdown = billingLineLists.adsCost;
    }
  }

  report({
    phase: "full",
    message:
      "Conferindo Relatório Full (envios/inconformidade) e pedidos cancelados…",
  });

  if (erpCosts.incompleteProductCostCount > 0) {
    syncWarnings.push(
      `${erpCosts.incompleteProductCostCount} anúncio(s) sem preço de compra no estoque.`,
    );
  }
  if (erpCosts.missingTaxCount > 0) {
    syncWarnings.push(
      `${erpCosts.missingTaxCount} anúncio(s) sem relatório tributário apurado até ${String(month).padStart(2, "0")}/${year} — linha de Imposto ficou subestimada para eles.`,
    );
  }
  if (erpCosts.taxFromDifferentPeriodCount > 0) {
    syncWarnings.push(
      `${erpCosts.taxFromDifferentPeriodCount} anúncio(s) usaram % de imposto de um mês diferente (sem apuração tributária própria em ${String(month).padStart(2, "0")}/${year}).`,
    );
  }

  let fullReportSourced = false;
  let cancelledIncludeOverlay: DreCancelledIncludeOverlay | undefined;
  let cancelledBreakdown: DreProductCostBreakdownItem[] = [];
  let cancelledTaxBreakdown: DreTaxBreakdownItem[] = [];
  let cancelledOrderRevenueBreakdown: DreLineBreakdownItem[] = [];

  // "Full" e "cancelados" são independentes entre si (nenhum lê o resultado
  // do outro) — rodam em paralelo pra reduzir o tempo total do sync.
  await Promise.all([
    (async () => {
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
            logServerError(
              "dre-month-data full-report-auto-import",
              importError,
            );
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
    })(),
    (async () => {
      try {
        const cancelledLines = await fetchCancelledOrderLinesInDateRange(
          accessToken,
          sellerId,
          calendarRange.from,
          calendarRange.to,
          stockPlanningConfig.salesWindowDateField,
        );
        const overlayLines = [...cancelledLines, ...returnedOnInvoiceLines];
        if (overlayLines.length > 0) {
          const overlayErpCosts = await computeErpCostsFromOrderLines(
            accessToken,
            sellerId,
            organizationId,
            overlayLines,
            year,
            month,
          );
          if (cancelledLines.length > 0) {
            const revenueGross = roundMoney(
              cancelledLines.reduce((sum, line) => sum + line.revenue, 0),
            );
            cancelledIncludeOverlay = {
              revenueGross,
              productCostErp: overlayErpCosts.productCostErp,
              taxErp: overlayErpCosts.taxErp,
            };
          }
          // Anotados na mesma linha do produto (cancelledQuantity/cancelledCost),
          // sem entrar em quantity/totalCost — ver applyDreIncludeCancelledView.
          cancelledBreakdown = overlayErpCosts.breakdown.map((item) => ({
            ...item,
            quantity: 0,
            totalCost: 0,
            unitCost: 0,
            cancelledQuantity: item.quantity,
            cancelledCost: item.totalCost,
          }));
          cancelledTaxBreakdown = overlayErpCosts.taxBreakdown.map((item) => ({
            ...item,
            quantity: 0,
            revenue: 0,
            totalTax: 0,
            taxPercent: null,
            cancelledQuantity: item.quantity,
            cancelledRevenue: item.revenue,
            cancelledTax: item.totalTax,
          }));
          cancelledOrderRevenueBreakdown = overlayErpCosts.revenueBreakdown;
        }
      } catch (error) {
        logServerError("dre-month-data cancelled overlay", error);
      }
    })(),
  ]);

  return {
    revenueMl,
    cancelledSalesMl,
    saleFeeMl,
    partialReturnsMl,
    returnFeeMl,
    specialFeesMl,
    productCostErp: erpCosts.productCostErp,
    taxErp: erpCosts.taxErp,
    sellerShippingMl,
    fullShippingMl,
    fullStorageMl,
    fullNonComplianceMl,
    minhaPaginaMl,
    affiliateFeeMl,
    adsCost,
    billingSource,
    isPartial,
    incompleteProductCostCount: erpCosts.incompleteProductCostCount,
    syncWarnings,
    cancelledIncludeOverlay,
    productCostBreakdown: mergeProductCostBreakdowns([
      erpCosts.breakdown,
      cancelledBreakdown,
    ]),
    taxBreakdown: mergeTaxBreakdowns([
      erpCosts.taxBreakdown,
      cancelledTaxBreakdown,
    ]),
    // A receita de pedidos cancelados conta normalmente em `amount` (o
    // painel ML inclui canceladas no faturamento bruto — ver
    // applyDreIncludeCancelledView) e fica também anotada em
    // `cancelledAmount`, na mesma linha do produto, só para transparência.
    // Sem isso a lista não bateria com o total de Faturamento ML exibido.
    revenueBreakdown: mergeLineBreakdowns([
      erpCosts.revenueBreakdown,
      cancelledOrderRevenueBreakdown.map((item) => ({
        ...item,
        cancelledQuantity: item.quantity,
        cancelledAmount: item.amount,
      })),
    ]),
    cancelledSalesBreakdown: cancelledOrderRevenueBreakdown.length
      ? cancelledOrderRevenueBreakdown
          .map((item) => ({
            ...item,
            amount: roundMoney(-item.amount),
          }))
          .sort((a, b) => a.amount - b.amount)
      : cancelledSalesBreakdownFromBilling,
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
  };
}

export async function persistDreMonthSnapshot(
  organizationId: string,
  year: number,
  month: number,
  payload: DreMonthSnapshotPayload,
  preserveLineKeys: readonly DreEditableLineKey[] = [],
): Promise<Date> {
  const syncedAt = new Date();

  const existing = await prisma.dreMonthSnapshot.findUnique({
    where: { organizationId_year_month: { organizationId, year, month } },
    select: { payload: true },
  });
  const previous = existing ? parseSnapshotPayload(existing.payload) : null;
  const merged = mergePreservedManualLines(
    payload,
    previous,
    preserveLineKeys,
  );

  await prisma.dreMonthSnapshot.upsert({
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
  return syncedAt;
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
  };
}
