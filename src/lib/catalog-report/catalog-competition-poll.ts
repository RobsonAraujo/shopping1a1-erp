import { reportsConfig } from "@/config/reports";
import {
  deriveStatusFromPriceToWin,
  extractPriceToWin,
  extractSellerPrice,
  loadLatestCatalogCompetitionSnapshots,
  shouldRecordCatalogSnapshot,
} from "@/lib/catalog-report/catalog-competition";
import { prisma } from "@/lib/db/db";
import {
  fetchAllUserItemIds,
  fetchItemPriceToWin,
  fetchItemsByIdsBatched,
} from "@/lib/mercadolibre/api";
import { upsertListingFromItem } from "@/lib/mercadolibre/listing-sync";
import { logServerError } from "@/lib/infra/server-public-error";
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
  organizationId: string,
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

      const recordSnapshot = shouldRecordCatalogSnapshot({
        latest: latestSnapshotById[itemId] ?? null,
        polledAt,
        status,
        sellerPrice,
        priceToWin,
        timeZone: reportsConfig.catalogCompetitionTimezone,
      });

      const catalogFields = {
        catalogListing: true,
        catalogStatus: status,
        catalogSellerPrice: decimalOrNull(sellerPrice),
        catalogPriceToWin: decimalOrNull(priceToWin),
        catalogPolledAt: polledAt,
      };

      await prisma.$transaction(async (tx) => {
        if (item) {
          // Campos gerais (título/sku/imagem/status) via upsert central —
          // depois, camada extra só com os campos exclusivos de catálogo.
          await upsertListingFromItem(organizationId, item, tx);
          await tx.listing.update({
            where: { mlItemId: itemId },
            data: catalogFields,
          });
        } else {
          // fetchItemsByIdsBatched não trouxe o item pra esse id (raro) —
          // garante a linha existir com os defaults de sempre, sem dado
          // derivado do item que não temos.
          await tx.listing.upsert({
            where: { mlItemId: itemId },
            create: {
              organizationId,
              mlItemId: itemId,
              activeOnMl: true,
              lastSyncedAt: polledAt,
              ...catalogFields,
            },
            update: { lastSyncedAt: polledAt, ...catalogFields },
          });
        }

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
                organizationId,
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
                  organizationId,
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

export type CronSellerBatchEntry = {
  organizationId: string;
  mlUserId: number;
};

/**
 * Lote de sellers de organizações pagantes pra o cron processar nesta
 * execução — os que têm `lastCatalogCronPolledAt` mais antigo (ou nunca
 * processados) primeiro. Sem tabela de cursor: cada execução simplesmente
 * pega os mais "atrasados", o que naturalmente rotaciona por todos os
 * sellers pagantes ao longo do dia e se autocorrige se uma execução falhar
 * no meio (`lastCatalogCronPolledAt` é atualizado mesmo em erro — ver
 * cron/catalog-competition/route.ts).
 */
export async function resolvePayingOrgSellersForCronBatch(
  limit: number,
): Promise<CronSellerBatchEntry[]> {
  const rows = await prisma.organizationMlSeller.findMany({
    where: { organization: { status: { in: ["trialing", "active"] } } },
    select: { organizationId: true, mlUserId: true },
    orderBy: [{ lastCatalogCronPolledAt: { sort: "asc", nulls: "first" } }],
    take: limit,
  });
  return rows;
}
