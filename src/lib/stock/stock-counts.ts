import { prisma } from "@/lib/db/db";
import { getMercadoLibreConfig } from "@/lib/mercadolibre/config";
import { mapWithConcurrency } from "@/lib/mercadolibre/concurrency";
import { fetchWithRetry } from "@/lib/mercadolibre/fetch-with-retry";
import { toDbSellerId } from "@/lib/mercadolibre/seller-id";
import { StockActionError } from "@/lib/stock/stock-actions";
import { insertMovements, lockOrganizationLedger } from "@/lib/stock/stock-ledger";
import { loadStockOverview } from "@/lib/stock/stock-page-data";

/**
 * Inventário (conferência física mensal).
 *
 * - **Criar:** congela a hora de referência e, por produto, o Em casa e o
 *   "a enviar" (vendido de casa, ainda não despachado: está na prateleira).
 * - **Contar:** a folha impressa vai para a prancheta; o contado é digitado
 *   depois. "Não contado" é diferente de 0.
 * - **Aprovar:** ajuste = contado − (Em casa + a enviar na referência),
 *   aplicado sobre o saldo de agora. Vendas depois da referência continuam
 *   valendo. Cada ajuste vira uma movimentação "Inventário" (e consome ou
 *   devolve lote, como qualquer saída/entrada).
 */

/**
 * Ajuste de uma linha: contado − o que deveria estar na prateleira na
 * referência (Em casa + vendido ainda não despachado). Não contado = sem ajuste.
 */
export function countLineAdjustment(line: {
  countedQty: number | null;
  expectedOwnQty: number;
  pendingShipmentQty: number;
}): number | null {
  if (line.countedQty == null) return null;
  return line.countedQty - (line.expectedOwnQty + line.pendingShipmentQty);
}

/** Envio que ainda não saiu do vendedor: a unidade continua na prateleira. */
const NOT_DISPATCHED = new Set(["pending", "handling", "ready_to_ship"]);
const PENDING_LOOKBACK_DAYS = 15;

async function pendingShipmentUnits(
  organizationId: string,
  accessToken: string,
  stockItemIds: string[],
): Promise<Map<string, number>> {
  const since = new Date(Date.now() - PENDING_LOOKBACK_DAYS * 86_400_000);
  const sales = await prisma.stockMovement.findMany({
    where: {
      organizationId,
      stockItemId: { in: stockItemIds },
      type: "sale",
      location: "own",
      occurredAt: { gte: since },
      shipmentId: { not: null },
    },
    select: { stockItemId: true, quantity: true, shipmentId: true, sourceId: true, sourceLineKey: true },
  });
  if (sales.length === 0) return new Map();
  const reversed = new Set(
    (
      await prisma.stockMovement.findMany({
        where: {
          organizationId,
          type: "sale_reversal",
          sourceId: { in: [...new Set(sales.map((s) => s.sourceId))] },
        },
        select: { sourceId: true, sourceLineKey: true, stockItemId: true },
      })
    ).map((r) => `${r.sourceId}|${r.sourceLineKey}|${r.stockItemId}`),
  );
  const open = sales.filter((s) => !reversed.has(`${s.sourceId}|${s.sourceLineKey}|${s.stockItemId}`));
  const shipmentIds = [...new Set(open.map((s) => s.shipmentId as string))];
  const { apiBase } = getMercadoLibreConfig();
  const statuses = new Map<string, string | null>();
  await mapWithConcurrency(shipmentIds, 6, async (id) => {
    try {
      const res = await fetchWithRetry(
        `${apiBase}/shipments/${encodeURIComponent(id)}`,
        { headers: { Authorization: `Bearer ${accessToken}`, "x-format-new": "true" }, cache: "no-store" },
        { maxAttempts: 3 },
      );
      const body = (await res.json()) as { status?: string };
      statuses.set(id, body.status ?? null);
    } catch {
      // Sem o status, não conta como "a enviar" (o ajuste fica mais conservador).
      statuses.set(id, null);
    }
  });
  const result = new Map<string, number>();
  for (const sale of open) {
    const status = statuses.get(sale.shipmentId as string);
    if (!status || !NOT_DISPATCHED.has(status)) continue;
    result.set(sale.stockItemId, (result.get(sale.stockItemId) ?? 0) + -sale.quantity);
  }
  return result;
}

export async function createStockCount(input: {
  organizationId: string;
  mlUserId: number;
  accessToken: string;
  supplierName: string | null;
  onlyWithStock: boolean;
  blind: boolean;
}): Promise<{ countId: string }> {
  const { organizationId } = input;
  const overview = await loadStockOverview(organizationId);
  if (!overview) throw new StockActionError("not_activated");
  const rows = overview.rows.filter(
    (r) =>
      (!input.supplierName || r.supplierName === input.supplierName) &&
      (!input.onlyWithStock || r.own > 0),
  );
  if (rows.length === 0) throw new StockActionError("count_empty");

  const referenceAt = new Date();
  const pending = await pendingShipmentUnits(
    organizationId,
    input.accessToken,
    rows.map((r) => r.stockItemId),
  );

  const count = await prisma.stockCount.create({
    data: {
      organizationId,
      referenceAt,
      blind: input.blind,
      supplierName: input.supplierName,
      onlyWithStock: input.onlyWithStock,
      createdByMlUserId: toDbSellerId(input.mlUserId),
      lines: {
        create: rows.map((r, index) => ({
          organizationId,
          stockItemId: r.stockItemId,
          position: index + 1,
          title: r.title,
          sku: r.sku,
          supplierName: r.supplierName,
          expectedOwnQty: r.own,
          pendingShipmentQty: pending.get(r.stockItemId) ?? 0,
          unitCost: r.unitCost,
        })),
      },
    },
    select: { id: true },
  });
  return { countId: count.id };
}

export async function saveStockCountLines(input: {
  organizationId: string;
  countId: string;
  lines: Array<{ stockItemId: string; countedQty: number | null; note: string | null }>;
}): Promise<void> {
  const count = await prisma.stockCount.findFirst({
    where: { id: input.countId, organizationId: input.organizationId },
    select: { status: true },
  });
  if (!count) throw new StockActionError("count_not_found");
  if (count.status !== "counting") throw new StockActionError("count_closed");
  for (const line of input.lines) {
    if (line.countedQty != null && (!Number.isInteger(line.countedQty) || line.countedQty < 0)) {
      throw new StockActionError("invalid_input");
    }
    await prisma.stockCountLine.updateMany({
      where: { organizationId: input.organizationId, countId: input.countId, stockItemId: line.stockItemId },
      data: { countedQty: line.countedQty, note: line.note?.trim() ? line.note.trim().slice(0, 300) : null },
    });
  }
}

export async function approveStockCount(input: {
  organizationId: string;
  countId: string;
  mlUserId: number;
}): Promise<{ adjusted: number }> {
  const { organizationId } = input;
  const by = toDbSellerId(input.mlUserId);
  return prisma.$transaction(async (tx) => {
    await lockOrganizationLedger(tx, organizationId);
    const count = await tx.stockCount.findFirst({
      where: { id: input.countId, organizationId },
      include: { lines: true },
    });
    if (!count) throw new StockActionError("count_not_found");
    if (count.status !== "counting") throw new StockActionError("count_closed");
    const now = new Date();
    const movements = [];
    let adjusted = 0;
    for (const line of count.lines) {
      const adjustment = countLineAdjustment(line);
      if (adjustment == null) continue;
      await tx.stockCountLine.update({ where: { id: line.id }, data: { adjustmentQty: adjustment } });
      if (adjustment === 0) continue;
      adjusted += 1;
      movements.push({
        stockItemId: line.stockItemId,
        type: "inventory_count" as const,
        location: "own" as const,
        quantity: adjustment,
        occurredAt: now,
        sourceType: "inventory" as const,
        sourceId: count.id,
        sourceLineKey: line.stockItemId,
        reason: `Inventário de ${count.referenceAt.toISOString().slice(0, 10)}`,
        note: line.note,
        createdByMlUserId: by,
      });
    }
    await insertMovements(tx, organizationId, movements);
    await tx.stockCount.update({
      where: { id: count.id },
      data: { status: "approved", approvedAt: now, approvedByMlUserId: by },
    });
    return { adjusted };
  });
}

export async function cancelStockCount(organizationId: string, countId: string): Promise<void> {
  const result = await prisma.stockCount.updateMany({
    where: { id: countId, organizationId, status: "counting" },
    data: { status: "cancelled" },
  });
  if (result.count === 0) throw new StockActionError("count_closed");
}

// ─── Leituras para as telas ──────────────────────────────────────────────

export type StockCountSummary = {
  id: string;
  status: "counting" | "approved" | "cancelled";
  referenceAt: string;
  supplierName: string | null;
  blind: boolean;
  lines: number;
  counted: number;
  divergences: number;
  divergenceValue: number;
};

export async function loadStockCounts(organizationId: string): Promise<StockCountSummary[]> {
  const counts = await prisma.stockCount.findMany({
    where: { organizationId },
    orderBy: { createdAt: "desc" },
    take: 50,
    include: { lines: { select: { countedQty: true, expectedOwnQty: true, pendingShipmentQty: true, unitCost: true } } },
  });
  return counts.map((c) => {
    let counted = 0;
    let divergences = 0;
    let value = 0;
    for (const l of c.lines) {
      const diff = countLineAdjustment(l);
      if (diff == null) continue;
      counted += 1;
      if (diff !== 0) {
        divergences += 1;
        value += diff * Number(l.unitCost ?? 0);
      }
    }
    return {
      id: c.id,
      status: c.status,
      referenceAt: c.referenceAt.toISOString(),
      supplierName: c.supplierName,
      blind: c.blind,
      lines: c.lines.length,
      counted,
      divergences,
      divergenceValue: value,
    };
  });
}

export type StockCountDetailLine = {
  stockItemId: string;
  position: number;
  title: string;
  sku: string | null;
  supplierName: string;
  expectedOwnQty: number;
  pendingShipmentQty: number;
  countedQty: number | null;
  note: string | null;
  unitCost: number | null;
  adjustmentQty: number | null;
  /** Vendas de casa depois da referência: conferir se saíram antes da contagem. */
  salesAfterReference: number;
};

export type StockCountDetail = {
  id: string;
  status: "counting" | "approved" | "cancelled";
  referenceAt: string;
  approvedAt: string | null;
  supplierName: string | null;
  blind: boolean;
  lines: StockCountDetailLine[];
};

export async function loadStockCount(organizationId: string, countId: string): Promise<StockCountDetail | null> {
  const count = await prisma.stockCount.findFirst({
    where: { id: countId, organizationId },
    include: { lines: { orderBy: { position: "asc" } } },
  });
  if (!count) return null;
  const after = await prisma.stockMovement.groupBy({
    by: ["stockItemId"],
    where: {
      organizationId,
      stockItemId: { in: count.lines.map((l) => l.stockItemId) },
      type: "sale",
      location: "own",
      occurredAt: { gt: count.referenceAt, ...(count.approvedAt ? { lte: count.approvedAt } : {}) },
    },
    _sum: { quantity: true },
  });
  const afterById = new Map(after.map((a) => [a.stockItemId, -(a._sum.quantity ?? 0)]));
  return {
    id: count.id,
    status: count.status,
    referenceAt: count.referenceAt.toISOString(),
    approvedAt: count.approvedAt?.toISOString() ?? null,
    supplierName: count.supplierName,
    blind: count.blind,
    lines: count.lines.map((l) => ({
      stockItemId: l.stockItemId,
      position: l.position,
      title: l.title,
      sku: l.sku,
      supplierName: l.supplierName,
      expectedOwnQty: l.expectedOwnQty,
      pendingShipmentQty: l.pendingShipmentQty,
      countedQty: l.countedQty,
      note: l.note,
      unitCost: l.unitCost == null ? null : Number(l.unitCost),
      adjustmentQty: l.adjustmentQty,
      salesAfterReference: afterById.get(l.stockItemId) ?? 0,
    })),
  };
}
