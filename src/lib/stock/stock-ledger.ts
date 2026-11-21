import { prisma } from "@/lib/db/db";
import { allocateLotsForMovements } from "@/lib/stock/stock-lots";
import type {
  StockLocation,
  StockMovementSource,
  StockMovementType,
} from "@/generated/prisma";

/**
 * Escrita no livro de estoque. Toda movimentação passa por aqui:
 *
 * - **Idempotente:** a chave única (org, origem, id da origem, linha, item,
 *   tipo) faz um pedido lido duas vezes não baixar duas vezes.
 *   `createManyAndReturn({ skipDuplicates })` devolve só as linhas criadas.
 * - **Saldo recalculado, não incrementado:** depois de gravar, o Em casa de
 *   cada item tocado é recalculado como a soma das movimentações `own`. Um
 *   saldo errado se corrige sozinho na próxima escrita.
 * - **Trava por organização** (`pg_advisory_xact_lock`): o cron e o
 *   "Sincronizar agora" não recalculam o mesmo saldo ao mesmo tempo.
 */

type TransactionClient = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];

export type MovementInput = {
  stockItemId: string;
  type: StockMovementType;
  location: StockLocation;
  /** Unidades com sinal: + entra, − sai. Zero é ignorado. */
  quantity: number;
  occurredAt: Date;
  sourceType: StockMovementSource;
  sourceId: string;
  sourceLineKey?: string;
  listingMlItemId?: string | null;
  channel?: string | null;
  shipmentId?: string | null;
  nodeId?: string | null;
  reason?: string | null;
  note?: string | null;
  createdByMlUserId?: bigint | null;
};

export type CreatedMovement = {
  id: string;
  stockItemId: string;
  type: StockMovementType;
  location: StockLocation;
  quantity: number;
  occurredAt: Date;
};

export async function lockOrganizationLedger(tx: TransactionClient, organizationId: string) {
  // `$executeRaw` e não `$queryRaw`: a função devolve `void`, que o Prisma 7
  // não consegue desserializar (mesmo cuidado de rotina/refresh.ts).
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`stock-ledger:${organizationId}`}))`;
}

/** Recalcula o Em casa dos itens a partir das movimentações `own`. */
export async function recomputeOwnBalances(
  tx: TransactionClient,
  organizationId: string,
  stockItemIds: string[],
): Promise<void> {
  const ids = [...new Set(stockItemIds)];
  if (ids.length === 0) return;
  const sums = await tx.stockMovement.groupBy({
    by: ["stockItemId"],
    where: { organizationId, stockItemId: { in: ids }, location: "own" },
    _sum: { quantity: true },
  });
  const sumById = new Map(sums.map((row) => [row.stockItemId, row._sum.quantity ?? 0]));
  for (const id of ids) {
    const ownQty = sumById.get(id) ?? 0;
    await tx.stockBalance.upsert({
      where: { stockItemId: id },
      create: { stockItemId: id, organizationId, ownQty },
      update: { ownQty },
    });
  }
}

/**
 * Grava movimentações dentro de uma transação já aberta (o chamador trava o
 * livro com `lockOrganizationLedger`). Devolve só as criadas agora.
 */
export async function insertMovements(
  tx: TransactionClient,
  organizationId: string,
  inputs: MovementInput[],
): Promise<CreatedMovement[]> {
  const rows = inputs
    .filter((m) => Number.isFinite(m.quantity) && m.quantity !== 0)
    .map((m) => ({
      organizationId,
      stockItemId: m.stockItemId,
      type: m.type,
      location: m.location,
      quantity: Math.trunc(m.quantity),
      occurredAt: m.occurredAt,
      sourceType: m.sourceType,
      sourceId: m.sourceId,
      sourceLineKey: m.sourceLineKey ?? "",
      listingMlItemId: m.listingMlItemId ?? null,
      channel: m.channel ?? null,
      shipmentId: m.shipmentId ?? null,
      nodeId: m.nodeId ?? null,
      reason: m.reason ?? null,
      note: m.note ?? null,
      createdByMlUserId: m.createdByMlUserId ?? null,
    }));
  if (rows.length === 0) return [];
  const created = await tx.stockMovement.createManyAndReturn({
    data: rows,
    skipDuplicates: true,
    select: {
      id: true,
      stockItemId: true,
      type: true,
      location: true,
      quantity: true,
      occurredAt: true,
    },
  });
  await recomputeOwnBalances(
    tx,
    organizationId,
    created.filter((m) => m.location === "own").map((m) => m.stockItemId),
  );
  // Custo por lote (PEPS) e troca do custo vigente, na mesma transação.
  await allocateLotsForMovements(tx, organizationId, created);
  return created;
}

/** Atalho: abre a transação, trava o livro e grava. */
export async function recordMovements(
  organizationId: string,
  inputs: MovementInput[],
): Promise<CreatedMovement[]> {
  if (inputs.length === 0) return [];
  return prisma.$transaction(async (tx) => {
    await lockOrganizationLedger(tx, organizationId);
    return insertMovements(tx, organizationId, inputs);
  });
}
