import { rotinaConfig } from "@/config/rotina";
import { stockPlanningConfig } from "@/config/stock-planning";
import type { ListingActionState, ListingHealthRun } from "@/generated/prisma";
import { prisma } from "@/lib/db/db";
import { logServerError } from "@/lib/infra/server-public-error";
import {
  loadAdsMetricsByItem,
  loadFinancialEvaluationRowsForItems,
  type AdsLoad,
  type FinancialEvaluationRow,
} from "@/lib/lucratividade/financial-evaluation-data";
import { marginExclusionReason } from "@/lib/lucratividade/margin-summary";
import {
  fetchItemsByIdsBatched,
  fetchOperationalListingIds,
} from "@/lib/mercadolibre/api";
import { mapWithConcurrency } from "@/lib/mercadolibre/concurrency";
import {
  fetchItemPromotions,
  pickEarliestActivePromotion,
} from "@/lib/mercadolibre/item-promotions";
import {
  toPromotionWindows,
  type PromotionWindow,
} from "@/lib/mercadolibre/promotion-coverage";
import { getItemSku } from "@/lib/mercadolibre/item-sku";
import { siteIdFromItemId } from "@/lib/mercadolibre/listing-fees";
import { fetchUnitsSoldForItemsInWindowCached } from "@/lib/mercadolibre/sales-window-cache";
import type { ItemBody } from "@/lib/mercadolibre/types";
import { computeListingFloors, type ListingFloors } from "@/lib/rotina/floors";
import { pricingInputsFromRow, snapshotToHealthData } from "@/lib/rotina/health-row";
import {
  detectNewCatalogLinks,
  resolveCatalogLinks,
  type LinkCandidate,
} from "@/lib/rotina/links";
import { loadListingTargets } from "@/lib/rotina/listing-targets";
import type {
  RotinaRefreshEvent,
  RotinaRefreshResult,
} from "@/lib/rotina/refresh-events";
import { reconcileRefreshStates, stateKey } from "@/lib/rotina/reconcile";
import { loadRotinaSettings } from "@/lib/rotina/rotina-settings";
import { REFRESH_CONDITION_RULES } from "@/lib/rotina/rule-registry";
import { effectiveMinMarginPercent, evaluateRefreshRules } from "@/lib/rotina/rules";
import type { RotinaSettings } from "@/lib/rotina/settings-shared";
import type {
  ActionStateSnapshot,
  ListingTargetValues,
  RotinaListingSnapshot,
} from "@/lib/rotina/types";

/**
 * "Atualizar" da Rotina: calcula margem, os dois preços mínimos, ADS e
 * promoção de cada anúncio operacional e grava em `ListingHealth`. É a única
 * parte da Rotina que chama o Mercado Livre — a página só lê o banco.
 *
 * Desenho:
 * - **Trava** por organização (`pg_advisory_xact_lock` + run `running` com
 *   batimento): duas abas não rodam ao mesmo tempo.
 * - **Lotes gravados um a um**: cada lote sai em transação própria (retrato +
 *   reconciliação das ações). Cair no meio não perde o que já foi feito.
 * - **Orçamento de tempo**: passou dele, a run fica `partial` e a próxima
 *   chamada continua de onde parou (o overlay chama sozinho).
 */

export class RotinaRefreshBusyError extends Error {
  constructor() {
    super("rotina_refresh_busy");
  }
}

const OPERATIONAL_STATUSES = new Set(["active", "paused"]);

function budgetFromEnv(): number {
  const raw = Number(process.env.ROTINA_REFRESH_BUDGET_MS);
  return Number.isFinite(raw) && raw > 0 ? raw : rotinaConfig.refreshBudgetMs;
}

function toStateSnapshot(row: ListingActionState): ActionStateSnapshot {
  return {
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
  };
}

function relatedIds(item: ItemBody): string[] {
  return (item.item_relations ?? [])
    .map((relation) => relation?.id)
    .filter((id): id is string => typeof id === "string" && id.length > 0);
}

async function acquireRun(
  organizationId: string,
  scope: "all" | "items",
  itemIds: string[],
  now: Date,
): Promise<{ run: ListingHealthRun; resumed: boolean }> {
  return prisma.$transaction(async (tx) => {
    // Duas requisições ao mesmo tempo: sem a trava as duas leriam "nenhuma
    // rodando" e as duas começariam. `$executeRaw` e não `$queryRaw`: a função
    // devolve `void`, que o Prisma 7 não consegue desserializar.
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`rotina-refresh:${organizationId}`}))`;

    const staleBefore = new Date(now.getTime() - rotinaConfig.runHeartbeatStaleMs);
    const alive = await tx.listingHealthRun.findFirst({
      where: { organizationId, status: "running", heartbeatAt: { gt: staleBefore } },
      select: { id: true },
    });
    if (alive) throw new RotinaRefreshBusyError();

    // Função encerrada no meio (serverless): a rodada completa vira retomável,
    // o recálculo de anúncio avulso só fecha.
    await tx.listingHealthRun.updateMany({
      where: { organizationId, status: "running", scope: "all" },
      data: { status: "partial", errorSummary: "Interrompida antes de terminar." },
    });
    await tx.listingHealthRun.updateMany({
      where: { organizationId, status: "running", scope: "items" },
      data: { status: "failed", finishedAt: now },
    });

    if (scope === "items") {
      const run = await tx.listingHealthRun.create({
        data: {
          organizationId,
          status: "running",
          scope: "items",
          plannedItemIds: itemIds,
          itemsTotal: itemIds.length,
          startedAt: now,
          heartbeatAt: now,
        },
      });
      return { run, resumed: false };
    }

    const resumeAfter = new Date(now.getTime() - rotinaConfig.runResumeWindowMs);
    const partial = await tx.listingHealthRun.findFirst({
      where: {
        organizationId,
        scope: "all",
        status: "partial",
        startedAt: { gte: resumeAfter },
      },
      orderBy: { startedAt: "desc" },
    });
    if (partial) {
      const run = await tx.listingHealthRun.update({
        where: { id: partial.id },
        data: { status: "running", heartbeatAt: now },
      });
      return { run, resumed: true };
    }

    await tx.listingHealthRun.updateMany({
      where: { organizationId, scope: "all", status: "partial" },
      data: { status: "failed", finishedAt: now },
    });
    const completed = await tx.listingHealthRun.count({
      where: { organizationId, scope: "all", status: "ok" },
    });
    const run = await tx.listingHealthRun.create({
      data: {
        organizationId,
        status: "running",
        scope: "all",
        isBaseline: completed === 0,
        startedAt: now,
        heartbeatAt: now,
      },
    });
    return { run, resumed: false };
  });
}

type PreviousHealth = {
  mlItemId: string;
  catalogListing: boolean;
  sku: string | null;
  catalogProductId: string | null;
  relatedItemIds: string[];
  linkedOwnItemId: string | null;
  firstSeenAt: Date;
  computedAt: Date;
};

type BuildContext = {
  token: string;
  userId: number;
  settings: RotinaSettings;
  targets: Map<string, ListingTargetValues>;
  links: Map<string, string>;
  unitsSold: Record<string, number> | null;
  previous: Map<string, PreviousHealth>;
};

async function buildSnapshot(
  row: FinancialEvaluationRow,
  item: ItemBody,
  ctx: BuildContext,
  stats: { mlCalls: number; promotionFailures: number },
): Promise<RotinaListingSnapshot> {
  const target = ctx.targets.get(row.mlItemId) ?? null;
  const minMargin = effectiveMinMarginPercent(row.catalogListing, ctx.settings, target);

  let floors: ListingFloors;
  try {
    floors = await computeListingFloors(ctx.token, ctx.userId, row, item, minMargin);
  } catch (e) {
    logServerError("rotina-refresh floors", e);
    floors = {
      targetPercent: minMargin,
      mcPrice: null,
      afterAdsPrice: null,
      reason: "incomplete",
      refined: false,
      bands: [],
      mlCalls: 0,
    };
  }
  stats.mlCalls += floors.mlCalls;

  // Data de término só importa em próprio com promoção (é a regra "vencendo").
  let promotionName: string | null = null;
  let promotionType: string | null = null;
  let promotionEndsAt: string | null = null;
  let promotionEndKnown = true;
  let promotionWindows: PromotionWindow[] | null = null;
  const promotionKnown = row.promotionKnown !== false;
  if (!row.catalogListing && row.hasPromotion && promotionKnown) {
    try {
      stats.mlCalls += 1;
      const promotions = await fetchItemPromotions(ctx.token, row.mlItemId, {
        maxAttempts: 1,
      });
      const active = pickEarliestActivePromotion(promotions);
      // A mesma resposta traz as programadas: é o que diz se o anúncio fica
      // mesmo sem promoção quando a ativa acabar.
      promotionWindows = toPromotionWindows(promotions);
      if (active) {
        promotionName = active.name;
        promotionType = active.type;
        promotionEndsAt = active.finishDate.toISOString();
      }
    } catch {
      promotionEndKnown = false;
      stats.promotionFailures += 1;
    }
  }

  const sold = ctx.unitsSold?.[row.mlItemId];
  const unitsPerDay =
    sold !== undefined && ctx.settings.salesAverageWindowDays > 0
      ? Math.round((sold / ctx.settings.salesAverageWindowDays) * 1000) / 1000
      : null;

  const previous = ctx.previous.get(row.mlItemId);
  const now = new Date().toISOString();

  return {
    mlItemId: row.mlItemId,
    title: row.title,
    sku: row.sku,
    imageUrl: row.imageUrl,
    permalink: row.permalink,
    catalogListing: row.catalogListing,
    mlStatus: row.status,
    salePrice: row.salePrice,
    regularPrice: row.regularPrice,
    promotionKnown,
    hasPromotion: row.hasPromotion,
    promotionName,
    promotionType,
    promotionEndsAt,
    promotionEndKnown,
    promotionWindows,
    marginPercent: row.breakdown?.marginPercent ?? null,
    marginValue: row.breakdown?.marginValue ?? null,
    marginAfterAdsPercent: row.marginAfterAdsPercent,
    marginAfterAdsValue: row.marginAfterAdsValue,
    exclusionReason: marginExclusionReason(row),
    floorTargetPercent: floors.targetPercent,
    floorMcPrice: floors.mcPrice,
    floorAfterAdsPrice: floors.afterAdsPrice,
    floorReason: floors.reason,
    floorRefined: floors.refined,
    floorBands: floors.bands,
    pmaPrice: row.pmaPrice,
    unitsPerDay,
    adsAvailable: row.adsMetricsAvailable,
    adsStatus: row.adsStatus,
    adsCost: row.adsCost,
    tacosPercent: row.tacosPercent,
    adsPeriodDays: row.adsPeriodDays,
    tags: item.tags ?? [],
    catalogProductId: item.catalog_product_id ?? null,
    relatedItemIds: relatedIds(item),
    linkedOwnItemId: row.catalogListing ? (ctx.links.get(row.mlItemId) ?? null) : null,
    listedAt: item.date_created
      ? new Date(item.date_created).toISOString()
      : null,
    firstSeenAt: previous?.firstSeenAt.toISOString() ?? now,
    computedAt: now,
    pricingInputs: pricingInputsFromRow(row),
  };
}

async function saveChunk(args: {
  organizationId: string;
  run: ListingHealthRun;
  snapshots: RotinaListingSnapshot[];
  settings: RotinaSettings;
  targets: Map<string, ListingTargetValues>;
  previous: Map<string, PreviousHealth>;
  itemsDone: number;
}) {
  const { organizationId, run, snapshots } = args;
  const now = new Date();
  const ids = snapshots.map((snapshot) => snapshot.mlItemId);

  const existingStates = await prisma.listingActionState.findMany({
    where: {
      organizationId,
      mlItemId: { in: ids },
      rule: { in: [...REFRESH_CONDITION_RULES] },
    },
  });
  const stateIdByKey = new Map(
    existingStates.map((state) => [stateKey(state.mlItemId, state.rule), state.id]),
  );

  const firing = new Set<string>();
  for (const snapshot of snapshots) {
    const hits = evaluateRefreshRules(snapshot, {
      settings: args.settings,
      target: args.targets.get(snapshot.mlItemId) ?? null,
      now,
      timeZone: rotinaConfig.timeZone,
    });
    for (const rule of hits) firing.add(stateKey(snapshot.mlItemId, rule));
  }
  const writes = reconcileRefreshStates({
    itemIds: ids,
    rules: REFRESH_CONDITION_RULES,
    firing,
    existing: existingStates.map(toStateSnapshot),
  });

  // Vínculo de catálogo novo: só fora da baseline e só em rodada completa —
  // na primeira rodada todo vínculo antigo pareceria novo.
  const newLinks =
    run.scope === "all" && !run.isBaseline
      ? detectNewCatalogLinks({
          links: new Map(
            snapshots
              .filter((snapshot) => snapshot.linkedOwnItemId)
              .map((snapshot) => [snapshot.mlItemId, snapshot.linkedOwnItemId!]),
          ),
          previousLinkByCatalogId: new Map(
            snapshots
              .filter((snapshot) => args.previous.has(snapshot.mlItemId))
              .map((snapshot) => [
                snapshot.mlItemId,
                args.previous.get(snapshot.mlItemId)!.linkedOwnItemId,
              ]),
          ),
          listedAtByCatalogId: new Map(
            snapshots.map((snapshot) => [snapshot.mlItemId, snapshot.listedAt]),
          ),
          now,
          maxAgeDays: rotinaConfig.takeoverMaxAgeDays,
        })
      : [];

  const idsFor = (op: string) =>
    writes
      .filter((write) => write.op === op)
      .map((write) => stateIdByKey.get(stateKey(write.mlItemId, write.rule)))
      .filter((id): id is string => Boolean(id));

  await prisma.$transaction(
    async (tx) => {
      for (const snapshot of snapshots) {
        const data = snapshotToHealthData(snapshot, run.id);
        // `create` explícito (e não upsert por chave): um `mlItemId` de outra
        // organização faria o upsert sobrescrever a linha dela em silêncio.
        if (args.previous.has(snapshot.mlItemId)) {
          await tx.listingHealth.update({
            where: { mlItemId: snapshot.mlItemId },
            data,
          });
        } else {
          await tx.listingHealth.create({
            data: { mlItemId: snapshot.mlItemId, organizationId, ...data },
          });
        }
      }

      const creates = writes.filter((write) => write.op === "create");
      if (creates.length > 0) {
        await tx.listingActionState.createMany({
          data: creates.map((write) => ({
            organizationId,
            mlItemId: write.mlItemId,
            rule: write.rule,
            status: "open" as const,
            firstSeenAt: now,
            lastSeenAt: now,
            statusChangedAt: now,
          })),
          skipDuplicates: true,
        });
      }
      const touchIds = idsFor("touch");
      if (touchIds.length > 0) {
        await tx.listingActionState.updateMany({
          where: { organizationId, id: { in: touchIds } },
          data: { lastSeenAt: now },
        });
      }
      const reopenIds = idsFor("reopen");
      if (reopenIds.length > 0) {
        await tx.listingActionState.updateMany({
          where: { organizationId, id: { in: reopenIds } },
          data: {
            status: "open",
            firstSeenAt: now,
            lastSeenAt: now,
            statusChangedAt: now,
            resolvedAt: null,
            snoozedUntil: null,
            reopenCount: { increment: 1 },
          },
        });
      }
      const resolveIds = idsFor("resolve");
      if (resolveIds.length > 0) {
        await tx.listingActionState.updateMany({
          where: { organizationId, id: { in: resolveIds } },
          data: { status: "resolved", resolvedAt: now, statusChangedAt: now },
        });
      }

      for (const link of newLinks) {
        await tx.listingActionState.upsert({
          where: {
            organizationId_mlItemId_rule: {
              organizationId,
              mlItemId: link.catalogItemId,
              rule: "catalog_takeover",
            },
          },
          create: {
            organizationId,
            mlItemId: link.catalogItemId,
            rule: "catalog_takeover",
            status: "open",
            firstSeenAt: now,
            lastSeenAt: now,
            statusChangedAt: now,
            relatedItemId: link.ownItemId,
          },
          update: {
            status: "open",
            firstSeenAt: now,
            lastSeenAt: now,
            statusChangedAt: now,
            resolvedAt: null,
            relatedItemId: link.ownItemId,
          },
        });
      }

      await tx.listingHealthRun.update({
        where: { id: run.id },
        data: { itemsDone: args.itemsDone, heartbeatAt: now },
      });
    },
    { timeout: 30_000, maxWait: 10_000 },
  );
}

export async function runRotinaRefresh(
  organizationId: string,
  params: {
    token: string;
    userId: number;
    /** Recalcular só estes anúncios (chip "recalcular"). */
    itemIds?: string[];
    budgetMs?: number;
    signal?: AbortSignal;
    onEvent?: (event: RotinaRefreshEvent) => void;
  },
): Promise<RotinaRefreshResult> {
  const startedMs = Date.now();
  const budgetMs = params.budgetMs ?? budgetFromEnv();
  const scope = params.itemIds && params.itemIds.length > 0 ? "items" : "all";
  const emit = params.onEvent ?? (() => {});
  const { run, resumed } = await acquireRun(
    organizationId,
    scope,
    params.itemIds ?? [],
    new Date(),
  );

  const warnings: string[] = [];
  const stats = { mlCalls: 0, promotionFailures: 0 };
  const timings: Record<string, number> = {};
  const time = async <T>(label: string, work: () => Promise<T>): Promise<T> => {
    const t0 = Date.now();
    try {
      return await work();
    } finally {
      timings[label] = (timings[label] ?? 0) + (Date.now() - t0);
    }
  };
  let processed = 0;
  let total = 0;

  try {
    let planned = run.plannedItemIds;
    if (scope === "all" && !resumed) {
      emit({ type: "stage", stage: "listing", message: "Buscando seus anúncios no Mercado Livre…" });
      planned = await time("listing", () =>
        fetchOperationalListingIds(params.token, params.userId, organizationId),
      );
      await prisma.listingHealthRun.update({
        where: { id: run.id },
        data: { plannedItemIds: planned, itemsTotal: planned.length, heartbeatAt: new Date() },
      });
    }

    emit({ type: "stage", stage: "listing", message: "Lendo os anúncios…" });
    const items = await time("items", () =>
      fetchItemsByIdsBatched(params.token, planned),
    );
    const operational = items.filter((item) => OPERATIONAL_STATUSES.has(item.status));
    const itemById = new Map(operational.map((item) => [item.id, item]));
    const unreadable = planned.length - items.length;
    if (unreadable > 0) {
      warnings.push(`${unreadable} anúncio(s) não puderam ser lidos no Mercado Livre nesta rodada.`);
    }

    const previousRows = await prisma.listingHealth.findMany({
      where: { organizationId },
      select: {
        mlItemId: true,
        runId: true,
        catalogListing: true,
        sku: true,
        catalogProductId: true,
        relatedItemIds: true,
        linkedOwnItemId: true,
        firstSeenAt: true,
        computedAt: true,
      },
    });
    const previous = new Map(previousRows.map((row) => [row.mlItemId, row]));
    const doneIds = new Set(
      resumed ? previousRows.filter((row) => row.runId === run.id).map((row) => row.mlItemId) : [],
    );

    // Mais desatualizados primeiro: se o orçamento acabar, o que ficou para a
    // próxima chamada é o que foi calculado mais recentemente.
    const pending = operational
      .filter((item) => !doneIds.has(item.id))
      .sort(
        (a, b) =>
          (previous.get(a.id)?.computedAt.getTime() ?? 0) -
          (previous.get(b.id)?.computedAt.getTime() ?? 0),
      );
    total = scope === "all" ? operational.length : pending.length;
    processed = scope === "all" ? operational.length - pending.length : 0;

    // Vínculo catálogo → próprio sobre TODOS os anúncios (não só o lote): o
    // próprio pode estar em outro lote. No recálculo avulso, os próprios vêm
    // também do retrato salvo.
    const candidates: LinkCandidate[] = operational.map((item) => ({
      mlItemId: item.id,
      catalogListing: item.catalog_listing === true,
      sku: getItemSku(item),
      catalogProductId: item.catalog_product_id ?? null,
      relatedItemIds: relatedIds(item),
    }));
    if (scope === "items") {
      for (const row of previousRows) {
        if (itemById.has(row.mlItemId) || row.catalogListing) continue;
        candidates.push({
          mlItemId: row.mlItemId,
          catalogListing: false,
          sku: row.sku,
          catalogProductId: row.catalogProductId,
          relatedItemIds: row.relatedItemIds,
        });
      }
    }
    const links = resolveCatalogLinks(candidates);

    const [settings, targets] = await Promise.all([
      loadRotinaSettings(organizationId),
      loadListingTargets(organizationId),
    ]);

    const pendingIds = pending.map((item) => item.id);
    let adsLoad: AdsLoad = { map: new Map(), available: true, unavailableReason: null };
    let unitsSold: Record<string, number> | null = null;
    if (pendingIds.length > 0) {
      emit({ type: "stage", stage: "computing", message: "Lendo ADS e vendas recentes…" });
      adsLoad = await time("ads", () =>
        loadAdsMetricsByItem(params.token, siteIdFromItemId(pendingIds[0]), pendingIds),
      );
      if (!adsLoad.available) {
        warnings.push("O Product Ads não respondeu: as regras de ADS ficam de fora nesta rodada.");
      }
      unitsSold = await time("units", () =>
        fetchUnitsSoldForItemsInWindowCached(
          organizationId,
          params.token,
          params.userId,
          pendingIds,
          settings.salesAverageWindowDays,
          stockPlanningConfig.salesWindowDateField,
        ),
      ).catch((e: unknown) => {
        logServerError("rotina-refresh units", e);
        warnings.push("Não deu para ler as vendas recentes: a ordem por impacto fica aproximada.");
        return null;
      });
    }

    const ctx: BuildContext = {
      token: params.token,
      userId: params.userId,
      settings,
      targets,
      links,
      unitsSold,
      previous,
    };

    emit({ type: "progress", done: processed, total });
    emit({
      type: "stage",
      stage: "computing",
      message: "Calculando margens e preços mínimos…",
    });

    let stoppedEarly = false;
    for (let offset = 0; offset < pending.length; offset += rotinaConfig.refreshChunkSize) {
      if (params.signal?.aborted || Date.now() - startedMs > budgetMs) {
        stoppedEarly = true;
        break;
      }
      const chunk = pending.slice(offset, offset + rotinaConfig.refreshChunkSize);
      const rows = await time("rows", () =>
        loadFinancialEvaluationRowsForItems(
          params.token,
          params.userId,
          organizationId,
          chunk,
          { adsLoad, signal: params.signal },
        ),
      );
      const snapshots = await time("floors", () =>
        mapWithConcurrency(rows, rotinaConfig.floorConcurrency, (row) =>
          buildSnapshot(row, itemById.get(row.mlItemId)!, ctx, stats),
        ),
      );
      processed += chunk.length;
      await time("save", () =>
        saveChunk({
          organizationId,
          run,
          snapshots,
          settings,
          targets,
          previous,
          itemsDone: processed,
        }),
      );
      emit({ type: "progress", done: processed, total });
    }

    if (stats.promotionFailures > 0) {
      warnings.push(
        `${stats.promotionFailures} promoção(ões) sem data de término lida nesta rodada.`,
      );
    }

    const finished = !stoppedEarly;
    if (finished && scope === "all") {
      emit({ type: "stage", stage: "finishing", message: "Fechando a rodada…" });
      // Só sai do retrato o que o ML confirmou que não está mais ativo/pausado
      // (ou que nem apareceu na listagem). Falha de leitura NÃO apaga: senão
      // um anúncio "resolveria" todas as ações só porque o ML engasgou.
      const plannedSet = new Set(planned);
      const fetchedNotOperational = new Set(
        items.filter((item) => !OPERATIONAL_STATUSES.has(item.status)).map((item) => item.id),
      );
      const removable = previousRows
        .map((row) => row.mlItemId)
        .filter((id) => !plannedSet.has(id) || fetchedNotOperational.has(id));
      if (removable.length > 0) {
        await prisma.listingHealth.deleteMany({
          where: { organizationId, mlItemId: { in: removable } },
        });
        await prisma.listingActionState.updateMany({
          where: {
            organizationId,
            mlItemId: { in: removable },
            rule: { in: [...REFRESH_CONDITION_RULES] },
            status: { in: ["open", "done", "snoozed"] },
          },
          data: { status: "resolved", resolvedAt: new Date(), statusChangedAt: new Date() },
        });
      }
    }

    const status = finished ? "ok" : "partial";
    await prisma.listingHealthRun.update({
      where: { id: run.id },
      data: {
        // Recálculo avulso nunca fica "partial" (não é retomado).
        status: finished ? "ok" : scope === "all" ? "partial" : "failed",
        finishedAt: finished ? new Date() : null,
        itemsDone: processed,
        heartbeatAt: new Date(),
        warnings,
      },
    });

    console.info(
      `[rotina-refresh] org=${organizationId} scope=${scope} status=${status} items=${processed}/${total} ` +
        `ms=${Date.now() - startedMs} mlCallsFloors+promos≈${stats.mlCalls} timings=${JSON.stringify(timings)}`,
    );

    return { runId: run.id, status, done: processed, total, warnings };
  } catch (e) {
    await prisma.listingHealthRun
      .update({
        where: { id: run.id },
        data: {
          status: scope === "all" && processed > 0 ? "partial" : "failed",
          errorSummary: e instanceof Error ? e.message.slice(0, 500) : "erro",
          heartbeatAt: new Date(),
        },
      })
      .catch(() => {});
    throw e;
  }
}
