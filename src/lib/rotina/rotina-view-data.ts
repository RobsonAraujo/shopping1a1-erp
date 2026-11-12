import { rotinaConfig } from "@/config/rotina";
import type { ListingHealthRun } from "@/generated/prisma";
import { prisma } from "@/lib/db/db";
import { decimalToNumber } from "@/lib/catalog-report/catalog-competition";
import { parseCatalogCompetitionSummary } from "@/lib/catalog-report/catalog-competitors";
import {
  resolveRecentRaise,
  resolveStatusSince,
  type CatalogPricePoint,
} from "@/lib/rotina/catalog-history";
import { healthRowToSnapshot } from "@/lib/rotina/health-row";
import { loadListingTargets } from "@/lib/rotina/listing-targets";
import { loadRotinaSettings } from "@/lib/rotina/rotina-settings";
import { isoIsToday, startOfLocalDay } from "@/lib/rotina/time";
import type {
  ActionStateSnapshot,
  CatalogLiveStatus,
  RotinaCatalogLive,
  RotinaRunSummary,
} from "@/lib/rotina/types";
import { buildRotinaView, type RotinaView } from "@/lib/rotina/view";

/**
 * Leitura da página da Rotina — **só banco**, nenhuma chamada ao Mercado
 * Livre. O cálculo pesado já aconteceu no "Atualizar" (`refresh.ts`); o status
 * de catálogo vem ao vivo do que o cron de catálogo gravou em `Listing`.
 */

const DAY_MS = 24 * 60 * 60 * 1000;

function toRunSummary(run: ListingHealthRun | null): RotinaRunSummary | null {
  if (!run) return null;
  return {
    id: run.id,
    status: run.status,
    scope: run.scope,
    startedAt: run.startedAt.toISOString(),
    finishedAt: run.finishedAt?.toISOString() ?? null,
    heartbeatAt: run.heartbeatAt.toISOString(),
    itemsDone: run.itemsDone,
    itemsTotal: run.itemsTotal,
    errorSummary: run.errorSummary,
  };
}

function groupPoints(
  rows: {
    mlItemId: string;
    status: CatalogLiveStatus;
    snapshotAt: Date;
    sellerPrice?: unknown;
  }[],
): Map<string, CatalogPricePoint[]> {
  const byItem = new Map<string, CatalogPricePoint[]>();
  for (const row of rows) {
    const list = byItem.get(row.mlItemId) ?? [];
    list.push({
      status: row.status,
      snapshotAt: row.snapshotAt.toISOString(),
      sellerPrice: decimalToNumber(row.sellerPrice),
    });
    byItem.set(row.mlItemId, list);
  }
  return byItem;
}

export async function loadRotinaView(
  organizationId: string,
  now: Date = new Date(),
): Promise<RotinaView> {
  const timeZone = rotinaConfig.timeZone;
  const todayStart = startOfLocalDay(now, timeZone);

  const [settings, healthRows, targets, catalogRows, stateRows, lastRun, lastComplete] =
    await Promise.all([
      loadRotinaSettings(organizationId),
      prisma.listingHealth.findMany({ where: { organizationId } }),
      loadListingTargets(organizationId),
      prisma.listing.findMany({
        where: {
          organizationId,
          catalogListing: true,
          activeOnMl: true,
          catalogStatus: { not: null },
        },
        select: {
          mlItemId: true,
          titleSnapshot: true,
          skuSnapshot: true,
          imageUrlSnapshot: true,
          mlStatus: true,
          catalogStatus: true,
          catalogSellerPrice: true,
          catalogPriceToWin: true,
          catalogPolledAt: true,
          catalogProductId: true,
          catalogCompetitors: true,
        },
      }),
      prisma.listingActionState.findMany({
        where: {
          organizationId,
          OR: [{ status: { not: "resolved" } }, { resolvedAt: { gte: todayStart } }],
        },
      }),
      prisma.listingHealthRun.findFirst({
        where: { organizationId },
        orderBy: { startedAt: "desc" },
      }),
      prisma.listingHealthRun.findFirst({
        where: { organizationId, scope: "all", status: "ok" },
        orderBy: { finishedAt: "desc" },
        select: { finishedAt: true },
      }),
    ]);

  // Histórico de catálogo: só de quem está perdendo/dividindo ("desde quando")
  // e, dos que ganham, só os últimos dias ("voltou a ganhar hoje"). Nada de
  // `rawResponse` — o payload completo do ML não atravessa a rede aqui.
  const contestedIds = catalogRows
    .filter((row) => row.catalogStatus === "losing" || row.catalogStatus === "shared")
    .map((row) => row.mlItemId);
  const winningIds = catalogRows
    .filter((row) => row.catalogStatus === "winning")
    .map((row) => row.mlItemId);

  const [contestedPoints, winningPoints] = await Promise.all([
    contestedIds.length > 0
      ? prisma.catalogCompetitionSnapshot.findMany({
          where: {
            organizationId,
            mlItemId: { in: contestedIds },
            snapshotAt: {
              gte: new Date(now.getTime() - rotinaConfig.catalogHistoryDays * DAY_MS),
            },
          },
          // O preço entra para achar "você subiu de X para Y" antes da perda.
          select: { mlItemId: true, status: true, snapshotAt: true, sellerPrice: true },
        })
      : Promise.resolve([]),
    winningIds.length > 0
      ? prisma.catalogCompetitionSnapshot.findMany({
          where: {
            organizationId,
            mlItemId: { in: winningIds },
            snapshotAt: { gte: new Date(todayStart.getTime() - 3 * DAY_MS) },
          },
          select: { mlItemId: true, status: true, snapshotAt: true },
        })
      : Promise.resolve([]),
  ]);

  const contestedByItem = groupPoints(contestedPoints);
  const winningByItem = groupPoints(winningPoints);

  const catalogLive: RotinaCatalogLive[] = catalogRows.map((row) => {
    const status = row.catalogStatus as CatalogLiveStatus;
    const history =
      status === "winning"
        ? (winningByItem.get(row.mlItemId) ?? [])
        : (contestedByItem.get(row.mlItemId) ?? []);
    const since =
      status === "winning" || status === "losing" || status === "shared"
        ? resolveStatusSince(history, status)
        : { since: null, truncated: false };
    return {
      mlItemId: row.mlItemId,
      title: row.titleSnapshot,
      sku: row.skuSnapshot,
      imageUrl: row.imageUrlSnapshot,
      mlStatus: row.mlStatus,
      status,
      sellerPrice: decimalToNumber(row.catalogSellerPrice),
      priceToWin: decimalToNumber(row.catalogPriceToWin),
      polledAt: row.catalogPolledAt?.toISOString() ?? null,
      statusSince: since.since,
      statusSinceTruncated: since.truncated,
      wonBackToday:
        status === "winning" &&
        !since.truncated &&
        isoIsToday(since.since, now, timeZone),
      catalogProductId: row.catalogProductId,
      competition:
        status === "winning" ? parseCatalogCompetitionSummary(row.catalogCompetitors) : null,
      recentRaise: status === "winning" ? null : resolveRecentRaise(history),
    };
  });

  const states: ActionStateSnapshot[] = stateRows.map((row) => ({
    mlItemId: row.mlItemId,
    rule: row.rule,
    status: row.status,
    firstSeenAt: row.firstSeenAt.toISOString(),
    lastSeenAt: row.lastSeenAt.toISOString(),
    statusChangedAt: row.statusChangedAt.toISOString(),
    snoozedUntil: row.snoozedUntil?.toISOString() ?? null,
    resolvedAt: row.resolvedAt?.toISOString() ?? null,
    reopenCount: row.reopenCount,
    relatedItemId: row.relatedItemId,
  }));

  return buildRotinaView({
    now,
    timeZone,
    settings,
    health: healthRows.map(healthRowToSnapshot),
    catalogLive,
    targets,
    states,
    lastRun: toRunSummary(lastRun),
    lastCompleteRunAt: lastComplete?.finishedAt?.toISOString() ?? null,
  });
}
