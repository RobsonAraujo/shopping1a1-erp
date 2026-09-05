/**
 * Agrega os cards de reposição de compra (por produto/ciclo) num card por
 * FORNECEDOR — o usuário compra tudo de um fornecedor de uma vez, não
 * produto a produto. Lógica pura, sem I/O, pra ser testável isolada.
 */
import type { ReplenishmentStatus } from "@/generated/prisma/client";
import {
  PURCHASE_BOARD_COLUMNS,
  purchaseStatusOrderIndex,
} from "@/lib/compras/replenishment-cycle";
import type { OperationsBoardCard } from "@/lib/compras/replenishment-cycle-data";

export type SupplierBoardTopItem = {
  mlItemId: string;
  sku: string | null;
  suggestedQty: number | null;
  /** Já vem "de graça" no card do ciclo (extraída do anúncio já buscado do
   * ML) — não é uma chamada de rede extra. Só mostramos pros top items
   * (no máximo `MAX_TOP_ITEMS`), não pra lista inteira, pra manter o custo
   * de renderização (otimizador de imagem do Next.js) baixo. */
  imageUrl: string | null;
};

export type SupplierStatusBreakdownEntry = {
  status: ReplenishmentStatus;
  count: number;
};

export type SupplierBoardCard = {
  supplier: string;
  /** Coluna do card = status menos avançado ("elo mais fraco") entre os
   * ciclos ativos do fornecedor — nunca esconde um produto que ainda
   * precisa de ação atrás de outros já adiantados. */
  status: ReplenishmentStatus;
  totalActive: number;
  /** Só populado quando há mais de um status entre os ciclos do grupo
   * (evita ruído visual no caso comum de todos no mesmo estágio). */
  breakdown: SupplierStatusBreakdownEntry[];
  hasOverdue: boolean;
  suggestedQtyTotal: number;
  topItems: SupplierBoardTopItem[];
  overflowCount: number;
  cycleIds: string[];
};

const MAX_TOP_ITEMS = 3;

function compareTopItems(a: OperationsBoardCard, b: OperationsBoardCard): number {
  if (a.purchaseIsOverdue !== b.purchaseIsOverdue) {
    return a.purchaseIsOverdue ? -1 : 1;
  }
  const qtyA = a.suggestedQty ?? 0;
  const qtyB = b.suggestedQty ?? 0;
  if (qtyA !== qtyB) return qtyB - qtyA;
  return (a.sku ?? a.mlItemId).localeCompare(b.sku ?? b.mlItemId, "pt-BR");
}

/** Constrói um card por fornecedor a partir dos cards de reposição de
 * compra (`kind: "purchase"`) já ativos — ordenado por urgência, depois por
 * quantidade de itens ativos, depois por nome. */
export function buildSupplierBoardCards(
  cards: OperationsBoardCard[],
): SupplierBoardCard[] {
  const purchaseCards = cards.filter((c) => c.kind === "purchase");

  const bySupplier = new Map<string, OperationsBoardCard[]>();
  for (const card of purchaseCards) {
    const group = bySupplier.get(card.supplier) ?? [];
    group.push(card);
    bySupplier.set(card.supplier, group);
  }

  const result: SupplierBoardCard[] = [];
  for (const [supplier, group] of bySupplier) {
    const weakestStatus = group.reduce((weakest, card) =>
      purchaseStatusOrderIndex(card.status) < purchaseStatusOrderIndex(weakest.status)
        ? card
        : weakest,
    ).status;

    const countByStatus = new Map<ReplenishmentStatus, number>();
    for (const card of group) {
      countByStatus.set(card.status, (countByStatus.get(card.status) ?? 0) + 1);
    }
    const breakdown: SupplierStatusBreakdownEntry[] =
      countByStatus.size > 1
        ? PURCHASE_BOARD_COLUMNS.filter((status) => countByStatus.has(status)).map(
            (status) => ({ status, count: countByStatus.get(status)! }),
          )
        : [];

    const sortedForTopItems = [...group].sort(compareTopItems);
    const topItems = sortedForTopItems.slice(0, MAX_TOP_ITEMS).map((card) => ({
      mlItemId: card.mlItemId,
      sku: card.sku,
      suggestedQty: card.suggestedQty,
      imageUrl: card.imageUrl,
    }));

    result.push({
      supplier,
      status: weakestStatus,
      totalActive: group.length,
      breakdown,
      hasOverdue: group.some((card) => card.purchaseIsOverdue),
      suggestedQtyTotal: group.reduce((sum, card) => sum + (card.suggestedQty ?? 0), 0),
      topItems,
      overflowCount: Math.max(0, group.length - MAX_TOP_ITEMS),
      cycleIds: group.map((card) => card.cycleId),
    });
  }

  result.sort((a, b) => {
    if (a.hasOverdue !== b.hasOverdue) return a.hasOverdue ? -1 : 1;
    if (a.totalActive !== b.totalActive) return b.totalActive - a.totalActive;
    return a.supplier.localeCompare(b.supplier, "pt-BR", { sensitivity: "base" });
  });

  return result;
}

export type MoveDirection = "forward" | "backward" | "noop";

export type MoveAction = {
  cycleIdsToTransition: string[];
  direction: MoveDirection;
};

/**
 * Decide quais ciclos de um fornecedor devem transicionar ao mover o card
 * pra `targetStatus`:
 * - **forward** (existe ao menos 1 ciclo atrás do alvo): avança só esses —
 *   quem já está no alvo ou além fica intocado (não regride ninguém). Cobre
 *   também o caso misto (alguns atrás, algum outro já além do alvo).
 * - **backward** (nenhum ciclo atrás do alvo, mas existe algum além dele):
 *   ação corretiva deliberada — regride todos os que não estão no alvo.
 * - **noop**: todos os ciclos já estão exatamente no alvo.
 */
export function resolveMoveActionForSupplier(
  cyclesInGroup: { cycleId: string; status: ReplenishmentStatus }[],
  targetStatus: ReplenishmentStatus,
): MoveAction {
  const targetIndex = purchaseStatusOrderIndex(targetStatus);
  if (targetIndex === -1) return { cycleIdsToTransition: [], direction: "noop" };

  const behind = cyclesInGroup.filter(
    (c) => purchaseStatusOrderIndex(c.status) < targetIndex,
  );
  if (behind.length > 0) {
    return { cycleIdsToTransition: behind.map((c) => c.cycleId), direction: "forward" };
  }

  const notAtTarget = cyclesInGroup.filter((c) => c.status !== targetStatus);
  if (notAtTarget.length === 0) {
    return { cycleIdsToTransition: [], direction: "noop" };
  }
  return { cycleIdsToTransition: notAtTarget.map((c) => c.cycleId), direction: "backward" };
}

/** Próxima coluna visível do board de compra após `status`, ou `null` se já
 * for a última (`ordered`) — "Concluído" nunca é um destino manual aqui. */
export function nextPurchaseBoardColumn(
  status: ReplenishmentStatus,
): ReplenishmentStatus | null {
  const index = purchaseStatusOrderIndex(status);
  if (index === -1 || index >= PURCHASE_BOARD_COLUMNS.length - 1) return null;
  return PURCHASE_BOARD_COLUMNS[index + 1];
}
