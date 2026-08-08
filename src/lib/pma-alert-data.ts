import { prisma } from "@/lib/db";
import { fetchOperationalListings } from "@/lib/mercadolibre/api";
import { bestItemImageUrl } from "@/lib/mercadolibre/item-image";
import { getItemSku } from "@/lib/mercadolibre/item-sku";
import type { ItemBody } from "@/lib/mercadolibre/types";
import { normalizeProductSku } from "@/lib/product-pricing";
import { resolveCanonicalSku, type SkuAliasMap } from "@/lib/product-sku-alias";
import { loadSkuAliasMap } from "@/lib/product-sku-alias-data";

export type PmaAlertRow = {
  mlItemId: string;
  sku: string;
  title: string;
  imageUrl: string | null;
  pmaPrice: number;
  currentPrice: number;
  excessPercent: number;
};

export function buildPmaAlertRows(
  pmaBySku: Map<string, number>,
  items: ItemBody[],
  aliasMap?: SkuAliasMap,
): PmaAlertRow[] {
  const rows: PmaAlertRow[] = [];

  for (const item of items) {
    if (item.status !== "active") continue;

    const canonicalSku = resolveCanonicalSku(getItemSku(item), aliasMap);
    if (!canonicalSku) continue;
    const pmaPrice = pmaBySku.get(canonicalSku);
    if (pmaPrice == null) continue;

    if (item.price <= pmaPrice) continue;

    rows.push({
      mlItemId: item.id,
      sku: canonicalSku,
      title: item.title,
      imageUrl: bestItemImageUrl(item) ?? null,
      pmaPrice,
      currentPrice: item.price,
      excessPercent: ((item.price - pmaPrice) / pmaPrice) * 100,
    });
  }

  return rows.sort((a, b) => b.excessPercent - a.excessPercent);
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

  return buildPmaAlertRows(pmaBySku, items, aliasMap);
}
