import { prisma } from "@/lib/db/db";
import { getCatalogPollStats } from "@/lib/catalog-report/catalog-competition-poll-stats";
import { loadCatalogLosingAlerts } from "@/lib/home/catalog-losing-data";
import { loadOperationsSummaryFromDb } from "@/lib/compras/replenishment-cycle-data";
import { getOnboardingChecklistState } from "@/lib/onboarding/onboarding-checklist";
import { logServerError } from "@/lib/infra/server-public-error";
import { getZonedYearMonth } from "@/lib/mercadolibre/revenue-periods";
import {
  emptyHomeCoreSnapshot,
  type HomeCatalogHealth,
  type HomeCoreSnapshot,
  type HomePendings,
} from "@/lib/home/dashboard/home-core-types";

/**
 * O snapshot que a Home renderiza no servidor, sempre — não depende de quais
 * widgets estão visíveis, porque só tem leitura barata e indexada (contagens
 * e um punhado de linhas). É isso que garante conteúdo real na primeira
 * pintura, sem esperar JS.
 *
 * Tudo que é caro (DRE, apuração fiscal, evolução de estoque) fica fora daqui
 * e vai pela rota de batch, buscado só quando o widget está visível. Tudo que
 * chama o Mercado Livre fica fora daqui também.
 *
 * Regra de ouro: **uma slice que falha degrada o widget dela, nunca a
 * página**. Cada membro do `Promise.all` tem `.catch` próprio e registra o
 * nome em `failedSlices`.
 *
 * Custo medido em queries: 2 (onboarding) + 1 (operações) + 2 (catálogo
 * perdendo: as piores linhas + o total) + 2 (poll stats) + 1 (groupBy de
 * produtos) + 1 (anúncios ativos) + 3 (pendências) = 12 idas ao banco, todas
 * indexadas por `organizationId`, numa onda só. Não deixar crescer sem medir: o
 * pool padrão é pequeno (`DATABASE_POOL_MAX`, default 5) e o layout do dashboard
 * disputa as mesmas conexões.
 *
 * Projeção importa tanto quanto contagem: a leitura de conciliações pendentes
 * devolve os **meses** em vez de um `count`, e isso não custou query nenhuma —
 * os campos já estavam no índice (ver `loadPendings`).
 */

async function loadCatalogHealth(
  organizationId: string,
): Promise<HomeCatalogHealth> {
  const [productGroups, activeListingCount] = await Promise.all([
    // Um groupBy resolve total + "precisa revisar" — duas contagens seriam
    // duas idas ao banco pelo mesmo dado.
    prisma.product.groupBy({
      by: ["needsCostReview"],
      where: { organizationId },
      _count: { _all: true },
    }),
    prisma.listing.count({ where: { organizationId, mlStatus: "active" } }),
  ]);

  let productCount = 0;
  let needsCostReviewCount = 0;
  for (const group of productGroups) {
    const count = group._count._all;
    productCount += count;
    if (group.needsCostReview) needsCostReviewCount += count;
  }

  return { productCount, needsCostReviewCount, activeListingCount };
}

async function loadPendings(
  organizationId: string,
  now: Date,
): Promise<HomePendings> {
  const { year, month: currentMonth } = getZonedYearMonth(now);
  const [failedInventoryRuns, snapshots] = await Promise.all([
    // `InventoryMonthSnapshotRun` está FORA do tenant guard de propósito (é a
    // tabela de fan-out do cron). O filtro por organizationId aqui é
    // obrigatório e não é verificado em runtime — sem ele, contaríamos as
    // falhas de outros tenants em silêncio.
    prisma.inventoryMonthSnapshotRun.count({
      where: { organizationId, status: "failed" },
    }),
    // Só mês, syncedAt e um booleano da marca de conciliação: o `payload` de
    // cada snapshot tem o DRE inteiro do mês e não pode entrar na Home.
    // `$queryRaw` NÃO passa pelo tenant guard — o filtro por organization_id é
    // obrigatório e não tem rede de proteção.
    prisma.$queryRaw<
      Array<{ month: number; syncedAt: Date; reconciled: boolean }>
    >`select month,
             synced_at as "syncedAt",
             (payload -> 'reconciliation') is not null as reconciled
      from dre_month_snapshots
      where organization_id = ${organizationId} and year = ${year}`,
  ]);

  // Todos os meses até o corrente, com ou sem snapshot. Antes só vinham os
  // meses com snapshot — e como `syncedAt` é obrigatório no banco, o aviso de
  // "mês sem sincronizar" nunca disparava.
  const byMonth = new Map(snapshots.map((row) => [row.month, row]));
  const dreMonths: HomePendings["dreMonths"] = [];
  for (let month = 1; month <= currentMonth; month += 1) {
    const row = byMonth.get(month);
    dreMonths.push({
      year,
      month,
      syncedAt: row ? new Date(row.syncedAt).toISOString() : null,
      reconciled: Boolean(row?.reconciled),
    });
  }

  return {
    failedInventoryRuns,
    unreconciledDreMonths: dreMonths
      .filter(
        (row) =>
          row.month < currentMonth && row.syncedAt !== null && !row.reconciled,
      )
      .map(({ year: y, month }) => ({ year: y, month })),
    dreMonths,
    closedInventoryMonths: [],
    year,
  };
}

export async function loadHomeCoreSnapshot(
  organizationId: string,
  now: Date = new Date(),
): Promise<HomeCoreSnapshot> {
  const snapshot = emptyHomeCoreSnapshot();
  const failed: string[] = [];

  function guard<T>(slice: string, promise: Promise<T>): Promise<T | null> {
    return promise.catch((e: unknown) => {
      logServerError(`home/core-snapshot:${slice}`, e);
      failed.push(slice);
      return null;
    });
  }

  const [onboarding, operations, catalogLosing, catalogPoll, catalog, pendings] =
    await Promise.all([
      guard("onboarding", getOnboardingChecklistState(organizationId)),
      guard("operations", loadOperationsSummaryFromDb(organizationId)),
      guard("catalogLosing", loadCatalogLosingAlerts(organizationId)),
      guard("catalogPoll", getCatalogPollStats(organizationId)),
      guard("catalog", loadCatalogHealth(organizationId)),
      guard("pendings", loadPendings(organizationId, now)),
    ]);

  return {
    ...snapshot,
    onboarding,
    operations,
    catalogLosing: catalogLosing ?? { rows: [], total: 0 },
    catalogPoll,
    catalog,
    pendings,
    failedSlices: failed,
  };
}
