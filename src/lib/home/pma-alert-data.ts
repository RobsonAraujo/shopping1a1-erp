import { prisma } from "@/lib/db";
import { fetchOperationalListings } from "@/lib/mercadolibre/api";
import { bestItemImageUrl } from "@/lib/mercadolibre/item-image";
import { fetchItemSalePrice } from "@/lib/mercadolibre/item-sale-price";
import { getItemSku } from "@/lib/mercadolibre/item-sku";
import type { ItemBody } from "@/lib/mercadolibre/types";
import { normalizeProductSku } from "@/lib/product-pricing";
import { resolveCanonicalSku, type SkuAliasMap } from "@/lib/product-sku-alias";
import { loadSkuAliasMap } from "@/lib/product-sku-alias-data";

async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let nextIndex = 0;

  async function worker() {
    while (nextIndex < items.length) {
      const index = nextIndex;
      nextIndex += 1;
      results[index] = await fn(items[index], index);
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, worker));
  return results;
}

export type PmaAlertRow = {
  mlItemId: string;
  sku: string;
  title: string;
  imageUrl: string | null;
  pmaPrice: number;
  currentPrice: number;
  shortfallPercent: number;
};

export async function buildPmaAlertRows(
  accessToken: string,
  pmaBySku: Map<string, number>,
  items: ItemBody[],
  aliasMap?: SkuAliasMap,
): Promise<PmaAlertRow[]> {
  const candidates: { item: ItemBody; canonicalSku: string; pmaPrice: number }[] = [];

  for (const item of items) {
    if (item.status !== "active") continue;

    const canonicalSku = resolveCanonicalSku(getItemSku(item), aliasMap);
    if (!canonicalSku) continue;
    const pmaPrice = pmaBySku.get(canonicalSku);
    if (pmaPrice == null) continue;

    candidates.push({ item, canonicalSku, pmaPrice });
  }

  const rows: PmaAlertRow[] = [];

  await mapWithConcurrency(candidates, 5, async ({ item, canonicalSku, pmaPrice }) => {
    let currentPrice = item.price;
    try {
      const salePriceInfo = await fetchItemSalePrice(accessToken, item.id, item.price);
      currentPrice = salePriceInfo.amount;
    } catch {
      // mantém item.price como fallback quando a consulta de preço promocional falha
    }

    if (currentPrice >= pmaPrice) return;

    rows.push({
      mlItemId: item.id,
      sku: canonicalSku,
      title: item.title,
      imageUrl: bestItemImageUrl(item) ?? null,
      pmaPrice,
      currentPrice,
      shortfallPercent: ((pmaPrice - currentPrice) / pmaPrice) * 100,
    });
  });

  return rows.sort((a, b) => b.shortfallPercent - a.shortfallPercent);
}

export async function loadPmaAlerts(
  accessToken: string,
  userId: number,
): Promise<PmaAlertRow[]> {
  const productsWithPma = await prisma.product.findMany({
    where: { pmaPrice: { not: null } },
    select: { sku: true, pmaPrice: true },
  });
  if (productsWithPma.length === 0) return [];

  const pmaBySku = new Map<string, number>();
  for (const product of productsWithPma) {
    if (product.pmaPrice == null) continue;
    pmaBySku.set(normalizeProductSku(product.sku), Number(product.pmaPrice));
  }

  const [aliasMap, items] = await Promise.all([
    loadSkuAliasMap(),
    fetchOperationalListings(accessToken, userId),
  ]);

  return buildPmaAlertRows(accessToken, pmaBySku, items, aliasMap);
}
