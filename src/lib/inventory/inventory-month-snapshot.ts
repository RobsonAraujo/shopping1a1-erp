import { reportsConfig } from "@/config/reports";
import { prisma } from "@/lib/db/db";
import { getZonedParts } from "@/lib/report-timezone";
import {
  enrichItemsWithFulfillmentStock,
  fetchOperationalListings,
} from "@/lib/mercadolibre/api";
import {
  collectInventoryIdsFromItem,
  isFulfillmentListing,
} from "@/lib/mercadolibre/fulfillment-stock";
import { resolveSellerAccessToken } from "@/lib/mercadolibre/persist-seller-tokens";
import { isKitItem, getItemSku } from "@/lib/mercadolibre/item-sku";
import { mlAvailableStockUnits } from "@/lib/mercadolibre/ml-available-stock";
import { loadStockReportProductsByMlItemId } from "@/lib/products/product-data";
import {
  defaultStockReportSnapshotDate,
  stockUnits,
} from "@/lib/inventory/inventory-stock-report";
import { logServerError } from "@/lib/infra/server-public-error";
import type {
  InventoryMonthSnapshotSource,
  InventoryMonthSnapshotStatus,
} from "@/generated/prisma/client";

/** Depois disso, um run que continua falhando fica parado até intervenção manual (fica visível via status="failed" + errorSummary). */
const MAX_ATTEMPTS = 5;
const UPSERT_CHUNK_SIZE = 25;

export type InventorySnapshotTargetMonth = { year: number; month: number };

/**
 * Mês-alvo do snapshot: o último mês já fechado, mesma regra que
 * `defaultStockReportSnapshotDate` já usa pro relatório ao vivo — não
 * precisa de lógica própria de "é fim de mês", o cron pode rodar todo dia.
 */
export function resolveInventorySnapshotTargetMonth(
  now: Date = new Date(),
): InventorySnapshotTargetMonth {
  const snapshotDate = defaultStockReportSnapshotDate(now);
  const parts = getZonedParts(
    snapshotDate,
    reportsConfig.catalogCompetitionTimezone,
  );
  return { year: parts.year, month: parts.month };
}

/** Mês corrente (ainda aberto) — usado pelo disparo manual de snapshot, que sempre captura "o estoque de hoje", nunca um mês já fechado. */
export function currentInventorySnapshotMonth(
  now: Date = new Date(),
): InventorySnapshotTargetMonth {
  const parts = getZonedParts(now, reportsConfig.catalogCompetitionTimezone);
  return { year: parts.year, month: parts.month };
}

/**
 * Garante 1 `InventoryMonthSnapshotRun` pendente por organização paga para o
 * mês-alvo — idempotente (`skipDuplicates`), então pode ser chamado toda
 * execução do cron sem duplicar nem sobrescrever runs já em andamento.
 *
 * Também reabre (`status -> pending`) qualquer run `manual` já concluído
 * pra esse mês: um snapshot manual do usuário (meio do mês, mês ainda
 * aberto) é sempre provisório — assim que esse mês vira "o último mês
 * fechado" e o cron chega aqui, o fechamento oficial (`source: auto`) deve
 * sempre prevalecer e sobrescrever o valor manual.
 */
export async function ensurePendingSnapshotRuns(
  target: InventorySnapshotTargetMonth,
): Promise<number> {
  const orgs = await prisma.organization.findMany({
    where: { status: { in: ["trialing", "active"] } },
    select: { id: true },
  });
  if (orgs.length === 0) return 0;

  await prisma.inventoryMonthSnapshotRun.updateMany({
    where: {
      year: target.year,
      month: target.month,
      source: "manual" satisfies InventoryMonthSnapshotSource,
      status: "done" satisfies InventoryMonthSnapshotStatus,
    },
    data: { status: "pending" satisfies InventoryMonthSnapshotStatus },
  });

  const result = await prisma.inventoryMonthSnapshotRun.createMany({
    data: orgs.map((org) => ({
      organizationId: org.id,
      year: target.year,
      month: target.month,
      source: "auto" satisfies InventoryMonthSnapshotSource,
    })),
    skipDuplicates: true,
  });
  return result.count;
}

/**
 * Próximo lote a processar — pendentes ou que já falharam (até
 * `MAX_ATTEMPTS`), mais antigos primeiro. Mesmo espírito do cursor
 * `lastCatalogCronPolledAt` do cron de catálogo, só que via `status`
 * explícito (aqui também guardamos tentativas e motivo de falha).
 *
 * `InventoryMonthSnapshotRun` fica de fora de `TENANT_SCOPED_MODELS` de
 * propósito — essa query varre TODAS as organizações, é o próprio mecanismo
 * de fan-out do cron (mesmo caso de `OrganizationMlSeller`).
 */
export async function resolveSnapshotRunsBatch(limit: number) {
  return prisma.inventoryMonthSnapshotRun.findMany({
    where: {
      status: { in: ["pending", "failed"] },
      attempts: { lt: MAX_ATTEMPTS },
    },
    orderBy: { updatedAt: "asc" },
    take: limit,
  });
}

type SnapshotListingRow = {
  mlItemId: string;
  sku: string | null;
  title: string;
  mlStock: number;
  mlStockOnTheWay: number;
  catalogListing: boolean;
  /** Ver `StockReportListingInput.inventoryIds` — congelado aqui pra
   * detecção de pool de Full compartilhado no relatório. */
  inventoryIds: string[];
};

/**
 * Todos os anúncios operacionais da organização, somando os sellers ML
 * ligados a ela (uma org pode ter mais de 1 seller — `OrganizationMlSeller`
 * é 1:N). Mesmo bulk call já usado na página ao vivo
 * (`fetchOperationalListings`), incluindo o estoque Full em processamento
 * ("a caminho", `enrichItemsWithFulfillmentStock`) — na tela ao vivo essa
 * busca (1 chamada ML por item Full) é cara demais pra rodar em toda
 * visita à página, por isso é feita via streaming depois do primeiro
 * render; aqui roda só 1x por organização por mês (ou sob demanda no
 * snapshot manual), então dá pra buscar direto sem essa complicação.
 */
async function collectOrgOperationalListings(
  organizationId: string,
): Promise<SnapshotListingRow[]> {
  const sellers = await prisma.organizationMlSeller.findMany({
    where: { organizationId },
    select: { mlUserId: true },
  });
  if (sellers.length === 0) return [];

  const byItemId = new Map<string, SnapshotListingRow>();
  for (const { mlUserId } of sellers) {
    const token = await resolveSellerAccessToken(mlUserId);
    if (!token) {
      throw new Error(`no_valid_token:${mlUserId}`);
    }
    const items = (
      await fetchOperationalListings(token, mlUserId, organizationId)
    ).filter((item) => !isKitItem(item));

    const fulfillmentByItemId = await enrichItemsWithFulfillmentStock(
      token,
      items,
    );

    for (const item of items) {
      if (byItemId.has(item.id)) continue;
      const fulfillment = fulfillmentByItemId.get(item.id);
      byItemId.set(item.id, {
        mlItemId: item.id,
        sku: getItemSku(item),
        title: item.title,
        mlStock: mlAvailableStockUnits(item),
        mlStockOnTheWay: isFulfillmentListing(item)
          ? stockUnits(fulfillment?.inProcess)
          : 0,
        catalogListing: item.catalog_listing === true,
        inventoryIds: collectInventoryIdsFromItem(item),
      });
    }
  }
  return [...byItemId.values()];
}

/**
 * Monta e persiste (upsert, idempotente) o snapshot de uma organização para
 * o mês-alvo. Custo/NCM vêm de `loadStockReportProductsByMlItemId`, que
 * (ao contrário de `loadStockReportProductsForListings`, usado no
 * relatório ao vivo) INCLUI produto inativado no ERP — aqui o snapshot é
 * histórico/auditoria (como DRE/Lucratividade), não a tela operacional de
 * Estoque, então um produto que ainda estava listado no ML naquele mês não
 * deve perder o custo só porque foi desativado depois.
 */
export async function buildAndPersistOrgSnapshot(
  organizationId: string,
  target: InventorySnapshotTargetMonth,
): Promise<{ itemsSnapshotted: number }> {
  const listings = await collectOrgOperationalListings(organizationId);
  if (listings.length === 0) return { itemsSnapshotted: 0 };

  const ids = listings.map((listing) => listing.mlItemId);
  const [warehouseRows, productsByMlItemId] = await Promise.all([
    prisma.warehouseStock.findMany({
      where: { organizationId, mlItemId: { in: ids } },
      select: { mlItemId: true, quantity: true },
    }),
    loadStockReportProductsByMlItemId(organizationId, ids),
  ]);
  const warehouseByItemId = new Map(
    warehouseRows.map((row) => [row.mlItemId, row.quantity]),
  );

  const rows = listings.map((listing) => {
    const product = productsByMlItemId.get(listing.mlItemId);
    return {
      organizationId,
      year: target.year,
      month: target.month,
      mlItemId: listing.mlItemId,
      sku: listing.sku,
      title: listing.title,
      ncm: product?.ncm ?? null,
      unitCost: product?.unitCost ?? null,
      warehouseStock: stockUnits(warehouseByItemId.get(listing.mlItemId) ?? 0),
      mlStock: stockUnits(listing.mlStock),
      mlStockOnTheWay: stockUnits(listing.mlStockOnTheWay),
      catalogListing: listing.catalogListing,
      inventoryIds: listing.inventoryIds,
    };
  });

  for (let i = 0; i < rows.length; i += UPSERT_CHUNK_SIZE) {
    const chunk = rows.slice(i, i + UPSERT_CHUNK_SIZE);
    await Promise.all(
      chunk.map((row) =>
        prisma.inventoryStockMonthSnapshot.upsert({
          where: {
            organizationId_mlItemId_year_month: {
              organizationId: row.organizationId,
              mlItemId: row.mlItemId,
              year: row.year,
              month: row.month,
            },
          },
          create: row,
          update: row,
        }),
      ),
    );
  }

  return { itemsSnapshotted: rows.length };
}

export type InventorySnapshotRunResult = {
  organizationId: string;
  year: number;
  month: number;
  ok: boolean;
  itemsSnapshotted?: number;
  error?: string;
};

/**
 * Orquestra 1 execução do cron: garante os runs pendentes do mês-alvo e
 * processa um lote pequeno (pendentes/retentativas), 1 organização por vez
 * — falha de uma organização (token ML inválido, etc.) não derruba as
 * outras do lote.
 */
export async function runInventoryMonthSnapshotBatch(
  batchSize: number,
): Promise<InventorySnapshotRunResult[]> {
  const target = resolveInventorySnapshotTargetMonth();
  await ensurePendingSnapshotRuns(target);

  const runs = await resolveSnapshotRunsBatch(batchSize);
  const results: InventorySnapshotRunResult[] = [];

  for (const run of runs) {
    await prisma.inventoryMonthSnapshotRun.update({
      where: { id: run.id },
      data: {
        status: "in_progress" satisfies InventoryMonthSnapshotStatus,
        attempts: { increment: 1 },
        startedAt: new Date(),
      },
    });

    try {
      const { itemsSnapshotted } = await buildAndPersistOrgSnapshot(
        run.organizationId,
        { year: run.year, month: run.month },
      );
      await prisma.inventoryMonthSnapshotRun.update({
        where: { id: run.id },
        data: {
          status: "done" satisfies InventoryMonthSnapshotStatus,
          // Qualquer run que o cron processa vira "auto" — mesmo que tenha
          // nascido de um snapshot manual reaberto (ver ensurePendingSnapshotRuns):
          // a partir daqui é o fechamento oficial de fim de mês.
          source: "auto" satisfies InventoryMonthSnapshotSource,
          itemsSnapshotted,
          completedAt: new Date(),
          errorSummary: null,
        },
      });
      results.push({
        organizationId: run.organizationId,
        year: run.year,
        month: run.month,
        ok: true,
        itemsSnapshotted,
      });
    } catch (e) {
      logServerError(
        `inventory-month-snapshot org=${run.organizationId} ${run.year}-${run.month}`,
        e,
      );
      const message = e instanceof Error ? e.message : "snapshot_failed";
      await prisma.inventoryMonthSnapshotRun.update({
        where: { id: run.id },
        data: {
          status: "failed" satisfies InventoryMonthSnapshotStatus,
          source: "auto" satisfies InventoryMonthSnapshotSource,
          errorSummary: message.slice(0, 500),
        },
      });
      results.push({
        organizationId: run.organizationId,
        year: run.year,
        month: run.month,
        ok: false,
        error: message,
      });
    }
  }

  return results;
}

export type ManualInventorySnapshotResult =
  | {
      ok: true;
      year: number;
      month: number;
      itemsSnapshotted: number;
    }
  | { ok: false; year: number; month: number; error: string };

/**
 * Disparo manual (usuário, na tela de Histórico): captura o estoque de
 * "agora" pro mês corrente — útil quando alguém precisa de um corte antes
 * do fechamento automático de fim de mês (ex.: mandar pra contabilidade no
 * meio do mês). Roda direto (sem passar pela fila/lote do cron, já que é 1
 * organização só, disparada sob demanda) e marca `source: "manual"` — fica
 * provisório até o fechamento automático oficial desse mês substituir.
 */
export async function triggerManualInventoryMonthSnapshot(
  organizationId: string,
): Promise<ManualInventorySnapshotResult> {
  const target = currentInventorySnapshotMonth();

  await prisma.inventoryMonthSnapshotRun.upsert({
    where: {
      organizationId_year_month: {
        organizationId,
        year: target.year,
        month: target.month,
      },
    },
    create: {
      organizationId,
      year: target.year,
      month: target.month,
      source: "manual" satisfies InventoryMonthSnapshotSource,
      status: "in_progress" satisfies InventoryMonthSnapshotStatus,
      attempts: 1,
      startedAt: new Date(),
    },
    update: {
      status: "in_progress" satisfies InventoryMonthSnapshotStatus,
      attempts: { increment: 1 },
      startedAt: new Date(),
    },
  });

  try {
    const { itemsSnapshotted } = await buildAndPersistOrgSnapshot(
      organizationId,
      target,
    );
    await prisma.inventoryMonthSnapshotRun.update({
      where: {
        organizationId_year_month: {
          organizationId,
          year: target.year,
          month: target.month,
        },
      },
      data: {
        status: "done" satisfies InventoryMonthSnapshotStatus,
        source: "manual" satisfies InventoryMonthSnapshotSource,
        itemsSnapshotted,
        completedAt: new Date(),
        errorSummary: null,
      },
    });
    return { ok: true, year: target.year, month: target.month, itemsSnapshotted };
  } catch (e) {
    logServerError(
      `inventory-month-snapshot manual org=${organizationId} ${target.year}-${target.month}`,
      e,
    );
    const message = e instanceof Error ? e.message : "snapshot_failed";
    await prisma.inventoryMonthSnapshotRun.update({
      where: {
        organizationId_year_month: {
          organizationId,
          year: target.year,
          month: target.month,
        },
      },
      data: {
        status: "failed" satisfies InventoryMonthSnapshotStatus,
        source: "manual" satisfies InventoryMonthSnapshotSource,
        errorSummary: message.slice(0, 500),
      },
    });
    return { ok: false, year: target.year, month: target.month, error: message };
  }
}
