import type { Edge } from "@atlaskit/pragmatic-drag-and-drop-hitbox/types";
import { positionBetween } from "@/lib/kanban/kanban-position";

/**
 * A parte pura do arrasto dos Kanbans (Compras e Operações Full) — mesmo
 * desenho de `lib/home/dashboard/drop-target.ts`.
 *
 * O Pragmatic drag and drop passa dados como `Record<string | symbol, unknown>`,
 * sem tipo. Este módulo é o **único** lugar que lê esses dados e o único que
 * faz a conta de destino (coluna + posição) — os componentes só lidam com
 * valores já validados.
 *
 * Todo dado carrega o `boardId`: cada board registra o próprio
 * `monitorForElements`, e sem esse filtro um monitor reagiria ao arrasto de
 * outra superfície da página.
 */

export const KANBAN_CARD_DRAG_TYPE = "kanban-card";
export const KANBAN_COLUMN_DRAG_TYPE = "kanban-column";
/** A coluna como **alvo** (área vazia, header, coluna recolhida). */
export const KANBAN_COLUMN_DROP_TYPE = "kanban-column-drop";

export type KanbanCardDragData = {
  type: typeof KANBAN_CARD_DRAG_TYPE;
  boardId: string;
  cardId: string;
  columnId: string;
  /**
   * Altura do card em px, medida no início do arrasto — quem desenha a sombra
   * de destino é **outro** card, e precisa saber o tamanho do buraco a abrir.
   */
  height?: number;
};

export type KanbanColumnDragData = {
  type: typeof KANBAN_COLUMN_DRAG_TYPE;
  boardId: string;
  columnId: string;
};

export type KanbanColumnDropData = {
  type: typeof KANBAN_COLUMN_DROP_TYPE;
  boardId: string;
  columnId: string;
};

/** O mínimo que a resolução precisa de cada card: já na ordem da coluna. */
export type KanbanCardRef = { id: string; position: number };

export type KanbanCardDrop = { columnId: string; position: number };

type UnknownData = Record<string | symbol, unknown>;

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

export function kanbanCardDragData(
  boardId: string,
  cardId: string,
  columnId: string,
  height?: number,
): KanbanCardDragData {
  return {
    type: KANBAN_CARD_DRAG_TYPE,
    boardId,
    cardId,
    columnId,
    ...(typeof height === "number" && Number.isFinite(height) && height > 0
      ? { height }
      : {}),
  };
}

export function kanbanColumnDragData(boardId: string, columnId: string): KanbanColumnDragData {
  return { type: KANBAN_COLUMN_DRAG_TYPE, boardId, columnId };
}

export function kanbanColumnDropData(boardId: string, columnId: string): KanbanColumnDropData {
  return { type: KANBAN_COLUMN_DROP_TYPE, boardId, columnId };
}

/** Lê os dados de um card, devolvendo `null` se não for deste board. */
export function parseKanbanCardDragData(
  data: UnknownData | undefined | null,
  boardId: string,
): KanbanCardDragData | null {
  if (!data || data.type !== KANBAN_CARD_DRAG_TYPE || data.boardId !== boardId) return null;
  const { cardId, columnId, height } = data as Partial<KanbanCardDragData>;
  if (!isNonEmptyString(cardId) || !isNonEmptyString(columnId)) return null;
  return kanbanCardDragData(boardId, cardId, columnId, height);
}

/** Lê os dados de uma coluna arrastada, devolvendo `null` se não for deste board. */
export function parseKanbanColumnDragData(
  data: UnknownData | undefined | null,
  boardId: string,
): KanbanColumnDragData | null {
  if (!data || data.type !== KANBAN_COLUMN_DRAG_TYPE || data.boardId !== boardId) return null;
  const { columnId } = data as Partial<KanbanColumnDragData>;
  if (!isNonEmptyString(columnId)) return null;
  return kanbanColumnDragData(boardId, columnId);
}

/** Lê os dados de uma coluna alvo, devolvendo `null` se não for deste board. */
export function parseKanbanColumnDropData(
  data: UnknownData | undefined | null,
  boardId: string,
): KanbanColumnDropData | null {
  if (!data || data.type !== KANBAN_COLUMN_DROP_TYPE || data.boardId !== boardId) return null;
  const { columnId } = data as Partial<KanbanColumnDropData>;
  if (!isNonEmptyString(columnId)) return null;
  return kanbanColumnDropData(boardId, columnId);
}

/** Vizinhos atuais do card na própria coluna — pra reconhecer um drop que
 * não muda nada (soltou no mesmo lugar). */
function currentNeighbors(
  cards: readonly KanbanCardRef[],
  cardId: string,
): { before: string | null; after: string | null } | null {
  const index = cards.findIndex((c) => c.id === cardId);
  if (index === -1) return null;
  return {
    before: cards[index - 1]?.id ?? null,
    after: cards[index + 1]?.id ?? null,
  };
}

function dropBetween(
  cardsByColumn: ReadonlyMap<string, readonly KanbanCardRef[]>,
  source: { cardId: string; columnId: string },
  columnId: string,
  before: KanbanCardRef | undefined,
  after: KanbanCardRef | undefined,
): KanbanCardDrop | null {
  if (source.columnId === columnId) {
    const neighbors = currentNeighbors(cardsByColumn.get(columnId) ?? [], source.cardId);
    if (
      neighbors &&
      neighbors.before === (before?.id ?? null) &&
      neighbors.after === (after?.id ?? null)
    ) {
      return null;
    }
  }
  return { columnId, position: positionBetween(before?.position, after?.position) };
}

/**
 * Soltou sobre outro card: a borda (vinda do `attachClosestEdge`) decide se
 * entra acima ou abaixo dele. Os vizinhos são contados **sem o card que está
 * sendo movido** — senão soltar logo abaixo de si mesmo "pularia" um card.
 */
export function resolveCardDropOnCard(
  cardsByColumn: ReadonlyMap<string, readonly KanbanCardRef[]>,
  source: { cardId: string; columnId: string },
  over: { cardId: string; columnId: string },
  edge: Edge | null,
): KanbanCardDrop | null {
  if (over.cardId === source.cardId) return null;
  const others = (cardsByColumn.get(over.columnId) ?? []).filter((c) => c.id !== source.cardId);
  const index = others.findIndex((c) => c.id === over.cardId);
  if (index === -1) return null;
  // Só as bordas verticais importam numa coluna; qualquer outra coisa (ou
  // ausência de borda) cai em "acima", o alvo mais próximo do cursor.
  return edge === "bottom"
    ? dropBetween(cardsByColumn, source, over.columnId, others[index], others[index + 1])
    : dropBetween(cardsByColumn, source, over.columnId, others[index - 1], others[index]);
}

/** Soltou na coluna fora de qualquer card (área vazia, header, coluna
 * recolhida): vai pro fim dela — igual ao Trello. */
export function resolveCardDropOnColumn(
  cardsByColumn: ReadonlyMap<string, readonly KanbanCardRef[]>,
  source: { cardId: string; columnId: string },
  columnId: string,
): KanbanCardDrop | null {
  if (!cardsByColumn.has(columnId)) return null;
  const others = (cardsByColumn.get(columnId) ?? []).filter((c) => c.id !== source.cardId);
  return dropBetween(cardsByColumn, source, columnId, others[others.length - 1], undefined);
}

/**
 * Resolve o destino a partir da lista de alvos que o pdnd entrega no `onDrop`.
 * Ela vem ordenada **do mais interno para fora** (`[card, coluna]`), então o
 * card ganha da coluna: se o cursor está sobre um card, é a borda dele que
 * decide; a coluna só responde quando o cursor está fora dos cards.
 */
export function resolveCardDrop(
  cardsByColumn: ReadonlyMap<string, readonly KanbanCardRef[]>,
  source: { cardId: string; columnId: string },
  boardId: string,
  targets: readonly { data: UnknownData }[],
  extractEdge: (data: UnknownData) => Edge | null,
): KanbanCardDrop | null {
  for (const target of targets) {
    const card = parseKanbanCardDragData(target.data, boardId);
    if (card) {
      return resolveCardDropOnCard(cardsByColumn, source, card, extractEdge(target.data));
    }
    const column = parseKanbanColumnDropData(target.data, boardId);
    if (column) {
      return resolveCardDropOnColumn(cardsByColumn, source, column.columnId);
    }
  }
  return null;
}

/**
 * Nova ordem das colunas ao soltar `draggedId` na borda `edge` (esquerda ou
 * direita) de `targetId`. A primeira e a última coluna podem ser travadas —
 * nunca mudam de lugar, então o destino é limitado ao trecho entre elas.
 * `null` quando nada muda ou o arrasto não é válido.
 */
export function resolveColumnReorder(
  columns: readonly { id: string; isLocked: boolean }[],
  draggedId: string,
  targetId: string,
  edge: Edge | null,
): string[] | null {
  if (draggedId === targetId) return null;
  const dragged = columns.find((c) => c.id === draggedId);
  if (!dragged || dragged.isLocked) return null;

  const others = columns.filter((c) => c.id !== draggedId);
  const targetIndex = others.findIndex((c) => c.id === targetId);
  if (targetIndex === -1) return null;

  let insertAt = edge === "right" ? targetIndex + 1 : targetIndex;
  const minIndex = others[0]?.isLocked ? 1 : 0;
  const maxIndex = others[others.length - 1]?.isLocked ? others.length - 1 : others.length;
  insertAt = Math.min(Math.max(insertAt, minIndex), maxIndex);

  const next = [...others.slice(0, insertAt), dragged, ...others.slice(insertAt)].map((c) => c.id);
  const unchanged = next.every((id, index) => id === columns[index]?.id);
  return unchanged ? null : next;
}
