import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/db/db";
import type { StockLot } from "@/generated/prisma";
import { completePurchaseCyclesOnStockEntry } from "@/lib/compras/replenishment-cycle-data";
import { toDbSellerId } from "@/lib/mercadolibre/seller-id";
import { insertMovements, lockOrganizationLedger } from "@/lib/stock/stock-ledger";
import { planStockExit, type ExitLine, type ExitReason } from "@/lib/stock/stock-exit";

/**
 * Ações do usuário no estoque automático: entrada, estorno de entrada,
 * ajuste/saída manual e decisão das pendências. Tudo vira movimentação no
 * livro (nada sobrescreve saldo).
 */

export class StockActionError extends Error {
  constructor(
    readonly code:
      | "not_activated"
      | "invalid_input"
      | "item_not_found"
      | "entry_not_found"
      | "entry_consumed"
      | "entry_reversed"
      | "review_not_found"
      | "review_closed"
      | "count_not_found"
      | "count_closed"
      | "count_empty",
  ) {
    super(code);
  }
}

export type LotCostInput = {
  unitCostNf: number;
  purchaseIcmsPercent: number;
  hasIcmsSt: boolean;
  purchaseCostWithSt: number | null;
  ipiPercent: number;
  extraCosts: number;
};

async function requireActivated(organizationId: string) {
  const settings = await prisma.stockSettings.findUnique({ where: { organizationId } });
  if (!settings) throw new StockActionError("not_activated");
  return settings;
}

function isPositiveInt(n: unknown): n is number {
  return typeof n === "number" && Number.isInteger(n) && n > 0 && n <= 10_000_000;
}

function isCost(n: unknown): n is number {
  return typeof n === "number" && Number.isFinite(n) && n >= 0 && n <= 100_000_000;
}

/** Custo de referência de um item: o do lote vigente; sem lote, o cadastro do anúncio principal. */
export async function currentCostForStockItem(
  organizationId: string,
  stockItemId: string,
): Promise<LotCostInput | null> {
  const lot = await prisma.stockLot.findFirst({
    where: { organizationId, stockItemId, status: "active", costKnown: true },
    orderBy: { receivedAt: "asc" },
  });
  if (lot) return lotCost(lot);
  const item = await prisma.stockItem.findFirst({
    where: { id: stockItemId, organizationId },
    select: { primaryMlItemId: true, listings: { select: { mlItemId: true } } },
  });
  if (!item) return null;
  const ids = [item.primaryMlItemId, ...item.listings.map((l) => l.mlItemId)].filter(
    (v): v is string => Boolean(v),
  );
  const product = await prisma.product.findFirst({
    where: { organizationId, mlItemId: { in: ids }, needsCostReview: false },
  });
  if (!product) return null;
  return {
    unitCostNf: Number(product.unitCostNf),
    purchaseIcmsPercent: Number(product.purchaseIcmsPercent),
    hasIcmsSt: product.hasIcmsSt,
    purchaseCostWithSt: product.purchaseCostWithSt == null ? null : Number(product.purchaseCostWithSt),
    ipiPercent: Number(product.ipiPercent),
    extraCosts: Number(product.extraCosts),
  };
}

export function lotCost(lot: Pick<StockLot, "unitCostNf" | "purchaseIcmsPercent" | "hasIcmsSt" | "purchaseCostWithSt" | "ipiPercent" | "extraCosts">): LotCostInput {
  return {
    unitCostNf: Number(lot.unitCostNf),
    purchaseIcmsPercent: Number(lot.purchaseIcmsPercent),
    hasIcmsSt: lot.hasIcmsSt,
    purchaseCostWithSt: lot.purchaseCostWithSt == null ? null : Number(lot.purchaseCostWithSt),
    ipiPercent: Number(lot.ipiPercent),
    extraCosts: Number(lot.extraCosts),
  };
}

export type EntryLineInput = {
  stockItemId: string;
  quantity: number;
  /** Sem custo: usa o vigente do item (o lote novo entra com o mesmo custo). */
  cost?: LotCostInput | null;
};

export async function createStockEntry(input: {
  organizationId: string;
  mlUserId: number;
  arrivedAt: Date;
  supplierId?: string | null;
  invoiceNumber?: string | null;
  notes?: string | null;
  lines: EntryLineInput[];
}): Promise<{ entryId: string }> {
  const { organizationId } = input;
  await requireActivated(organizationId);
  if (input.lines.length === 0 || input.lines.length > 200) throw new StockActionError("invalid_input");
  if (Number.isNaN(input.arrivedAt.getTime())) throw new StockActionError("invalid_input");
  for (const line of input.lines) {
    if (!isPositiveInt(line.quantity)) throw new StockActionError("invalid_input");
    if (line.cost) {
      const c = line.cost;
      if (![c.unitCostNf, c.purchaseIcmsPercent, c.ipiPercent, c.extraCosts].every(isCost)) {
        throw new StockActionError("invalid_input");
      }
      if (c.purchaseCostWithSt != null && !isCost(c.purchaseCostWithSt)) {
        throw new StockActionError("invalid_input");
      }
    }
  }

  const ids = [...new Set(input.lines.map((l) => l.stockItemId))];
  const items = await prisma.stockItem.findMany({
    where: { organizationId, id: { in: ids } },
    select: { id: true, listings: { select: { mlItemId: true } } },
  });
  if (items.length !== ids.length) throw new StockActionError("item_not_found");
  if (input.supplierId) {
    const supplier = await prisma.supplier.findFirst({
      where: { id: input.supplierId, organizationId },
      select: { id: true },
    });
    if (!supplier) throw new StockActionError("invalid_input");
  }

  // Custo vigente de cada item, para as linhas sem custo informado.
  const costByItem = new Map<string, LotCostInput | null>();
  for (const id of ids) costByItem.set(id, await currentCostForStockItem(organizationId, id));

  const entry = await prisma.$transaction(async (tx) => {
    await lockOrganizationLedger(tx, organizationId);
    const created = await tx.stockEntry.create({
      data: {
        organizationId,
        arrivedAt: input.arrivedAt,
        supplierId: input.supplierId ?? null,
        invoiceNumber: input.invoiceNumber?.trim() || null,
        notes: input.notes?.trim() || null,
        createdByMlUserId: toDbSellerId(input.mlUserId),
      },
    });
    const activeLots = new Set(
      (
        await tx.stockLot.findMany({
          where: { organizationId, stockItemId: { in: ids }, status: "active" },
          select: { stockItemId: true },
        })
      ).map((l) => l.stockItemId),
    );
    const movements = [];
    for (const line of input.lines) {
      const cost = line.cost ?? costByItem.get(line.stockItemId) ?? null;
      const isActive = !activeLots.has(line.stockItemId);
      const lot = await tx.stockLot.create({
        data: {
          organizationId,
          stockItemId: line.stockItemId,
          entryId: created.id,
          receivedAt: input.arrivedAt,
          quantity: line.quantity,
          status: isActive ? "active" : "queued",
          activatedAt: isActive ? input.arrivedAt : null,
          costKnown: cost != null,
          unitCostNf: cost?.unitCostNf ?? 0,
          purchaseIcmsPercent: cost?.purchaseIcmsPercent ?? 0,
          hasIcmsSt: cost?.hasIcmsSt ?? false,
          purchaseCostWithSt: cost?.purchaseCostWithSt ?? null,
          ipiPercent: cost?.ipiPercent ?? 0,
          extraCosts: cost?.extraCosts ?? 0,
        },
      });
      if (isActive) activeLots.add(line.stockItemId);
      movements.push({
        stockItemId: line.stockItemId,
        type: "entry" as const,
        location: "own" as const,
        quantity: line.quantity,
        occurredAt: input.arrivedAt,
        sourceType: "entry" as const,
        sourceId: created.id,
        sourceLineKey: lot.id,
        reason: "Entrada no galpão",
        createdByMlUserId: toDbSellerId(input.mlUserId),
      });
    }
    await insertMovements(tx, organizationId, movements);
    return created;
  });

  // Fora da transação: concluir a compra no Kanban não pode derrubar a entrada.
  try {
    const balances = await prisma.stockBalance.findMany({
      where: { organizationId, stockItemId: { in: ids } },
      select: { stockItemId: true, ownQty: true },
    });
    const ownById = new Map(balances.map((b) => [b.stockItemId, b.ownQty]));
    for (const item of items) {
      await completePurchaseCyclesOnStockEntry(
        organizationId,
        item.listings.map((l) => l.mlItemId),
        ownById.get(item.id) ?? 0,
      );
    }
  } catch {
    // O card continua no Kanban; quem conclui à mão é o usuário.
  }

  return { entryId: entry.id };
}

/** Estorno de entrada lançada por engano. Só sem consumo (nada dela vendido ainda). */
export async function reverseStockEntry(input: {
  organizationId: string;
  mlUserId: number;
  entryId: string;
}): Promise<void> {
  const { organizationId, entryId } = input;
  await requireActivated(organizationId);
  await prisma.$transaction(async (tx) => {
    await lockOrganizationLedger(tx, organizationId);
    const entry = await tx.stockEntry.findFirst({
      where: { id: entryId, organizationId },
      include: { lots: true },
    });
    if (!entry) throw new StockActionError("entry_not_found");
    if (entry.status === "reversed") throw new StockActionError("entry_reversed");
    if (entry.lots.some((lot) => lot.consumedQty > 0)) throw new StockActionError("entry_consumed");

    const now = new Date();
    await insertMovements(
      tx,
      organizationId,
      entry.lots.map((lot) => ({
        stockItemId: lot.stockItemId,
        type: "entry_reversal" as const,
        location: "own" as const,
        quantity: -lot.quantity,
        occurredAt: now,
        sourceType: "entry" as const,
        sourceId: entry.id,
        sourceLineKey: lot.id,
        reason: "Estorno de entrada",
        createdByMlUserId: toDbSellerId(input.mlUserId),
      })),
    );
    await tx.stockLot.updateMany({
      where: { organizationId, entryId: entry.id },
      data: { status: "depleted", depletedAt: now },
    });
    await tx.stockEntry.update({
      where: { id: entry.id },
      data: { status: "reversed", reversedAt: now },
    });
  });
}

/**
 * Saída registrada por vocês (`stock-exit.ts`): envio ao Full, perda, avaria,
 * brinde… Várias linhas de uma vez, numa transação. Quantidade maior que o Em
 * casa não é bloqueada (a tela avisa): o estoque pode estar desatualizado.
 */
export async function createStockExit(input: {
  organizationId: string;
  mlUserId: number;
  reason: ExitReason;
  occurredAt: Date;
  note?: string | null;
  lines: ExitLine[];
}): Promise<{ exitId: string; movements: number }> {
  const { organizationId } = input;
  await requireActivated(organizationId);
  if (input.lines.length === 0 || input.lines.length > 200) throw new StockActionError("invalid_input");
  if (Number.isNaN(input.occurredAt.getTime())) throw new StockActionError("invalid_input");
  if (!input.lines.every((l) => isPositiveInt(l.quantity))) throw new StockActionError("invalid_input");
  const ids = [...new Set(input.lines.map((l) => l.stockItemId))];
  const found = await prisma.stockItem.count({ where: { organizationId, id: { in: ids } } });
  if (found !== ids.length) throw new StockActionError("item_not_found");

  const drafts = planStockExit(input.reason, input.lines);
  const exitId = `exit:${randomUUID()}`;
  const note = input.note?.trim() || null;
  const by = toDbSellerId(input.mlUserId);
  await prisma.$transaction(async (tx) => {
    await lockOrganizationLedger(tx, organizationId);
    await insertMovements(
      tx,
      organizationId,
      drafts.map((d) => ({
        stockItemId: d.stockItemId,
        type: d.type,
        location: "own" as const,
        quantity: d.quantity,
        occurredAt: input.occurredAt,
        sourceType: "manual" as const,
        sourceId: exitId,
        sourceLineKey: d.sourceLineKey,
        reason: d.reason,
        note,
        createdByMlUserId: by,
      })),
    );
  });
  return { exitId, movements: drafts.length };
}

/**
 * Ajuste (corrige o saldo para mais ou para menos, com motivo) ou "Voltou do
 * Full" (mercadoria que voltou para casa: soma ao Em casa sem mexer no custo,
 * porque já era de vocês). Vira movimentação com quem fez.
 */
export async function recordManualStockChange(input: {
  organizationId: string;
  mlUserId: number;
  stockItemId: string;
  kind: "adjustment" | "full_return";
  /** Ajuste: com sinal. Voltou do Full: unidades que voltaram (positivo). */
  quantity: number;
  reason: string;
  note?: string | null;
}): Promise<void> {
  const { organizationId } = input;
  await requireActivated(organizationId);
  const reason = input.reason.trim().slice(0, 120);
  if (!reason) throw new StockActionError("invalid_input");
  const units = input.kind === "full_return" ? Math.abs(input.quantity) : input.quantity;
  if (!Number.isInteger(units) || units === 0 || Math.abs(units) > 10_000_000) {
    throw new StockActionError("invalid_input");
  }
  const item = await prisma.stockItem.findFirst({
    where: { id: input.stockItemId, organizationId },
    select: { id: true },
  });
  if (!item) throw new StockActionError("item_not_found");
  const now = new Date();
  await prisma.$transaction(async (tx) => {
    await lockOrganizationLedger(tx, organizationId);
    await insertMovements(tx, organizationId, [
      {
        stockItemId: item.id,
        type: input.kind,
        location: "own",
        quantity: units,
        occurredAt: now,
        sourceType: "manual",
        sourceId: `${input.kind}:${now.toISOString()}:${item.id}`,
        reason,
        note: input.note?.trim() || null,
        createdByMlUserId: toDbSellerId(input.mlUserId),
      },
    ]);
  });
}

export type ReviewDecision =
  /** Devolução: voltou boa para casa. */
  | { action: "returned_good"; quantity: number }
  /** Devolução: voltou avariada (não volta ao saldo). */
  | { action: "returned_damaged" }
  /** Devolução: não voltou para casa (ficou no Full, extraviou…). */
  | { action: "not_returned" }
  /** Venda sem item: ligar o anúncio a um item de estoque. */
  | { action: "link_listing"; stockItemId: string }
  /** Descartar a pendência sem mexer no estoque. */
  | { action: "dismiss" };

export async function resolveStockReview(input: {
  organizationId: string;
  mlUserId: number;
  reviewId: string;
  decision: ReviewDecision;
}): Promise<void> {
  const { organizationId, decision } = input;
  await requireActivated(organizationId);
  const resolvedBy = toDbSellerId(input.mlUserId);
  const now = new Date();

  await prisma.$transaction(async (tx) => {
    await lockOrganizationLedger(tx, organizationId);
    const review = await tx.stockReviewItem.findFirst({
      where: { id: input.reviewId, organizationId },
    });
    if (!review) throw new StockActionError("review_not_found");
    if (review.status !== "open") throw new StockActionError("review_closed");

    const close = (status: "resolved" | "dismissed", resolution: string, resolvedQuantity: number | null) =>
      tx.stockReviewItem.update({
        where: { id: review.id },
        data: { status, resolution, resolvedQuantity, resolvedAt: now, resolvedByMlUserId: resolvedBy },
      });

    if (decision.action === "dismiss") {
      await close("dismissed", "dismissed", null);
      return;
    }

    if (review.kind === "return_to_check") {
      if (decision.action === "returned_good") {
        if (!review.stockItemId || !isPositiveInt(decision.quantity)) throw new StockActionError("invalid_input");
        const payload = (review.payload ?? {}) as { lines?: Array<{ stockItemId: string; units: number }> };
        const lines = payload.lines?.length
          ? payload.lines
          : [{ stockItemId: review.stockItemId, units: decision.quantity }];
        // Quantidade editada vale para o item principal; os demais itens do
        // pedido (kit) voltam como foram vendidos.
        await insertMovements(
          tx,
          organizationId,
          lines.map((line, index) => ({
            stockItemId: line.stockItemId,
            type: "return_in" as const,
            location: "own" as const,
            quantity: index === 0 ? decision.quantity : line.units,
            occurredAt: now,
            sourceType: "review" as const,
            sourceId: review.id,
            sourceLineKey: line.stockItemId,
            reason: "Devolução conferida: voltou boa",
            createdByMlUserId: resolvedBy,
          })),
        );
        await close("resolved", "returned_good", decision.quantity);
        return;
      }
      if (decision.action === "returned_damaged") {
        await close("resolved", "damaged", 0);
        return;
      }
      if (decision.action === "not_returned") {
        await close("resolved", "not_returned", 0);
        return;
      }
    }

    if (review.kind === "unmapped_sale" && decision.action === "link_listing") {
      if (!review.listingMlItemId) throw new StockActionError("invalid_input");
      const item = await tx.stockItem.findFirst({
        where: { id: decision.stockItemId, organizationId },
        select: { id: true },
      });
      if (!item) throw new StockActionError("item_not_found");
      await tx.listing.upsert({
        where: { mlItemId: review.listingMlItemId },
        create: {
          organizationId,
          mlItemId: review.listingMlItemId,
          stockItemId: item.id,
        },
        update: { stockItemId: item.id },
      });
      // Todas as vendas pendentes deste anúncio baixam agora.
      const pending = await tx.stockReviewItem.findMany({
        where: {
          organizationId,
          kind: "unmapped_sale",
          status: "open",
          listingMlItemId: review.listingMlItemId,
        },
      });
      await insertMovements(
        tx,
        organizationId,
        pending.map((p) => {
          const payload = (p.payload ?? {}) as {
            location?: "own" | "full" | null;
            channel?: string | null;
            shipmentId?: string | null;
            occurredAt?: string;
          };
          return {
            stockItemId: item.id,
            type: "sale" as const,
            location: payload.location ?? "own",
            quantity: -p.quantity,
            occurredAt: payload.occurredAt ? new Date(payload.occurredAt) : p.detectedAt,
            sourceType: "ml_order" as const,
            sourceId: p.orderId ?? p.id,
            sourceLineKey: p.listingMlItemId ?? "",
            listingMlItemId: p.listingMlItemId,
            channel: payload.channel ?? null,
            shipmentId: payload.shipmentId ?? null,
          };
        }),
      );
      await tx.stockReviewItem.updateMany({
        where: { organizationId, id: { in: pending.map((p) => p.id) } },
        data: {
          status: "resolved",
          resolution: "linked",
          resolvedAt: now,
          resolvedByMlUserId: resolvedBy,
        },
      });
      return;
    }

    throw new StockActionError("invalid_input");
  });
}

