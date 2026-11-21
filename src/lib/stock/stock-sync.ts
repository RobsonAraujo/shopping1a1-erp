import { prisma } from "@/lib/db/db";
import { logServerError } from "@/lib/infra/server-public-error";
import { toDbSellerId } from "@/lib/mercadolibre/seller-id";
import { syncStockOrders } from "@/lib/stock/stock-orders-sync";
import {
  linkNewSellerListings,
  refreshStockPositions,
  type PositionsProgress,
} from "@/lib/stock/stock-positions";

/**
 * Uma rodada de sincronização do estoque automático para um seller:
 *
 * 1. **Vendas:** pedidos alterados desde o cursor viram baixas, estornos e
 *    pendências (`stock-orders-sync.ts`), em fatias com orçamento de tempo.
 * 2. **Leitura do ML:** depósito e Full, conforme `positions`:
 *    - `touched`: só os itens que venderam agora (no máximo
 *      `BACKGROUND_TOUCHED_LIMIT` em segundo plano);
 *    - `auto`: todos os itens se a última leitura completa passou de
 *      `POSITIONS_FULL_REFRESH_MS`, senão só os tocados;
 *    - `all`: todos os itens.
 *
 * **Sem cron.** Roda quando alguém usa o ERP (`StockBackgroundSync`, em
 * segundo plano e no máximo a cada `STOCK_SYNC_STALE_MS`), pelos botões da
 * tela de Estoque e antes do fechamento mensal (o cron que já existe).
 */

/** A leitura completa do ML (todos os itens) é cara: no máximo a cada 2 h, e só na tela de Estoque. */
export const POSITIONS_FULL_REFRESH_MS = 2 * 60 * 60 * 1000;
/** Em segundo plano, não sincroniza de novo antes disto. */
export const STOCK_SYNC_STALE_MS = 10 * 60 * 1000;
/** Uma rodada sem terminar há mais que isto é considerada morta. */
const RUN_STALE_MS = 4 * 60 * 1000;
/** Em segundo plano: tempo máximo lendo vendas antes de parar e deixar o resto para a próxima. */
const BACKGROUND_ORDERS_BUDGET_MS = 45 * 1000;
/** Em segundo plano: no máximo esta quantidade de itens relidos no ML por rodada. */
const BACKGROUND_TOUCHED_LIMIT = 30;

export class StockNotActivatedError extends Error {
  constructor() {
    super("stock_not_activated");
  }
}

export class StockSyncBusyError extends Error {
  constructor() {
    super("stock_sync_busy");
  }
}

export type StockPositionsMode = "touched" | "auto" | "all";

export type StockSyncProgress =
  | { phase: "orders" }
  | ({ phase: "positions" } & PositionsProgress);

export type StockSyncRunResult = {
  /** Rodada em segundo plano dispensada: leitura fresca ou estoque não ativado. */
  skipped: "fresh" | "not_activated" | null;
  ordersRead: number;
  movementsCreated: number;
  reviewsCreated: number;
  /** `false` quando o orçamento de tempo acabou antes de ler todas as vendas. */
  ordersComplete: boolean;
  positionsRead: number;
  positionsFailed: number;
  fullPositions: boolean;
};

function skippedResult(skipped: "fresh" | "not_activated"): StockSyncRunResult {
  return {
    skipped,
    ordersRead: 0,
    movementsCreated: 0,
    reviewsCreated: 0,
    ordersComplete: true,
    positionsRead: 0,
    positionsFailed: 0,
    fullPositions: false,
  };
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === "string") : [];
}

export async function runStockSyncForSeller(input: {
  organizationId: string;
  mlUserId: number;
  accessToken: string;
  positions: StockPositionsMode;
  /**
   * Chamada em segundo plano: dispensa na hora (sem chamar o ML) se a
   * leitura está fresca ou o estoque não foi ativado, e respeita o orçamento
   * de tempo e o limite de itens.
   */
  background?: boolean;
  signal?: AbortSignal;
  onProgress?: (progress: StockSyncProgress) => void;
}): Promise<StockSyncRunResult> {
  const { organizationId, mlUserId, accessToken, signal } = input;
  const background = input.background === true;
  const settings = await prisma.stockSettings.findUnique({ where: { organizationId } });
  if (!settings) {
    if (background) return skippedResult("not_activated");
    throw new StockNotActivatedError();
  }

  const key = { organizationId, mlUserId: toDbSellerId(mlUserId) };
  const now = new Date();
  const positionsStale = (at: Date | null | undefined) =>
    !at || now.getTime() - at.getTime() > POSITIONS_FULL_REFRESH_MS;

  // Em segundo plano, leitura fresca não faz nada (só esta leitura no banco).
  if (background) {
    const current = await prisma.stockSyncState.findUnique({
      where: { organizationId_mlUserId: key },
      select: { lastOrdersSyncAt: true, lastPositionsSyncAt: true },
    });
    const ordersFresh =
      current?.lastOrdersSyncAt != null &&
      now.getTime() - current.lastOrdersSyncAt.getTime() < STOCK_SYNC_STALE_MS;
    const needsFullPositions = input.positions === "auto" && positionsStale(current?.lastPositionsSyncAt);
    if (ordersFresh && !needsFullPositions) return skippedResult("fresh");
  }

  // Reserva a rodada: quem chega com outra viva recebe "ocupado".
  const state = await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`stock-sync:${organizationId}:${mlUserId}`}))`;
    const existing = await tx.stockSyncState.findUnique({
      where: { organizationId_mlUserId: key },
    });
    // `lastRunStartedAt` só fica preenchido enquanto a rodada roda.
    const running =
      existing?.lastRunStartedAt != null &&
      now.getTime() - existing.lastRunStartedAt.getTime() < RUN_STALE_MS;
    if (running) throw new StockSyncBusyError();
    return tx.stockSyncState.upsert({
      where: { organizationId_mlUserId: key },
      create: { ...key, ordersCursor: settings.activatedAt, lastRunStartedAt: now },
      update: { lastRunStartedAt: now },
    });
  });

  try {
    input.onProgress?.({ phase: "orders" });
    const orders = await syncStockOrders({
      organizationId,
      sellerId: mlUserId,
      accessToken,
      activatedAt: settings.activatedAt,
      cursor: state.ordersCursor,
      sellerNodeIds: asStringArray(state.sellerNodeIds),
      now,
      budgetMs: background ? BACKGROUND_ORDERS_BUDGET_MS : undefined,
      signal,
      // Cada fatia concluída avança o cursor: cair no meio não perde o feito.
      onSliceDone: async (cursor) => {
        await prisma.stockSyncState.update({
          where: { organizationId_mlUserId: key },
          data: { ordersCursor: cursor },
        });
      },
    });
    // Só fica "fresco" quando leu todas as vendas: com atraso grande, a
    // próxima rodada (a tela chama de novo na hora) continua de onde parou.
    if (orders.complete) {
      await prisma.stockSyncState.update({
        where: { organizationId_mlUserId: key },
        data: { lastOrdersSyncAt: new Date() },
      });
    }

    const fullPositions =
      input.positions === "all" ||
      (input.positions === "auto" && positionsStale(state.lastPositionsSyncAt));
    const touched = background
      ? orders.touchedStockItemIds.slice(0, BACKGROUND_TOUCHED_LIMIT)
      : orders.touchedStockItemIds;
    const stockItemIds = fullPositions ? null : touched;

    if (fullPositions) {
      // Anúncio novo entra no Estoque antes da primeira venda. Falhar aqui
      // não segura a rodada: tenta de novo na próxima leitura completa.
      try {
        await linkNewSellerListings({ organizationId, mlUserId, accessToken });
      } catch (e) {
        logServerError("stock-sync linkNewSellerListings", e);
      }
    }

    let positionsRead = 0;
    let positionsFailed = 0;
    let sellerNodeIds = asStringArray(state.sellerNodeIds);
    if (stockItemIds === null || stockItemIds.length > 0) {
      const positions = await refreshStockPositions({
        organizationId,
        accessToken,
        stockItemIds,
        signal,
        onProgress: (p) => input.onProgress?.({ phase: "positions", ...p }),
      });
      positionsRead = positions.read;
      positionsFailed = positions.failed;
      sellerNodeIds = [...new Set([...sellerNodeIds, ...positions.sellerNodeIds])];
    }

    await prisma.stockSyncState.update({
      where: { organizationId_mlUserId: key },
      data: {
        lastRunStartedAt: null,
        sellerNodeIds,
        ...(fullPositions && positionsFailed === 0 ? { lastPositionsSyncAt: new Date() } : {}),
        lastError: positionsFailed > 0 ? `${positionsFailed} item(ns) sem leitura do ML` : null,
        lastErrorAt: positionsFailed > 0 ? new Date() : null,
      },
    });

    return {
      skipped: null,
      ordersRead: orders.ordersRead,
      movementsCreated: orders.movementsCreated,
      reviewsCreated: orders.reviewsCreated,
      ordersComplete: orders.complete,
      positionsRead,
      positionsFailed,
      fullPositions,
    };
  } catch (err) {
    await prisma.stockSyncState.update({
      where: { organizationId_mlUserId: key },
      data: {
        // Libera a rodada para a próxima tentativa.
        lastRunStartedAt: null,
        lastError: (err instanceof Error ? err.message : String(err)).slice(0, 500),
        lastErrorAt: new Date(),
      },
    });
    throw err;
  }
}

export type StockSyncStatus = {
  lastOrdersSyncAt: Date | null;
  lastPositionsSyncAt: Date | null;
  lastError: string | null;
  running: boolean;
};

export async function loadStockSyncStatus(organizationId: string): Promise<StockSyncStatus> {
  const rows = await prisma.stockSyncState.findMany({
    where: { organizationId },
    select: {
      lastOrdersSyncAt: true,
      lastPositionsSyncAt: true,
      lastError: true,
      lastRunStartedAt: true,
    },
  });
  const now = Date.now();
  const min = (dates: Array<Date | null>) => {
    const valid = dates.filter((d): d is Date => d != null);
    return valid.length === rows.length && valid.length > 0
      ? new Date(Math.min(...valid.map((d) => d.getTime())))
      : null;
  };
  return {
    lastOrdersSyncAt: min(rows.map((r) => r.lastOrdersSyncAt)),
    lastPositionsSyncAt: min(rows.map((r) => r.lastPositionsSyncAt)),
    lastError: rows.find((r) => r.lastError)?.lastError ?? null,
    running: rows.some(
      (r) => r.lastRunStartedAt != null && now - r.lastRunStartedAt.getTime() < RUN_STALE_MS,
    ),
  };
}
