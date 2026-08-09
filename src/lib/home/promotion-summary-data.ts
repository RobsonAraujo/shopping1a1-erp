import { dashboardSummaryConfig } from "@/config/dashboard-summary";
import {
  fetchAllUserItemIds,
  fetchItemsByIdsBatched,
} from "@/lib/mercadolibre/api";
import { bestItemImageUrl } from "@/lib/mercadolibre/item-image";
import { buyerFacingItemPermalink } from "@/lib/mercadolibre/item-permalink";
import {
  daysUntilPromotionEnd,
  fetchItemPromotions,
  isPromotionExpiringWithinDays,
  pickEarliestActivePromotion,
} from "@/lib/mercadolibre/item-promotions";
import { getItemSku } from "@/lib/mercadolibre/item-sku";
import { fetchItemSalePrice } from "@/lib/mercadolibre/item-sale-price";
import type { ItemBody } from "@/lib/mercadolibre/types";

export type PromotionSummaryRow = {
  mlItemId: string;
  title: string;
  sku: string | null;
  imageUrl: string | null;
  permalink: string;
  salePrice: number;
  regularPrice: number | null;
  promotionType: string | null;
  promotionName: string | null;
  promotionEndsAt: string | null;
  daysUntilEnd: number | null;
};

export type PromotionSummaryPayload = {
  withoutPromotion: PromotionSummaryRow[];
  expiringSoon: PromotionSummaryRow[];
  fetchedAt: string;
  expiringSoonDays: number;
  warnings: string[];
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

function buildBaseRow(
  item: ItemBody,
  salePrice: number,
  regularPrice: number | null,
): PromotionSummaryRow {
  return {
    mlItemId: item.id,
    title: item.title,
    sku: getItemSku(item),
    imageUrl: bestItemImageUrl(item) ?? null,
    permalink: buyerFacingItemPermalink(item.permalink, item.id),
    salePrice,
    regularPrice,
    promotionType: null,
    promotionName: null,
    promotionEndsAt: null,
    daysUntilEnd: null,
  };
}

type ItemPromotionScan = {
  baseRow: PromotionSummaryRow;
  hasPromotion: boolean;
  expiringRow: PromotionSummaryRow | null;
  warning: string | null;
};

async function scanItemPromotion(
  accessToken: string,
  item: ItemBody,
  expiringSoonDays: number,
  timeZone: string,
  now: Date,
): Promise<ItemPromotionScan> {
  let salePrice = item.price;
  let regularPrice: number | null = null;
  let hasPromotion = false;

  try {
    const salePriceInfo = await fetchItemSalePrice(
      accessToken,
      item.id,
      item.price,
    );
    salePrice = salePriceInfo.amount;
    regularPrice = salePriceInfo.regularAmount;
    hasPromotion = salePriceInfo.hasPromotion;
  } catch (e) {
    return {
      baseRow: buildBaseRow(item, salePrice, regularPrice),
      hasPromotion: false,
      expiringRow: null,
      warning:
        e instanceof Error
          ? `Preço indisponível para ${item.id}: ${e.message}`
          : `Preço indisponível para ${item.id}.`,
    };
  }

  const baseRow = buildBaseRow(item, salePrice, regularPrice);

  if (!hasPromotion) {
    return {
      baseRow,
      hasPromotion: false,
      expiringRow: null,
      warning: null,
    };
  }

  try {
    const promotions = await fetchItemPromotions(accessToken, item.id);
    const active = pickEarliestActivePromotion(promotions);
    if (!active) {
      return {
        baseRow,
        hasPromotion: true,
        expiringRow: null,
        warning: null,
      };
    }

    const daysUntilEnd = daysUntilPromotionEnd(
      active.finishDate,
      now,
      timeZone,
    );

    const enriched: PromotionSummaryRow = {
      ...baseRow,
      promotionType: active.type,
      promotionName: active.name,
      promotionEndsAt: active.finishDate.toISOString(),
      daysUntilEnd,
    };

    const expiring = isPromotionExpiringWithinDays(
      active.finishDate,
      now,
      expiringSoonDays,
      timeZone,
    );

    return {
      baseRow,
      hasPromotion: true,
      expiringRow: expiring ? enriched : null,
      warning: null,
    };
  } catch (e) {
    return {
      baseRow,
      hasPromotion: true,
      expiringRow: null,
      warning:
        e instanceof Error
          ? `Promoções indisponíveis para ${item.id}: ${e.message}`
          : `Promoções indisponíveis para ${item.id}.`,
    };
  }
}

function sortRows(rows: PromotionSummaryRow[]): PromotionSummaryRow[] {
  return [...rows].sort((a, b) => {
    const keyA = (a.sku ?? a.title ?? a.mlItemId).toLowerCase();
    const keyB = (b.sku ?? b.title ?? b.mlItemId).toLowerCase();
    return keyA.localeCompare(keyB, "pt-BR");
  });
}

export async function loadPromotionSummary(
  accessToken: string,
  userId: number,
  options?: { expiringSoonDays?: number },
): Promise<PromotionSummaryPayload> {
  const expiringSoonDays =
    options?.expiringSoonDays ?? dashboardSummaryConfig.promotionExpiringSoonDays;
  const timeZone = dashboardSummaryConfig.promotionTimezone;
  const now = new Date();

  const activeIds = await fetchAllUserItemIds(accessToken, userId, {
    status: "active",
  });

  if (activeIds.length === 0) {
    return {
      withoutPromotion: [],
      expiringSoon: [],
      fetchedAt: now.toISOString(),
      expiringSoonDays,
      warnings: [],
    };
  }

  const items = await fetchItemsByIdsBatched(accessToken, activeIds);
  const ownActiveItems = items.filter(
    (item) =>
      item.status === "active" && item.catalog_listing !== true,
  );

  const scans = await mapWithConcurrency(
    ownActiveItems,
    6,
    async (item) =>
      scanItemPromotion(
        accessToken,
        item,
        expiringSoonDays,
        timeZone,
        now,
      ),
  );

  const warnings = scans
    .map((scan) => scan.warning)
    .filter((warning): warning is string => warning !== null);

  const withoutPromotion = sortRows(
    scans
      .filter((scan) => !scan.hasPromotion)
      .map((scan) => scan.baseRow),
  );

  const expiringSoon = [...scans]
    .map((scan) => scan.expiringRow)
    .filter((row): row is PromotionSummaryRow => row !== null)
    .sort((a, b) => {
      const dateA = a.promotionEndsAt
        ? new Date(a.promotionEndsAt).getTime()
        : Number.MAX_SAFE_INTEGER;
      const dateB = b.promotionEndsAt
        ? new Date(b.promotionEndsAt).getTime()
        : Number.MAX_SAFE_INTEGER;
      if (dateA !== dateB) return dateA - dateB;
      const keyA = (a.sku ?? a.title ?? a.mlItemId).toLowerCase();
      const keyB = (b.sku ?? b.title ?? b.mlItemId).toLowerCase();
      return keyA.localeCompare(keyB, "pt-BR");
    });

  return {
    withoutPromotion,
    expiringSoon,
    fetchedAt: now.toISOString(),
    expiringSoonDays,
    warnings,
  };
}
