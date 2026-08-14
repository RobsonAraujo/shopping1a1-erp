import { reportsConfig } from "@/config/reports";
import {
  deriveStatusFromPriceToWin,
  extractPriceToWin,
  extractSellerPrice,
  loadLatestCatalogCompetitionSnapshots,
  shouldRecordCatalogSnapshot,
  type LatestCatalogSnapshot,
} from "@/lib/catalog-competition";
import { prisma } from "@/lib/db";
import {
  fetchAllUserItemIds,
  fetchItemPriceToWin,
  fetchItemsByIdsBatched,
} from "@/lib/mercadolibre/api";
import { bestItemImageUrl } from "@/lib/mercadolibre/item-image";
import { getItemSku } from "@/lib/mercadolibre/item-sku";
import { logServerError } from "@/lib/server-public-error";
import type { CatalogCompetitionSource } from "@/generated/prisma/client";

export type CatalogPollSource = Extract<
  CatalogCompetitionSource,
  "cron" | "manual_poll"
>;

export type CatalogPollResult = {
  checked: number;
  changed: number;
  errors: string[];
};

function decimalOrNull(value: number | null): string | null {
  if (value === null || !Number.isFinite(value)) return null;
  return String(value);
}

export async function pollCatalogCompetitionForSeller(
  accessToken: string,
  mlUserId: number,
  source: CatalogPollSource,
  itemIds?: string[],
): Promise<CatalogPollResult> {
  let ids = itemIds ? [...new Set(itemIds.filter(Boolean))] : [];
  if (ids.length === 0) {
    const [activeIds, pausedIds] = await Promise.all([
      fetchAllUserItemIds(accessToken, mlUserId, {
        status: "active",
        catalog_listing: true,
      }),
      fetchAllUserItemIds(accessToken, mlUserId, {
        status: "paused",
        catalog_listing: true,
      }),
    ]);
    ids = [...new Set([...activeIds, ...pausedIds])];
  }

  if (ids.length === 0) {
    return { checked: 0, changed: 0, errors: [] };
  }

  const items = await fetchItemsByIdsBatched(accessToken, ids, 20);
  const itemById = Object.fromEntries(items.map((item) => [item.id, item]));

  const latestSnapshotById = await loadLatestCatalogCompetitionSnapshots(ids);

  let changed = 0;
  const errors: string[] = [];
  const polledAt = new Date();

  for (const itemId of ids) {
    try {
      const raw = await fetchItemPriceToWin(accessToken, itemId);
      const payload = raw as Record<string, unknown>;
      const status = deriveStatusFromPriceToWin(payload);
      const priceToWin = extractPriceToWin(payload);
      const item = itemById[itemId];
      const sellerPrice = extractSellerPrice(payload, item);
      const sku = item ? getItemSku(item) : null;
      const imageUrl = item ? bestItemImageUrl(item) : null;

      const recordSnapshot = shouldRecordCatalogSnapshot({
        latest: latestSnapshotById[itemId] ?? null,
        polledAt,
        status,
        sellerPrice,
        priceToWin,
        timeZone: reportsConfig.catalogCompetitionTimezone,
      });

      await prisma.$transaction(async (tx) => {
        await tx.listing.upsert({
          where: { mlItemId: itemId },
          create: {
            mlItemId: itemId,
            titleSnapshot: item?.title ?? null,
            skuSnapshot: sku,
            imageUrlSnapshot: imageUrl ?? null,
            catalogListing: item?.catalog_listing ?? true,
            activeOnMl: item
              ? item.status === "active" || item.status === "paused"
              : true,
            mlStatus: item?.status ?? null,
            lastSyncedAt: polledAt,
            catalogStatus: status,
            catalogSellerPrice: decimalOrNull(sellerPrice),
            catalogPriceToWin: decimalOrNull(priceToWin),
            catalogPolledAt: polledAt,
          },
          update: {
            titleSnapshot: item?.title ?? undefined,
            skuSnapshot: sku ?? undefined,
            imageUrlSnapshot: imageUrl ?? undefined,
            catalogListing: item?.catalog_listing ?? true,
            activeOnMl: item
              ? item.status === "active" || item.status === "paused"
              : undefined,
            mlStatus: item?.status ?? undefined,
            lastSyncedAt: polledAt,
            catalogStatus: status,
            catalogSellerPrice: decimalOrNull(sellerPrice),
            catalogPriceToWin: decimalOrNull(priceToWin),
            catalogPolledAt: polledAt,
          },
        });

        if (recordSnapshot) {
          const rawResponse = JSON.parse(
            JSON.stringify({
              priceToWin: payload,
              item: item ?? null,
            }),
          );
          try {
            await tx.catalogCompetitionSnapshot.create({
              data: {
                mlItemId: itemId,
                status,
                sellerPrice: decimalOrNull(sellerPrice),
                priceToWin: decimalOrNull(priceToWin),
                source,
                snapshotAt: polledAt,
                rawResponse,
              },
            });
          } catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            if (msg.includes("Unique constraint")) {
              await tx.catalogCompetitionSnapshot.create({
                data: {
                  mlItemId: itemId,
                  status,
                  sellerPrice: decimalOrNull(sellerPrice),
                  priceToWin: decimalOrNull(priceToWin),
                  source,
                  snapshotAt: new Date(polledAt.getTime() + 1),
                  rawResponse,
                },
              });
            } else {
              throw e;
            }
          }
        }
      });

      if (recordSnapshot) changed += 1;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      errors.push(`${itemId}: ${msg}`);
      logServerError(`catalog-competition-poll item=${itemId}`, e);
    }
  }

  return { checked: ids.length, changed, errors };
}

export async function resolveCronMlUserId(): Promise<number | null> {
  const fromEnv = process.env.CRON_ML_USER_ID?.trim();
  if (fromEnv) {
    const n = Number(fromEnv);
    if (Number.isFinite(n) && n > 0) return n;
  }
  const row = await prisma.mlSellerCredentials.findFirst({
    select: { mlUserId: true },
  });
  return row?.mlUserId ?? null;
}
