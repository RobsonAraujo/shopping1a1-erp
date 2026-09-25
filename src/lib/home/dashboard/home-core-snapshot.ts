import { prisma } from "@/lib/db/db";
import { getCatalogPollStats } from "@/lib/catalog-report/catalog-competition-poll-stats";
import { loadCatalogLosingAlerts } from "@/lib/home/catalog-losing-data";
import { loadOperationsSummaryFromDb } from "@/lib/compras/replenishment-cycle-data";
import { getOnboardingChecklistState } from "@/lib/onboarding/onboarding-checklist";
import { logServerError } from "@/lib/infra/server-public-error";
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
 * Custo medido em queries: 2 (onboarding) + 1 (operações) + 1 (catálogo
 * perdendo) + 2 (poll stats) + 1 (groupBy de produtos) + 1 (anúncios ativos)
 * + 3 (pendências) = 11 idas ao banco, todas indexadas por
 * `organizationId`, numa onda só. Não deixar crescer sem medir: o pool
 * padrão é pequeno (`DATABASE_POOL_MAX`, default 5) e o layout do dashboard
 * disputa as mesmas conexões.
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
  year: number,
): Promise<HomePendings> {
  const [failedInventoryRuns, pendingDreImports, dreMonths] = await Promise.all([
    // `InventoryMonthSnapshotRun` está FORA do tenant guard de propósito (é a
    // tabela de fan-out do cron). O filtro por organizationId aqui é
    // obrigatório e não é verificado em runtime — sem ele, contaríamos as
    // falhas de outros tenants em silêncio.
    prisma.inventoryMonthSnapshotRun.count({
      where: { organizationId, status: "failed" },
    }),
    prisma.dreReconciliationImport.count({
      where: { organizationId, status: "pending" },
    }),
    // Só year/month/syncedAt: o `payload` de cada snapshot tem o DRE inteiro
    // do mês e não pode entrar num carregamento de Home.
    prisma.dreMonthSnapshot.findMany({
      where: { organizationId, year },
      select: { year: true, month: true, syncedAt: true },
      orderBy: { month: "asc" },
    }),
  ]);

  return {
    failedInventoryRuns,
    pendingDreImports,
    dreMonths: dreMonths.map((month) => ({
      year: month.year,
      month: month.month,
      syncedAt: month.syncedAt?.toISOString() ?? null,
    })),
    closedInventoryMonths: [],
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
      guard("pendings", loadPendings(organizationId, now.getFullYear())),
    ]);

  return {
    ...snapshot,
    onboarding,
    operations,
    catalogLosing: catalogLosing ?? [],
    catalogPoll,
    catalog,
    pendings,
    failedSlices: failed,
  };
}
