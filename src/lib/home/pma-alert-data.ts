import { prisma } from "@/lib/db/db";
import { fetchOperationalListings } from "@/lib/mercadolibre/api";
import { bestItemImageUrl } from "@/lib/mercadolibre/item-image";
import { fetchItemSalePrice } from "@/lib/mercadolibre/item-sale-price";
import type { ItemBody } from "@/lib/mercadolibre/types";

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
  pmaByMlItemId: Map<string, { sku: string; pmaPrice: number }>,
  items: ItemBody[],
): Promise<PmaAlertRow[]> {
  const candidates: { item: ItemBody; sku: string; pmaPrice: number }[] = [];

  for (const item of items) {
    if (item.status !== "active") continue;
    const pma = pmaByMlItemId.get(item.id);
    if (!pma) continue;
    candidates.push({ item, sku: pma.sku, pmaPrice: pma.pmaPrice });
  }

  const rows: PmaAlertRow[] = [];

  await mapWithConcurrency(candidates, 5, async ({ item, sku, pmaPrice }) => {
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
      sku,
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
  organizationId: string,
): Promise<PmaAlertRow[]> {
  const productsWithPma = await prisma.product.findMany({
    where: { organizationId, pmaPrice: { not: null } },
    select: { mlItemId: true, sku: true, pmaPrice: true },
  });
  if (productsWithPma.length === 0) return [];

  const pmaByMlItemId = new Map<string, { sku: string; pmaPrice: number }>();
  for (const product of productsWithPma) {
    if (product.pmaPrice == null) continue;
    pmaByMlItemId.set(product.mlItemId, {
      sku: product.sku ?? product.mlItemId,
      pmaPrice: Number(product.pmaPrice),
    });
  }

  const items = await fetchOperationalListings(accessToken, userId, organizationId);

  return buildPmaAlertRows(accessToken, pmaByMlItemId, items);
}
