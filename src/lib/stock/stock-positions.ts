import { prisma } from "@/lib/db/db";
import { Prisma } from "@/generated/prisma";
import { fetchAllUserItemIds, fetchItemsByIdsBatched } from "@/lib/mercadolibre/api";
import { mapWithConcurrency } from "@/lib/mercadolibre/concurrency";
import {
  collectInventoryIdsFromItem,
  isFulfillmentListing,
} from "@/lib/mercadolibre/fulfillment-stock";
import { itemUserProductId } from "@/lib/mercadolibre/listing-sync";
import type { ItemBody } from "@/lib/mercadolibre/types";
import {
  combineStockItemReads,
  fetchFulfillmentStockStrict,
  fetchUserProductStock,
  type FulfillmentRead,
  type UserProductStockRead,
} from "@/lib/stock/stock-ml-read";
import { ensureStockItemsForItems } from "@/lib/stock/stock-items";

/**
 * Lê do ML o depósito e o Full de cada item de estoque e grava em
 * `StockItemMlPosition`. Só leitura e exibição: o envio ao Full e a volta do
 * Full são registrados por vocês (não há detecção automática — ver o README,
 * "Por que não detectamos o Full sozinhos").
 *
 * Custo: 1 `/items/bulk` a cada 20 anúncios, 1 `/user-products/{UP}/stock`
 * por UP e 1 `/inventories/{id}/stock/fulfillment` por inventário Full. A
 * cota do app ML é compartilhada entre todos os clientes: concorrência baixa,
 * e a leitura completa não roda em segundo plano fora do Estoque (ver
 * `stock-sync.ts`).
 */

const READ_CONCURRENCY = 5;

export type PositionsProgress = { done: number; total: number };

export type RefreshPositionsResult = {
  read: number;
  failed: number;
  sellerNodeIds: string[];
  stockItemIds: string[];
};

type StockItemTarget = {
  id: string;
  userProductIds: string[];
  inventoryIds: string[];
  hasFull: boolean;
};

function errorMessage(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err);
  return msg.slice(0, 300);
}

async function loadTargets(
  organizationId: string,
  stockItemIds: string[] | null,
  itemsById: Map<string, ItemBody>,
): Promise<StockItemTarget[]> {
  const stockItems = await prisma.stockItem.findMany({
    where: {
      organizationId,
      ...(stockItemIds ? { id: { in: stockItemIds } } : {}),
    },
    select: {
      id: true,
      userProductId: true,
      listings: { select: { mlItemId: true, userProductId: true } },
    },
  });
  return stockItems.map((s) => {
    const ups = new Set<string>();
    if (s.userProductId) ups.add(s.userProductId);
    const inventories = new Set<string>();
    let hasFull = false;
    for (const listing of s.listings) {
      if (listing.userProductId) ups.add(listing.userProductId);
      const item = itemsById.get(listing.mlItemId);
      if (!item) continue;
      const up = itemUserProductId(item);
      if (up) ups.add(up);
      if (isFulfillmentListing(item)) {
        hasFull = true;
        for (const inv of collectInventoryIdsFromItem(item)) inventories.add(inv);
      }
    }
    return { id: s.id, userProductIds: [...ups], inventoryIds: [...inventories], hasFull };
  });
}

/** Lê e grava as posições do ML. `stockItemIds = null` lê todos os itens da organização. */
export async function refreshStockPositions(input: {
  organizationId: string;
  accessToken: string;
  stockItemIds: string[] | null;
  signal?: AbortSignal;
  onProgress?: (progress: PositionsProgress) => void;
}): Promise<RefreshPositionsResult> {
  const { organizationId, accessToken, signal } = input;

  // Anúncios dos itens pedidos: logística e inventário Full vêm do /items.
  const listingRows = await prisma.listing.findMany({
    where: {
      organizationId,
      stockItemId: input.stockItemIds ? { in: input.stockItemIds } : { not: null },
    },
    select: { mlItemId: true },
  });
  const items = await fetchItemsByIdsBatched(
    accessToken,
    listingRows.map((l) => l.mlItemId),
  );
  // Mantém `Listing` em dia (status, UP) e liga anúncio novo que apareceu.
  await ensureStockItemsForItems(organizationId, items);
  const itemsById = new Map(items.map((item) => [item.id, item]));

  const targets = await loadTargets(organizationId, input.stockItemIds, itemsById);
  const total = targets.length;
  let done = 0;
  input.onProgress?.({ done, total });

  // Dedup de UP/inventário compartilhados entre itens (raro, mas barato).
  const upReads = new Map<string, Promise<UserProductStockRead | null>>();
  const invReads = new Map<string, Promise<FulfillmentRead>>();
  const readUp = (up: string) => {
    let p = upReads.get(up);
    if (!p) {
      p = fetchUserProductStock(accessToken, up, signal);
      upReads.set(up, p);
    }
    return p;
  };
  const readInv = (inv: string) => {
    let p = invReads.get(inv);
    if (!p) {
      p = fetchFulfillmentStockStrict(accessToken, inv, signal);
      invReads.set(inv, p);
    }
    return p;
  };

  const sellerNodes = new Set<string>();
  let failed = 0;

  await mapWithConcurrency(targets, READ_CONCURRENCY, async (target) => {
    signal?.throwIfAborted();
    const readAt = new Date();
    try {
      const [ups, fulfillment] = await Promise.all([
        Promise.all(target.userProductIds.map(readUp)),
        Promise.all(target.inventoryIds.map(readInv)),
      ]);
      const read = combineStockItemReads({
        userProducts: ups.filter((u): u is UserProductStockRead => u != null),
        fulfillment,
        hasFull: target.hasFull,
      });
      for (const node of read.sellerNodeIds) sellerNodes.add(node);
      const data = {
        depositQty: read.depositQty,
        fullAvailableQty: read.fullAvailableQty,
        fullTransferQty: read.fullTransferQty,
        fullOtherQty: read.fullOtherQty,
        fullWithdrawalQty: read.fullWithdrawalQty,
        fullLostQty: read.fullLostQty,
        fullTotalQty: read.fullTotalQty,
        fullUnavailableDetail: read.fullUnavailableDetail ?? Prisma.DbNull,
        fetchedAt: readAt,
        error: null,
      };
      await prisma.stockItemMlPosition.upsert({
        where: { stockItemId: target.id },
        create: { stockItemId: target.id, organizationId, ...data },
        update: data,
      });
    } catch (err) {
      if (signal?.aborted) throw err;
      failed += 1;
      await prisma.stockItemMlPosition.upsert({
        where: { stockItemId: target.id },
        create: { stockItemId: target.id, organizationId, error: errorMessage(err) },
        update: { error: errorMessage(err) },
      });
    } finally {
      done += 1;
      input.onProgress?.({ done, total });
    }
  });

  return {
    read: total - failed,
    failed,
    sellerNodeIds: [...sellerNodes],
    stockItemIds: targets.map((t) => t.id),
  };
}

/**
 * Anúncio novo (ativo ou pausado) que ainda não virou item de estoque: lê e
 * liga. Sem isto, um produto recém-anunciado só apareceria no Estoque na
 * primeira venda, e não daria para registrar a entrada dele antes.
 *
 * Roda junto com a releitura completa (no máximo a cada 2 h, ver
 * `stock-sync.ts`). Custo: a busca de anúncios do seller (1 chamada a cada 50)
 * e o `/items/bulk` só dos que faltam.
 */
export async function linkNewSellerListings(input: {
  organizationId: string;
  mlUserId: number;
  accessToken: string;
}): Promise<number> {
  const { organizationId, mlUserId, accessToken } = input;
  const [active, paused] = await Promise.all([
    fetchAllUserItemIds(accessToken, mlUserId, { status: "active" }),
    fetchAllUserItemIds(accessToken, mlUserId, { status: "paused" }),
  ]);
  const ids = [...new Set([...active, ...paused])];
  if (ids.length === 0) return 0;
  const [linked, kits] = await Promise.all([
    prisma.listing.findMany({
      where: { organizationId, mlItemId: { in: ids }, stockItemId: { not: null } },
      select: { mlItemId: true },
    }),
    // Kit não vira item (a venda baixa os componentes): não precisa reler.
    prisma.kit.findMany({ where: { organizationId, mlItemId: { in: ids } }, select: { mlItemId: true } }),
  ]);
  const known = new Set([...linked, ...kits].map((r) => r.mlItemId));
  const missing = ids.filter((id) => !known.has(id));
  if (missing.length === 0) return 0;
  await ensureStockItemsForItems(organizationId, await fetchItemsByIdsBatched(accessToken, missing));
  return missing.length;
}
