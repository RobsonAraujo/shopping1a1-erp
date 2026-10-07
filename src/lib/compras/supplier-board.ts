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
  /** Ordem manual do card na coluna = a menor `position` entre os ciclos do
   * fornecedor **nessa** coluna. Mover o card grava a mesma posição em todos
   * eles (ver `SupplierPurchaseKanban`), então na prática é um valor só. */
  position: number;
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

/**
 * Atualiza `columnLabel`/`columnPosition` dos cards com as colunas **atuais**
 * do board. Os cards trazem esses campos do servidor no load; depois de
 * renomear ou reordenar colunas eles ficavam velhos — e `columnPosition` é o
 * que decide a coluna "elo mais fraco" do fornecedor e se um drag avança ou
 * volta etapa. Devolve o mesmo objeto quando nada mudou.
 */
export function withCurrentColumnInfo(
  cards: OperationsBoardCard[],
  columns: readonly { id: string; label: string; position: number }[],
): OperationsBoardCard[] {
  const byId = new Map(columns.map((column) => [column.id, column]));
  let changed = false;
  const next = cards.map((card) => {
    const column = byId.get(card.columnId);
    if (!column || (column.label === card.columnLabel && column.position === card.columnPosition)) {
      return card;
    }
    changed = true;
    return { ...card, columnLabel: column.label, columnPosition: column.position };
  });
  return changed ? next : cards;
}

/** Constrói um card por fornecedor a partir dos cards de reposição de
 * compra (`kind: "purchase"`) já ativos. **Não ordena**: a ordem dentro da
 * coluna é a manual (`position`), aplicada pelo board — reordenar por
 * urgência aqui fazia os cards trocarem de lugar sozinhos enquanto o
 * streaming de vendas ia acendendo o "Urgente" de cada fornecedor. */
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
    const position = Math.min(
      ...group.filter((card) => card.columnId === weakest.columnId).map((card) => card.position),
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
      position,
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

  return result;
}

function sameSupplierBoardCard(a: SupplierBoardCard, b: SupplierBoardCard): boolean {
  return (
    a.supplier === b.supplier &&
    a.columnId === b.columnId &&
    a.columnLabel === b.columnLabel &&
    a.columnPosition === b.columnPosition &&
    a.position === b.position &&
    a.totalActive === b.totalActive &&
    a.hasOverdue === b.hasOverdue &&
    a.salesPending === b.salesPending &&
    a.suggestedQtyTotal === b.suggestedQtyTotal &&
    a.overflowCount === b.overflowCount &&
    a.cycleIds.length === b.cycleIds.length &&
    a.cycleIds.every((id, i) => id === b.cycleIds[i]) &&
    a.breakdown.length === b.breakdown.length &&
    a.breakdown.every(
      (entry, i) =>
        entry.columnId === b.breakdown[i].columnId &&
        entry.columnLabel === b.breakdown[i].columnLabel &&
        entry.count === b.breakdown[i].count,
    ) &&
    a.topItems.length === b.topItems.length &&
    a.topItems.every(
      (item, i) =>
        item.mlItemId === b.topItems[i].mlItemId &&
        item.sku === b.topItems[i].sku &&
        item.suggestedQty === b.topItems[i].suggestedQty &&
        item.imageUrl === b.topItems[i].imageUrl,
    )
  );
}

/**
 * Devolve `next`, mas reaproveitando o objeto **anterior** de cada fornecedor
 * cujo conteúdo não mudou. `buildSupplierBoardCards` sempre cria objetos
 * novos; sem isto, cada lote do streaming de vendas (que toca um ou dois
 * produtos) trocava a identidade de todos os cards e o board memoizado
 * re-renderizava inteiro.
 */
export function reuseUnchangedSupplierCards(
  previous: readonly SupplierBoardCard[],
  next: SupplierBoardCard[],
): SupplierBoardCard[] {
  const previousBySupplier = new Map(previous.map((card) => [card.supplier, card]));
  return next.map((card) => {
    const before = previousBySupplier.get(card.supplier);
    return before && sameSupplierBoardCard(before, card) ? before : card;
  });
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
