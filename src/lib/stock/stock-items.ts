import { prisma } from "@/lib/db/db";
import { bestItemImageUrl } from "@/lib/mercadolibre/item-image";
import { getItemSku, isKitItem } from "@/lib/mercadolibre/item-sku";
import { itemUserProductId, upsertListingsFromItems } from "@/lib/mercadolibre/listing-sync";
import type { ItemBody } from "@/lib/mercadolibre/types";
import type { ListingStockTarget } from "@/lib/stock/stock-order-effects";

/**
 * Anúncio → item de estoque (produto físico).
 *
 * Um `StockItem` por `user_product_id`: as opções de venda (Clássico,
 * Premium, B2B…) são MLBs diferentes com o mesmo UP e o mesmo estoque no ML,
 * então dividem um item só. A chave nunca é o SKU, que é texto editável e
 * repetível (ver a decisão de identidade por `mlItemId`).
 *
 * Kits (tag `bundle`, sem SKU próprio) não viram item: a venda de um kit
 * baixa os itens dos componentes (`KitItem`).
 */

type ProductFlags = { mlItemId: string; active: boolean };

function pickPrimary(items: ItemBody[], products: Map<string, ProductFlags>): ItemBody {
  const score = (item: ItemBody) =>
    (products.get(item.id)?.active ? 4 : products.has(item.id) ? 2 : 0) +
    (item.status === "active" ? 1 : 0);
  return [...items].sort((a, b) => score(b) - score(a))[0];
}

/**
 * Grava/atualiza os `Listing` dos anúncios e garante o item de estoque de
 * cada um. Só liga anúncio que ainda não tem item: um vínculo feito à mão
 * (juntar dois anúncios antigos) não é desfeito.
 */
export async function ensureStockItemsForItems(
  organizationId: string,
  items: ItemBody[],
): Promise<void> {
  const physical = items.filter((item) => item.id && !isKitItem(item));
  await upsertListingsFromItems(organizationId, items);
  if (physical.length === 0) return;

  const products = new Map(
    (
      await prisma.product.findMany({
        where: { organizationId, mlItemId: { in: physical.map((i) => i.id) } },
        select: { mlItemId: true, active: true },
      })
    ).map((p) => [p.mlItemId, p]),
  );

  const byUp = new Map<string, ItemBody[]>();
  const withoutUp: ItemBody[] = [];
  for (const item of physical) {
    const up = itemUserProductId(item);
    if (!up) {
      withoutUp.push(item);
      continue;
    }
    const list = byUp.get(up) ?? [];
    list.push(item);
    byUp.set(up, list);
  }

  const existing = await prisma.stockItem.findMany({
    where: {
      organizationId,
      OR: [
        { userProductId: { in: [...byUp.keys()] } },
        { userProductId: null, primaryMlItemId: { in: withoutUp.map((i) => i.id) } },
      ],
    },
    select: { id: true, userProductId: true, primaryMlItemId: true, imageUrl: true, sku: true },
  });
  const itemIdByUp = new Map(
    existing.filter((s) => s.userProductId).map((s) => [s.userProductId as string, s]),
  );
  const itemIdByMlb = new Map(
    existing.filter((s) => !s.userProductId && s.primaryMlItemId).map((s) => [s.primaryMlItemId as string, s]),
  );

  const linkTargets = new Map<string, string>(); // mlItemId → stockItemId

  for (const [up, group] of byUp) {
    const primary = pickPrimary(group, products);
    let stock = itemIdByUp.get(up);
    if (!stock) {
      const created = await prisma.stockItem.upsert({
        where: { organizationId_userProductId: { organizationId, userProductId: up } },
        create: {
          organizationId,
          userProductId: up,
          title: primary.title,
          sku: getItemSku(primary),
          imageUrl: bestItemImageUrl(primary) ?? null,
          primaryMlItemId: primary.id,
        },
        update: {},
        select: { id: true, userProductId: true, primaryMlItemId: true, imageUrl: true, sku: true },
      });
      stock = created;
    } else if (!stock.imageUrl || !stock.sku) {
      await prisma.stockItem.update({
        where: { id: stock.id },
        data: {
          imageUrl: stock.imageUrl ?? bestItemImageUrl(primary) ?? null,
          sku: stock.sku ?? getItemSku(primary),
        },
      });
    }
    for (const item of group) linkTargets.set(item.id, stock.id);
  }

  for (const item of withoutUp) {
    let stock = itemIdByMlb.get(item.id);
    if (!stock) {
      stock = await prisma.stockItem.create({
        data: {
          organizationId,
          userProductId: null,
          title: item.title,
          sku: getItemSku(item),
          imageUrl: bestItemImageUrl(item) ?? null,
          primaryMlItemId: item.id,
        },
        select: { id: true, userProductId: true, primaryMlItemId: true, imageUrl: true, sku: true },
      });
    }
    linkTargets.set(item.id, stock.id);
  }

  // Liga só quem ainda não tem item (vínculo manual é preservado).
  const listings = await prisma.listing.findMany({
    where: { organizationId, mlItemId: { in: [...linkTargets.keys()] } },
    select: { mlItemId: true, stockItemId: true },
  });
  const toLink = listings.filter((l) => !l.stockItemId);
  const byTarget = new Map<string, string[]>();
  for (const listing of toLink) {
    const target = linkTargets.get(listing.mlItemId);
    if (!target) continue;
    const list = byTarget.get(target) ?? [];
    list.push(listing.mlItemId);
    byTarget.set(target, list);
  }
  for (const [stockItemId, mlItemIds] of byTarget) {
    await prisma.listing.updateMany({
      where: { organizationId, mlItemId: { in: mlItemIds }, stockItemId: null },
      data: { stockItemId },
    });
  }
}

/**
 * Mapa anúncio → destino de estoque, para a sincronização de vendas:
 * anúncios ligados a item, kits (pelo MLB e pelo UP do kit, para pegar as
 * opções de venda do kit) e os UPs conhecidos (para um MLB novo de um UP já
 * ligado).
 */
export type ListingTargetIndex = {
  byMlItemId: Map<string, ListingStockTarget>;
  /** UP → destino, para resolver um MLB ainda desconhecido pelo UP dele. */
  byUserProductId: Map<string, ListingStockTarget>;
};

export async function loadListingTargetIndex(organizationId: string): Promise<ListingTargetIndex> {
  const [listings, kits] = await Promise.all([
    prisma.listing.findMany({
      where: { organizationId },
      select: { mlItemId: true, userProductId: true, stockItemId: true },
    }),
    prisma.kit.findMany({
      where: { organizationId },
      select: {
        mlItemId: true,
        items: { select: { productMlItemId: true, quantity: true } },
      },
    }),
  ]);

  const byMlItemId = new Map<string, ListingStockTarget>();
  const byUserProductId = new Map<string, ListingStockTarget>();
  const stockItemByMlb = new Map<string, string>();
  const upByMlb = new Map<string, string>();
  for (const l of listings) {
    if (l.userProductId) upByMlb.set(l.mlItemId, l.userProductId);
    if (!l.stockItemId) continue;
    stockItemByMlb.set(l.mlItemId, l.stockItemId);
    const target: ListingStockTarget = { kind: "item", stockItemId: l.stockItemId };
    byMlItemId.set(l.mlItemId, target);
    if (l.userProductId && !byUserProductId.has(l.userProductId)) {
      byUserProductId.set(l.userProductId, target);
    }
  }

  for (const kit of kits) {
    const components: Array<{ stockItemId: string; quantity: number }> = [];
    let complete = kit.items.length > 0;
    for (const component of kit.items) {
      const stockItemId = stockItemByMlb.get(component.productMlItemId);
      if (!stockItemId) {
        complete = false;
        break;
      }
      components.push({ stockItemId, quantity: Number(component.quantity) });
    }
    // Kit com componente sem item de estoque fica sem destino: a venda vira
    // pendência em vez de baixar só parte do kit.
    if (!complete) continue;
    const target: ListingStockTarget = { kind: "kit", components };
    byMlItemId.set(kit.mlItemId, target);
    const up = upByMlb.get(kit.mlItemId);
    if (up) byUserProductId.set(up, target);
  }

  return { byMlItemId, byUserProductId };
}
