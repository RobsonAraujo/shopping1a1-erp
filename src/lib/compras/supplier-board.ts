/**
 * Agrega os cards de reposição de compra (por produto/ciclo) num card por
 * FORNECEDOR — o usuário compra tudo de um fornecedor de uma vez, não
 * produto a produto. Lógica pura, sem I/O, pra ser testável isolada.
 */
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

export type SupplierColumnBreakdownEntry = {
  columnId: string;
  columnLabel: string;
  count: number;
};

export type SupplierBoardCard = {
  supplier: string;
  /** Coluna do card = a menos avançada ("elo mais fraco") entre os ciclos
   * ativos do fornecedor — nunca esconde um produto que ainda precisa de
   * ação atrás de outros já adiantados. */
  columnId: string;
  columnLabel: string;
  columnPosition: number;
  totalActive: number;
  /** Só populado quando há mais de uma coluna entre os ciclos do grupo
   * (evita ruído visual no caso comum de todos no mesmo estágio). */
  breakdown: SupplierColumnBreakdownEntry[];
  hasOverdue: boolean;
  /** Algum ciclo do grupo ainda não tem venda real por trás de
   * `purchaseIsOverdue`/etc. (ver `OperationsBoardCard.salesPending`) — a UI
   * usa isso pra borrar o badge "Urgente" do card de fornecedor até o
   * streaming resolver todos os itens do grupo. */
  salesPending: boolean;
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
    const weakest = group.reduce((weakest, card) =>
      card.columnPosition < weakest.columnPosition ? card : weakest,
    );

    const countByColumn = new Map<string, { label: string; position: number; count: number }>();
    for (const card of group) {
      const entry = countByColumn.get(card.columnId);
      if (entry) {
        entry.count += 1;
      } else {
        countByColumn.set(card.columnId, {
          label: card.columnLabel,
          position: card.columnPosition,
          count: 1,
        });
      }
    }
    const breakdown: SupplierColumnBreakdownEntry[] =
      countByColumn.size > 1
        ? [...countByColumn.entries()]
            .sort((a, b) => a[1].position - b[1].position)
            .map(([columnId, entry]) => ({
              columnId,
              columnLabel: entry.label,
              count: entry.count,
            }))
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
      columnId: weakest.columnId,
      columnLabel: weakest.columnLabel,
      columnPosition: weakest.columnPosition,
      totalActive: group.length,
      breakdown,
      hasOverdue: group.some((card) => card.purchaseIsOverdue),
      salesPending: group.some((card) => card.salesPending),
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
 * pra `targetPosition` (posição da coluna alvo no board):
 * - **forward** (existe ao menos 1 ciclo atrás do alvo): avança só esses —
 *   quem já está no alvo ou além fica intocado (não regride ninguém). Cobre
 *   também o caso misto (alguns atrás, algum outro já além do alvo).
 * - **backward** (nenhum ciclo atrás do alvo, mas existe algum além dele):
 *   ação corretiva deliberada — regride todos os que não estão no alvo.
 * - **noop**: todos os ciclos já estão exatamente no alvo.
 */
export function resolveMoveActionForSupplier(
  cyclesInGroup: { cycleId: string; columnPosition: number }[],
  targetPosition: number,
): MoveAction {
  const behind = cyclesInGroup.filter((c) => c.columnPosition < targetPosition);
  if (behind.length > 0) {
    return { cycleIdsToTransition: behind.map((c) => c.cycleId), direction: "forward" };
  }

  const notAtTarget = cyclesInGroup.filter((c) => c.columnPosition !== targetPosition);
  if (notAtTarget.length === 0) {
    return { cycleIdsToTransition: [], direction: "noop" };
  }
  return { cycleIdsToTransition: notAtTarget.map((c) => c.cycleId), direction: "backward" };
}
