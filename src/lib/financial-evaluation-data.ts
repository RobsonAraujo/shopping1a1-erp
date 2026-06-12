import { prisma } from "@/lib/db";
import {
  computeFinancialMargin,
  listingTypeLabelFromId,
  type FinancialMarginBreakdown,
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
import { fetchSellerShippingCost } from "@/lib/mercadolibre/seller-shipping-cost";
import type { ItemBody } from "@/lib/mercadolibre/types";

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
  shippingCost: number | null;
  breakdown: FinancialMarginBreakdown | null;
  errors: string[];
  warnings: string[];
};

function decimalToNumber(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

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

async function buildRowForItem(
  accessToken: string,
  userId: number,
  item: ItemBody,
  stock: {
    lastPurchasePrice: unknown;
    extraCosts: unknown;
    taxRatePercent: unknown;
  } | null,
): Promise<FinancialEvaluationRow> {
  const errors: string[] = [];
  const warnings: string[] = [];

  const productCost = decimalToNumber(stock?.lastPurchasePrice);
  const extraCosts = decimalToNumber(stock?.extraCosts);
  const taxRatePercent = decimalToNumber(stock?.taxRatePercent);

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

  if (productCost === null) {
    warnings.push("Preencha o custo do produto para margem completa.");
  }
  if (extraCosts === null) {
    warnings.push("Custos extras não informados (considerado 0).");
  }
  if (taxRatePercent === null) {
    warnings.push("Alíquota de impostos não informada (considerado 0).");
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

  const breakdown =
    mlFeeAmount !== null && shippingCost !== null
      ? computeFinancialMargin({
          salePrice,
          mlFeeAmount,
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
    shippingCost,
    breakdown,
    errors,
    warnings,
  };
}

export async function loadFinancialEvaluationRows(
  accessToken: string,
  userId: number,
  options?: { itemIds?: string[] },
): Promise<FinancialEvaluationRow[]> {
  const listingIds =
    options?.itemIds && options.itemIds.length > 0
      ? [...new Set(options.itemIds)]
      : await fetchOperationalListingIds(accessToken, userId);

  if (listingIds.length === 0) return [];

  const [items, stockRows] = await Promise.all([
    fetchItemsByIdsBatched(accessToken, listingIds),
    prisma.warehouseStock.findMany({
      where: { mlItemId: { in: listingIds } },
      select: {
        mlItemId: true,
        lastPurchasePrice: true,
        extraCosts: true,
        taxRatePercent: true,
      },
    }),
  ]);

  const stockByItemId = new Map(stockRows.map((row) => [row.mlItemId, row]));
  const operationalItems = items.filter((item) =>
    isOperationalStatus(item.status),
  );

  const rows = await mapWithConcurrency(
    operationalItems,
    5,
    async (item) =>
      buildRowForItem(
        accessToken,
        userId,
        item,
        stockByItemId.get(item.id) ?? null,
      ),
  );

  return rows.sort((a, b) => {
    const keyA = (a.sku ?? a.title ?? a.mlItemId).toLowerCase();
    const keyB = (b.sku ?? b.title ?? b.mlItemId).toLowerCase();
    return keyA.localeCompare(keyB, "pt-BR");
  });
}
