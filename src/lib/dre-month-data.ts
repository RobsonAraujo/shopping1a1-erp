import { stockPlanningConfig } from "@/config/stock-planning";
import { reportsConfig } from "@/config/reports";
import { prisma } from "@/lib/db";
import { logServerError } from "@/lib/server-public-error";
import {
  computeDreTotals,
  type DreCancelledIncludeOverlay,
  type DreMonthSnapshotPayload,
} from "@/lib/dre-calculations";
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
import {
  fetchListingSaleFee,
  siteIdFromItemId,
} from "@/lib/mercadolibre/listing-fees";
import { fetchTotalAdsCostForMonth } from "@/lib/mercadolibre/product-ads-metrics";
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

  for (const line of orderLines) {
    const sku = skuByItemId.get(line.itemId);
    const normalizedSku = sku ? normalizeProductSku(sku) : "";
    const pricing = normalizedSku ? pricingBySku.get(normalizedSku) : undefined;
    const taxEntry = normalizedSku
      ? (taxFromReport.bySku.get(normalizedSku) ?? null)
      : null;
    const taxPercent = taxEntry?.taxPercent ?? null;

    if (pricing) {
      productCostErp +=
        line.quantity * (pricing.pricingCost + pricing.extraCosts);
      if (taxPercent !== null && taxPercent > 0 && line.revenue > 0) {
        taxErp += line.revenue * (taxPercent / 100);
      }
      if (taxEntry === null) {
        missingTaxItems.add(line.itemId);
      } else if (taxEntry.year !== year || taxEntry.month !== month) {
        differentPeriodTaxItems.add(line.itemId);
      }
      continue;
    }

    const item = itemById.get(line.itemId);
    const kitComponents = item ? kitsByMlItemId.get(item.id) : undefined;
    if (!normalizedSku && item && isKitItem(item) && kitComponents) {
      const resolved = resolveKitPricing(
        kitComponents,
        pricingBySku,
        taxPercentBySku,
      );
      if (resolved.missingSkus.length === 0) {
        productCostErp += line.quantity * (resolved.productCost + resolved.extraCosts);
        if (resolved.taxRatePercent !== null && line.revenue > 0) {
          taxErp += line.revenue * (resolved.taxRatePercent / 100);
        } else {
          missingTaxItems.add(line.itemId);
        }
        continue;
      }
    }

    missingItems.add(line.itemId);
  }

  incompleteProductCostCount = missingItems.size;

  return {
    productCostErp: roundMoney(-Math.max(0, productCostErp)),
    taxErp: roundMoney(-Math.max(0, taxErp)),
    incompleteProductCostCount,
    missingTaxCount: missingTaxItems.size,
    taxFromDifferentPeriodCount: differentPeriodTaxItems.size,
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

  const feeCache = new Map<string, number>();
  const shippingCache = new Map<string, number>();

  let saleFeeTotal = 0;
  let shippingTotal = 0;

  for (const line of orderLines) {
    const item = itemById.get(line.itemId);
    if (!item || line.quantity <= 0) continue;

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
    saleFeeTotal += unitFee * line.quantity;

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
    shippingTotal += unitShip * line.quantity;
  }

  return {
    saleFeeMl: roundMoney(-Math.max(0, saleFeeTotal)),
    sellerShippingMl: roundMoney(-Math.max(0, shippingTotal)),
    cancelledSalesMl: roundMoney(-Math.max(0, cancelledRevenue)),
    partialReturnsMl: 0,
    fullShippingMl: 0,
    fullStorageMl: 0,
    fullNonComplianceMl: 0,
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
  try {
    adsCost = await fetchTotalAdsCostForMonth(accessToken, year, month);
  } catch (error) {
    logServerError("dre-month-data ads", error);
    if (billing && billing.adsCost > 0 && billingAlignsWithCivil) {
      adsCost = billing.adsCost;
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
    if (billing!.detailsUsed) {
      syncWarnings.push(
        "Custos ML carregados do detalhamento de faturamento (/group/ML/details).",
      );
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
      partialReturnsMl = fallback.partialReturnsMl;
      fullShippingMl = billing!.fullShipping;
      fullStorageMl = billing!.fullStorage;
      fullNonComplianceMl = billing!.fullNonCompliance;
      syncWarnings.push(
        "Custos Full (envios, armazenamento, inconformidades) da fatura ML do ciclo próximo a este mês.",
      );
    } catch (error) {
      logServerError("dre-month-data ml-fallback", error);
      syncWarnings.push(
        "Não foi possível estimar tarifas e frete do Mercado Livre.",
      );
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
    } catch (error) {
      logServerError("dre-month-data ml-fallback", error);
      syncWarnings.push(
        "Não foi possível estimar tarifas e frete do Mercado Livre.",
      );
    }
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
    adsCost,
    billingSource,
    isPartial,
    incompleteProductCostCount: erpCosts.incompleteProductCostCount,
    syncWarnings,
    cancelledIncludeOverlay,
  };
}

export async function persistDreMonthSnapshot(
  year: number,
  month: number,
  payload: DreMonthSnapshotPayload,
): Promise<Date> {
  const syncedAt = new Date();
  await prisma.dreMonthSnapshot.upsert({
    where: { year_month: { year, month } },
    create: {
      year,
      month,
      syncedAt,
      payload: payload as object,
    },
    update: {
      syncedAt,
      payload: payload as object,
    },
  });
  return syncedAt;
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
    adsCost: num("adsCost"),
    billingSource:
      p.billingSource === "billing" ? "billing" : "fallback",
    isPartial: Boolean(p.isPartial),
    incompleteProductCostCount: Number(p.incompleteProductCostCount ?? 0),
    syncWarnings: Array.isArray(p.syncWarnings)
      ? p.syncWarnings.filter((w): w is string => typeof w === "string")
      : [],
    cancelledIncludeOverlay,
  };
}
