import { stockPlanningConfig } from "@/config/stock-planning";
import { reportsConfig } from "@/config/reports";
import { prisma } from "@/lib/db";
import { logServerError } from "@/lib/server-public-error";
import {
  applyManualLineEdit,
  applyRestoreLineFromSync,
  computeDreTotals,
  isDreEditableLineKey,
  mergePreservedManualLines,
  mergeProductCostBreakdowns,
  mergeTaxBreakdowns,
  type DreCancelledIncludeOverlay,
  type DreEditableLineKey,
  type DreLineBreakdownItem,
  type DreMonthSnapshotPayload,
  type DreProductCostBreakdownItem,
  type DreTaxBreakdownItem,
} from "@/lib/dre/dre-calculations";
import { loadProductsMapBySku } from "@/lib/product-data";
import { loadProductTaxFromLatestReport } from "@/lib/product-tax-from-report";
import { roundMoney } from "@/lib/financial-margin";
import { getItemSku, isKitItem } from "@/lib/mercadolibre/item-sku";
import { loadKitsByMlItemId, resolveKitPricing } from "@/lib/kit-data";
import { normalizeProductSku } from "@/lib/product-pricing";
import {
  fetchCancelledOrderLinesInDateRange,
  fetchCancelledOrderRevenueInDateRange,
  fetchOrderMetricsByItemInDateRange,
  fetchPaidOrderLinesInDateRange,
  fetchItemsByIdsBatched,
} from "@/lib/mercadolibre/api";
import {
  fetchMlBillingSummaryForMonth,
  isBillingSummaryEmpty,
} from "@/lib/mercadolibre/billing-summary";
import { listFullShipmentsForPeriod, importFullCollectChargesFromBilling } from "@/lib/envios-full/full-shipment-data";
import {
  fetchListingSaleFee,
  siteIdFromItemId,
} from "@/lib/mercadolibre/listing-fees";
import {
  fetchPadsAdvertiserId,
  fetchProductAdsMetricsByItem,
  getProductAdsDateRangeForMonth,
} from "@/lib/mercadolibre/product-ads-metrics";
import {
  formatCalendarRangeYmd,
  getCalendarMonthRange,
  isCurrentCalendarMonth,
  isMlBillingPeriodCivilMonth,
  type CalendarDateRange,
} from "@/lib/mercadolibre/revenue-periods";
import { fetchSellerShippingCost } from "@/lib/mercadolibre/seller-shipping-cost";

async function computeErpCostsFromOrderLines(
  accessToken: string,
  sellerId: number,
  orderLines: Array<{ itemId: string; quantity: number; revenue: number }>,
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
  const skuByItemId = new Map(
    items.map((item) => [item.id, getItemSku(item)]),
  );
  const kitItemIds = items
    .filter((item) => !getItemSku(item) && isKitItem(item))
    .map((item) => item.id);
  const kitsByMlItemId = await loadKitsByMlItemId(kitItemIds);
  const kitComponentSkus = [...kitsByMlItemId.values()].flatMap((components) =>
    components.map((c) => c.sku),
  );
  const skus = items
    .map((item) => getItemSku(item))
    .filter((sku): sku is string => Boolean(sku))
    .map((sku) => normalizeProductSku(sku))
    .concat(kitComponentSkus);
  const [pricingBySku, taxFromReport] = await Promise.all([
    loadProductsMapBySku(skus),
    loadProductTaxFromLatestReport(sellerId, undefined, { year, month }),
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
    key: string,
    sku: string | null,
    title: string,
    quantity: number,
    cost: number,
    missingCost: boolean,
  ) {
    const existing = breakdownByKey.get(key);
    if (existing) {
      existing.quantity += quantity;
      existing.totalCost = roundMoney(existing.totalCost + cost);
      existing.unitCost =
        existing.quantity > 0
          ? roundMoney(existing.totalCost / existing.quantity)
          : 0;
      existing.missingCost = existing.missingCost || missingCost;
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
      addToBreakdown(normalizedSku, sku ?? null, title, line.quantity, cost, false);
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
        addToBreakdown(
          `kit:${item.id}`,
          null,
          title,
          line.quantity,
          cost,
          false,
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
  const cancelledRevenue = await fetchCancelledOrderRevenueInDateRange(
    accessToken,
    sellerId,
    from,
    to,
    stockPlanningConfig.salesWindowDateField,
  );

  const itemIds = [...new Set(orderLines.map((line) => line.itemId))];
  const items = await fetchItemsByIdsBatched(accessToken, itemIds);
  const itemById = new Map(items.map((item) => [item.id, item]));
  const skuByItemId = new Map(items.map((item) => [item.id, getItemSku(item)]));

  const feeCache = new Map<string, number>();
  const shippingCache = new Map<string, number>();

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

  for (const line of orderLines) {
    const item = itemById.get(line.itemId);
    if (!item || line.quantity <= 0) continue;

    const sku = skuByItemId.get(line.itemId) ?? null;
    const key = sku ? normalizeProductSku(sku) : `item:${line.itemId}`;
    const title = item.title ?? line.itemId;

    const unitPrice =
      line.quantity > 0 ? line.revenue / line.quantity : item.price;
    const feeKey = `${line.itemId}:${roundMoney(unitPrice)}`;
    let unitFee = feeCache.get(feeKey);
    if (unitFee === undefined) {
      unitFee = 0;
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
    }
    const feeAmount = unitFee * line.quantity;
    saleFeeTotal += feeAmount;
    addToLineBreakdown(
      saleFeeBreakdownByKey,
      key,
      sku,
      title,
      line.quantity,
      -feeAmount,
    );

    const shipKey = line.itemId;
    let unitShip = shippingCache.get(shipKey);
    if (unitShip === undefined) {
      unitShip = 0;
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
    }
    const shipAmount = unitShip * line.quantity;
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
  const [orderMetrics, orderLines] = await Promise.all([
    fetchOrderMetricsByItemInDateRange(
      accessToken,
      sellerId,
      range.from,
      range.to,
      dateField,
    ),
    fetchPaidOrderLinesInDateRange(
      accessToken,
      sellerId,
      range.from,
      range.to,
      dateField,
    ),
  ]);

  const revenueMl = roundMoney(
    Object.values(orderMetrics.revenueByItem).reduce((sum, n) => sum + n, 0),
  );

  return { orderLines, revenueMl };
}

export async function buildDreMonthSnapshot(
  accessToken: string,
  sellerId: number,
  year: number,
  month: number,
): Promise<DreMonthSnapshotPayload> {
  const timeZone = reportsConfig.catalogCompetitionTimezone;
  const calendarRange = getCalendarMonthRange(year, month, timeZone);
  const syncWarnings: string[] = [];

  let billing: Awaited<ReturnType<typeof fetchMlBillingSummaryForMonth>> = null;
  try {
    billing = await fetchMlBillingSummaryForMonth(accessToken, year, month);
  } catch (error) {
    logServerError("dre-month-data billing", error);
    syncWarnings.push(
      "API de faturamento ML indisponível; tarifas estimadas pelos pedidos.",
    );
  }

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

  const { orderLines, revenueMl: ordersRevenueMl } =
    await fetchOrderDataForRange(accessToken, sellerId, calendarRange);

  const revenueMl = ordersRevenueMl;

  let adsCost = 0;
  let adsCostBreakdown: DreLineBreakdownItem[] | undefined;
  try {
    const advertiserId = await fetchPadsAdvertiserId(accessToken);
    if (advertiserId !== null) {
      const { dateFrom, dateTo } = getProductAdsDateRangeForMonth(year, month);
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
      const adsSkuByItemId = new Map(
        adsItems.map((item) => [item.id, getItemSku(item)]),
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
    logServerError("dre-month-data ads", error);
    if (billing && billing.adsCost > 0 && billingAlignsWithCivil) {
      adsCost = billing.adsCost;
      adsCostBreakdown = undefined;
    } else {
      syncWarnings.push(
        "Não foi possível carregar o gasto com campanhas ADS neste mês.",
      );
    }
  }

  const erpCosts = await computeErpCostsFromOrderLines(
    accessToken,
    sellerId,
    orderLines,
    year,
    month,
  );

  let saleFeeMl = 0;
  let sellerShippingMl = 0;
  let cancelledSalesMl = 0;
  let partialReturnsMl = 0;
  let fullShippingMl = 0;
  let fullStorageMl = 0;
  let fullNonComplianceMl = 0;
  let minhaPaginaMl = 0;
  let affiliateFeeMl = 0;
  let saleFeeBreakdown: DreLineBreakdownItem[] | undefined;
  let sellerShippingBreakdown: DreLineBreakdownItem[] | undefined;
  let billingSource: DreMonthSnapshotPayload["billingSource"] = "fallback";
  let isPartial = isCurrentCalendarMonth(year, month);

  const billingHasMappedLines =
    billing !== null && !isBillingSummaryEmpty(billing);

  if (billingHasMappedLines && billingAlignsWithCivil) {
    billingSource = "billing";
    saleFeeMl = billing!.saleFee;
    sellerShippingMl = billing!.sellerShipping;
    cancelledSalesMl = billing!.cancelledSales;
    partialReturnsMl = billing!.partialReturns;
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
      const fallback = await estimateMlCostsFallback(
        accessToken,
        sellerId,
        calendarRange.from,
        calendarRange.to,
        orderLines,
      );
      saleFeeMl = fallback.saleFeeMl;
      sellerShippingMl = fallback.sellerShippingMl;
      cancelledSalesMl = fallback.cancelledSalesMl;
      // Devoluções parciais não têm estimativa por pedido — manter da fatura
      // (mesmo padrão de Full / Minha Página / Afiliados).
      partialReturnsMl = billing!.partialReturns;
      fullShippingMl = billing!.fullShipping;
      fullStorageMl = billing!.fullStorage;
      fullNonComplianceMl = billing!.fullNonCompliance;
      minhaPaginaMl = billing!.minhaPagina;
      affiliateFeeMl = billing!.affiliateFee;
      saleFeeBreakdown = fallback.saleFeeBreakdown;
      sellerShippingBreakdown = fallback.sellerShippingBreakdown;
      syncWarnings.push(
        "Custos Full (envios, armazenamento, inconformidades) e devoluções parciais da fatura ML do ciclo próximo a este mês.",
      );
    } catch (error) {
      logServerError("dre-month-data ml-fallback", error);
      syncWarnings.push(
        "Não foi possível estimar tarifas e frete do Mercado Livre.",
      );
      // Mesmo com falha no fallback de pedidos, preserve o que a fatura trouxe.
      partialReturnsMl = billing!.partialReturns;
      fullShippingMl = billing!.fullShipping;
      fullStorageMl = billing!.fullStorage;
      fullNonComplianceMl = billing!.fullNonCompliance;
      minhaPaginaMl = billing!.minhaPagina;
      affiliateFeeMl = billing!.affiliateFee;
    }
  } else {
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

  // Full envios/inconformidade: preferir o Relatório Full (tabela full_shipments).
  // Se o mês ainda não foi importado, roda o mesmo fluxo do botão "Importar"
  // (Fulfillment ops + fatura full/details → grava full_shipments) e só então
  // soma. Sem isso, cairíamos no total consolidado da fatura (menos preciso).
  let fullReportSourced = false;
  try {
    let fullShipmentRecords = await listFullShipmentsForPeriod(year, month);
    let autoImported = false;

    if (fullShipmentRecords.length === 0) {
      try {
        const imported = await importFullCollectChargesFromBilling(
          accessToken,
          sellerId,
          year,
          month,
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

  let cancelledIncludeOverlay: DreCancelledIncludeOverlay | undefined;
  let cancelledBreakdown: DreProductCostBreakdownItem[] = [];
  let cancelledTaxBreakdown: DreTaxBreakdownItem[] = [];
  let cancelledOrderRevenueBreakdown: DreLineBreakdownItem[] = [];
  try {
    const cancelledLines = await fetchCancelledOrderLinesInDateRange(
      accessToken,
      sellerId,
      calendarRange.from,
      calendarRange.to,
      stockPlanningConfig.salesWindowDateField,
    );
    if (cancelledLines.length > 0) {
      const revenueGross = roundMoney(
        cancelledLines.reduce((sum, line) => sum + line.revenue, 0),
      );
      const cancelledErpCosts = await computeErpCostsFromOrderLines(
        accessToken,
        sellerId,
        cancelledLines,
        year,
        month,
      );
      cancelledIncludeOverlay = {
        revenueGross,
        productCostErp: cancelledErpCosts.productCostErp,
        taxErp: cancelledErpCosts.taxErp,
      };
      cancelledBreakdown = cancelledErpCosts.breakdown;
      cancelledTaxBreakdown = cancelledErpCosts.taxBreakdown;
      cancelledOrderRevenueBreakdown = cancelledErpCosts.revenueBreakdown;
    }
  } catch (error) {
    logServerError("dre-month-data cancelled overlay", error);
  }

  return {
    revenueMl,
    cancelledSalesMl,
    saleFeeMl,
    partialReturnsMl,
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
    revenueBreakdown: erpCosts.revenueBreakdown,
    cancelledSalesBreakdown: cancelledOrderRevenueBreakdown
      .map((item) => ({
        ...item,
        amount: roundMoney(-item.amount),
      }))
      .sort((a, b) => a.amount - b.amount),
    saleFeeBreakdown,
    sellerShippingBreakdown,
    adsCostBreakdown,
    fullReportSourced,
  };
}

export async function persistDreMonthSnapshot(
  year: number,
  month: number,
  payload: DreMonthSnapshotPayload,
  preserveLineKeys: readonly DreEditableLineKey[] = [],
): Promise<Date> {
  const syncedAt = new Date();

  const existing = await prisma.dreMonthSnapshot.findUnique({
    where: { year_month: { year, month } },
    select: { payload: true },
  });
  const previous = existing ? parseSnapshotPayload(existing.payload) : null;
  const merged = mergePreservedManualLines(
    payload,
    previous,
    preserveLineKeys,
  );

  await prisma.dreMonthSnapshot.upsert({
    where: { year_month: { year, month } },
    create: {
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
    where: { year_month: { year, month } },
  });

  const base =
    (existing ? parseSnapshotPayload(existing.payload) : null) ??
    emptyDreMonthSnapshotPayload();

  const next = applyManualLineEdit(base, lineKey, amount);

  const syncedAt = existing?.syncedAt ?? new Date();
  await prisma.dreMonthSnapshot.upsert({
    where: { year_month: { year, month } },
    create: {
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
  year: number,
  month: number,
  lineKey: DreEditableLineKey,
): Promise<Date> {
  if (!isDreEditableLineKey(lineKey)) {
    throw new Error(`Linha DRE não editável: ${lineKey}`);
  }

  const existing = await prisma.dreMonthSnapshot.findUnique({
    where: { year_month: { year, month } },
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
    where: { year_month: { year, month } },
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

  const breakdownRaw = p.productCostBreakdown;
  const productCostBreakdown = Array.isArray(breakdownRaw)
    ? breakdownRaw
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
        }))
    : undefined;

  const taxBreakdownRaw = p.taxBreakdown;
  const taxBreakdown = Array.isArray(taxBreakdownRaw)
    ? taxBreakdownRaw
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
        }))
    : undefined;

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
          }))
      : undefined;

  const revenueBreakdown = parseLineBreakdown(p.revenueBreakdown);
  const cancelledSalesBreakdown = parseLineBreakdown(p.cancelledSalesBreakdown);
  const saleFeeBreakdown = parseLineBreakdown(p.saleFeeBreakdown);
  const sellerShippingBreakdown = parseLineBreakdown(p.sellerShippingBreakdown);
  const adsCostBreakdown = parseLineBreakdown(p.adsCostBreakdown);

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
    fullReportSourced: Boolean(p.fullReportSourced),
    syncedLineBaseline,
    manuallyEditedLineKeys,
  };
}
