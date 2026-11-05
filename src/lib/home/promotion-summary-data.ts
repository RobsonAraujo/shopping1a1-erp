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
  catalogListing: boolean;
  soldQuantity: number;
};

/** Quais tipos de anúncio entram na varredura (Configurações > Planejamento). */
export type PromotionMonitor = {
  own: boolean;
  catalog: boolean;
};

export type PromotionSummaryPayload = {
  expiringSoon: PromotionSummaryRow[];
  /** Mais vendidos primeiro, até `promotionWithoutListMax`. */
  withoutPromotion: PromotionSummaryRow[];
  /** O total real, que pode passar do teto da lista. */
  withoutPromotionCount: number;
  totalActiveItems: number;
  fetchedAt: string;
  expiringSoonDays: number;
  monitor: PromotionMonitor;
  warnings: string[];
};

/**
 * Sem repetição em 429: o retry ajuda num sync pontual, mas numa varredura de
 * centenas de anúncios só amplia a carga sobre um limite compartilhado entre
 * todos os clientes. Quem falha vira aviso e é consultado no próximo carregamento.
 */
const SCAN_RETRY = { maxAttempts: 1 };

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
    catalogListing: item.catalog_listing === true,
    soldQuantity: item.sold_quantity ?? 0,
  };
}

type ItemPromotionScan = {
  baseRow: PromotionSummaryRow;
  /** `null` é "não deu para saber": o preço não veio. Não conta como sem promoção. */
  hasPromotion: boolean | null;
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
    // Sem `fallbackPrice` de propósito: com fallback, uma falha do ML (429,
    // escopo) voltava `hasPromotion: false` em silêncio e o painel dizia
    // "nenhuma promoção vencendo". Agora lança e vira warning visível.
    const salePriceInfo = await fetchItemSalePrice(
      accessToken,
      item.id,
      undefined,
      SCAN_RETRY,
    );
    salePrice = salePriceInfo.amount;
    regularPrice = salePriceInfo.regularAmount;
    hasPromotion = salePriceInfo.hasPromotion;
  } catch (e) {
    return {
      baseRow: buildBaseRow(item, salePrice, regularPrice),
      hasPromotion: null,
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
    const promotions = await fetchItemPromotions(
      accessToken,
      item.id,
      SCAN_RETRY,
    );
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

function compareBySku(a: PromotionSummaryRow, b: PromotionSummaryRow): number {
  const keyA = (a.sku ?? a.title ?? a.mlItemId).toLowerCase();
  const keyB = (b.sku ?? b.title ?? b.mlItemId).toLowerCase();
  return keyA.localeCompare(keyB, "pt-BR");
}

export async function loadPromotionSummary(
  accessToken: string,
  userId: number,
  options?: {
    expiringSoonDays?: number;
    monitor?: PromotionMonitor;
    scanBudgetMs?: number;
  },
): Promise<PromotionSummaryPayload> {
  const expiringSoonDays =
    options?.expiringSoonDays ?? dashboardSummaryConfig.promotionExpiringSoonDays;
  const monitor: PromotionMonitor = options?.monitor ?? {
    own: dashboardSummaryConfig.promotionMonitorOwnListings,
    catalog: dashboardSummaryConfig.promotionMonitorCatalogListings,
  };
  const scanBudgetMs =
    options?.scanBudgetMs ?? dashboardSummaryConfig.promotionScanBudgetMs;
  const timeZone = dashboardSummaryConfig.promotionTimezone;
  const now = new Date();

  const emptyPayload: PromotionSummaryPayload = {
    expiringSoon: [],
    withoutPromotion: [],
    withoutPromotionCount: 0,
    totalActiveItems: 0,
    fetchedAt: now.toISOString(),
    expiringSoonDays,
    monitor,
    warnings: [],
  };

  // Nada a acompanhar: nenhuma chamada ao Mercado Livre.
  if (!monitor.own && !monitor.catalog) return emptyPayload;

  // Só catálogo dá para filtrar na busca (`catalog_listing=true` já é usado pelo
  // poll em produção). Só próprios não: `catalog_listing=false` nunca foi validado
  // contra a API, e como anúncio sem o campo conta como próprio, um filtro que os
  // deixasse de fora sumiria com eles em silêncio.
  const activeIds = await fetchAllUserItemIds(accessToken, userId, {
    status: "active",
    ...(monitor.own ? {} : { catalog_listing: true }),
  });

  if (activeIds.length === 0) return emptyPayload;

  const items = await fetchItemsByIdsBatched(accessToken, activeIds);
  const monitoredItems = items.filter(
    (item) =>
      item.status === "active" &&
      (item.catalog_listing === true ? monitor.catalog : monitor.own),
  );

  const deadline = Date.now() + scanBudgetMs;
  const results = await mapWithConcurrency(
    monitoredItems,
    6,
    async (item) =>
      // Só deixa de começar item novo: os que já estão em voo terminam, e cada
      // chamada tem timeout próprio.
      Date.now() >= deadline
        ? null
        : scanItemPromotion(
            accessToken,
            item,
            expiringSoonDays,
            timeZone,
            now,
          ),
  );
  const scans = results.filter(
    (scan): scan is ItemPromotionScan => scan !== null,
  );

  const warnings = scans
    .map((scan) => scan.warning)
    .filter((warning): warning is string => warning !== null);
  if (scans.length < monitoredItems.length) {
    warnings.unshift(
      `Só deu tempo de consultar ${scans.length} de ${monitoredItems.length} anúncios. Use "Atualizar" para tentar de novo.`,
    );
  }

  const withoutPromotionRows = scans
    .filter((scan) => scan.hasPromotion === false)
    .map((scan) => scan.baseRow);
  const withoutPromotion = [...withoutPromotionRows]
    .sort((a, b) => b.soldQuantity - a.soldQuantity || compareBySku(a, b))
    .slice(0, dashboardSummaryConfig.promotionWithoutListMax);

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
      return compareBySku(a, b);
    });

  return {
    expiringSoon,
    withoutPromotion,
    withoutPromotionCount: withoutPromotionRows.length,
    totalActiveItems: monitoredItems.length,
    fetchedAt: now.toISOString(),
    expiringSoonDays,
    monitor,
    warnings,
  };
}
