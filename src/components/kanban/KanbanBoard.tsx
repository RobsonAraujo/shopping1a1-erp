"use client";

import { monitorForElements } from "@atlaskit/pragmatic-drag-and-drop/adapter/element-adapter";
import {
  autoScrollForElements,
  autoScrollWindowForElements,
} from "@atlaskit/pragmatic-drag-and-drop-auto-scroll/element";
import { extractClosestEdge } from "@atlaskit/pragmatic-drag-and-drop-hitbox/closest-edge/extract-closest-edge";
import type { Edge } from "@atlaskit/pragmatic-drag-and-drop-hitbox/types";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { KanbanCardMenuAction } from "@/components/kanban/KanbanCardMenu";
import { KanbanColumn } from "@/components/kanban/KanbanColumn";
import { KanbanAddColumn } from "@/components/kanban/KanbanColumnHeader";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { FormSelect } from "@/components/ui/form-select";
import { UserFeedback } from "@/components/ui/user-feedback";
import type { DeleteColumnResult, KanbanColumnRow } from "@/hooks/use-kanban-columns";
import { useKanbanPanScroll } from "@/hooks/use-kanban-pan-scroll";
import {
  parseKanbanCardDragData,
  parseKanbanColumnDragData,
  parseKanbanColumnDropData,
  resolveCardDrop,
  resolveColumnReorder,
  type KanbanCardRef,
} from "@/lib/kanban/kanban-dnd";
import { columnColorIdFor, type KanbanAppearance } from "@/lib/kanban/kanban-column-colors";
import { positionAtEnd, positionBetween } from "@/lib/kanban/kanban-position";
import { cn } from "@/lib/utils";

const BOTH_EDGES: readonly Edge[] = ["left", "right"];
const RIGHT_EDGE: readonly Edge[] = ["right"];
const LEFT_EDGE: readonly Edge[] = ["left"];
const NO_EDGES: readonly Edge[] = [];
const NO_CARDS: readonly never[] = [];

type DragState = {
  cardId: string | null;
  columnId: string | null;
  /** A sombra de destino está em outro lugar que não a origem. */
  shadowElsewhere: boolean;
};

const IDLE: DragState = { cardId: null, columnId: null, shadowElsewhere: false };

export type KanbanBoardProps<T> = {
  /** Identifica o board nos dados do arrasto — um monitor nunca reage ao
   * arrasto de outra superfície da página. */
  boardId: string;
  columns: KanbanColumnRow[];
  /** Todos os cards do board. */
  cards: readonly T[];
  /** Filtro da busca — `null` mostra tudo. O arrasto calcula a posição entre
   * os vizinhos **visíveis**. */
  filterCard: ((card: T) => boolean) | null;
  getCardId: (card: T) => string;
  getCardColumnId: (card: T) => string;
  getCardPosition: (card: T) => number;
  getCardLabel: (card: T) => string;
  renderCard: (card: T, menu: ReactNode) => ReactNode;
  busyCardIds: ReadonlySet<string>;
  /** Soltou (ou escolheu no menu ⋯) um destino que muda alguma coisa. */
  onMoveCard: (card: T, column: KanbanColumnRow, position: number) => void;
  onReorderColumns: (orderedIds: string[]) => void;
  onRenameColumn: (id: string, label: string) => void;
  onAddColumn: (label: string) => void;
  onDeleteColumn: (id: string, moveCardsToColumnId?: string) => Promise<DeleteColumnResult>;
  onToggleCollapse: (id: string, isCollapsed: boolean) => void;
  appearance: KanbanAppearance;
  setColumnColor: (columnId: string, colorId: string) => void;
  /** CSS `background` (cor sólida ou gradiente) escolhido pelo usuário —
   * vazio/undefined = sem cor (fundo padrão do app). */
  background?: string;
  /** Modo "tela cheia" (estilo Trello): colunas ocupam a altura total
   * disponível e rolam verticalmente por dentro, em vez de esticar a página. */
  fullHeight?: boolean;
};

function compareByPosition<T>(
  getCardPosition: (card: T) => number,
  getCardId: (card: T) => string,
): (a: T, b: T) => number {
  return (a, b) => {
    const diff = getCardPosition(a) - getCardPosition(b);
    if (diff !== 0) return diff;
    const idA = getCardId(a);
    const idB = getCardId(b);
    return idA < idB ? -1 : idA > idB ? 1 : 0;
  };
}

/**
 * Kanban estilo Trello sobre o **Pragmatic drag and drop** — compartilhado por
 * Compras (card = fornecedor) e Operações Full (card = ciclo de um anúncio).
 *
 * - A ordem dentro da coluna é **só a manual** (`getCardPosition`); o board
 *   nunca reordena por conta própria.
 * - O board guarda apenas quem está sendo arrastado. Hover, borda e sombra
 *   vivem em cada card/coluna, e **um** `monitorForElements` resolve o destino
 *   no `onDrop` (`resolveCardDrop`/`resolveColumnReorder`, puras e testadas).
 * - Colunas e cards são memoizados: mover o cursor, ou o streaming de vendas
 *   atualizar um card, re-renderiza só o que mudou.
 */
export function KanbanBoard<T>({
  boardId,
  columns,
  cards,
  filterCard,
  getCardId,
  getCardColumnId,
  getCardPosition,
  getCardLabel,
  renderCard,
  busyCardIds,
  onMoveCard,
  onReorderColumns,
  onRenameColumn,
  onAddColumn,
  onDeleteColumn,
  onToggleCollapse,
  appearance,
  setColumnColor,
  background,
  fullHeight = false,
}: KanbanBoardProps<T>) {
  const [drag, setDrag] = useState<DragState>(IDLE);
  const [scrollEl, setScrollEl] = useState<HTMLDivElement | null>(null);
  const [pendingDelete, setPendingDelete] = useState<{
    column: KanbanColumnRow;
    cardCount: number;
  } | null>(null);
  const [deleteTarget, setDeleteTarget] = useState("");
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  const sortedColumns = useMemo(
    () => [...columns].sort((a, b) => a.position - b.position),
    [columns],
  );

  const colorIdByColumn = useMemo(() => {
    const ids = sortedColumns.map((c) => c.id);
    return new Map(ids.map((id) => [id, columnColorIdFor(appearance, id, ids)]));
  }, [sortedColumns, appearance]);

  /** Todos os cards por coluna, na ordem manual — inclusive os escondidos
   * pela busca (contam pra excluir coluna). */
  const allByColumn = useMemo(() => {
    const map = new Map<string, T[]>(sortedColumns.map((c) => [c.id, []]));
    for (const card of cards) map.get(getCardColumnId(card))?.push(card);
    const compare = compareByPosition(getCardPosition, getCardId);
    for (const list of map.values()) list.sort(compare);
    return map;
  }, [cards, sortedColumns, getCardColumnId, getCardPosition, getCardId]);

  const visibleByColumn = useMemo(() => {
    if (!filterCard) return allByColumn;
    return new Map([...allByColumn].map(([id, list]) => [id, list.filter(filterCard)]));
  }, [allByColumn, filterCard]);

  // O monitor e o menu precisam do estado mais recente SEM re-registrar: o
  // pdnd não entrega eventos a um monitor registrado no meio de um arrasto,
  // então re-registrar cancelaria o arrasto em curso. A escrita vai num
  // effect (mutar ref durante o render é erro nas regras do React Compiler).
  const latest = useRef({
    sortedColumns,
    allByColumn,
    visibleByColumn,
    getCardId,
    getCardColumnId,
    getCardPosition,
    onMoveCard,
    onReorderColumns,
  });
  useEffect(() => {
    latest.current = {
      sortedColumns,
      allByColumn,
      visibleByColumn,
      getCardId,
      getCardColumnId,
      getCardPosition,
      onMoveCard,
      onReorderColumns,
    };
  }, [
    sortedColumns,
    allByColumn,
    visibleByColumn,
    getCardId,
    getCardColumnId,
    getCardPosition,
    onMoveCard,
    onReorderColumns,
  ]);

  const findCard = useCallback((cardId: string): T | undefined => {
    const { visibleByColumn: byColumn, getCardId: idOf } = latest.current;
    for (const list of byColumn.values()) {
      const found = list.find((card) => idOf(card) === cardId);
      if (found) return found;
    }
    return undefined;
  }, []);

  const refsByColumn = useCallback((): Map<string, KanbanCardRef[]> => {
    const { visibleByColumn: byColumn, getCardId: idOf, getCardPosition: positionOf } = latest.current;
    return new Map(
      [...byColumn].map(([columnId, list]) => [
        columnId,
        list.map((card) => ({ id: idOf(card), position: positionOf(card) })),
      ]),
    );
  }, []);

  useEffect(() => {
    return monitorForElements({
      canMonitor: ({ source }) =>
        parseKanbanCardDragData(source.data, boardId) !== null ||
        parseKanbanColumnDragData(source.data, boardId) !== null,
      onDragStart: ({ source }) => {
        const card = parseKanbanCardDragData(source.data, boardId);
        const column = parseKanbanColumnDragData(source.data, boardId);
        setDrag({
          cardId: card?.cardId ?? null,
          columnId: column?.columnId ?? null,
          shadowElsewhere: false,
        });
      },
      onDropTargetChange: ({ source, location }) => {
        const card = parseKanbanCardDragData(source.data, boardId);
        if (!card) return;
        const innermost = location.current.dropTargets[0];
        const overCard = innermost ? parseKanbanCardDragData(innermost.data, boardId) : null;
        const overColumn = innermost ? parseKanbanColumnDropData(innermost.data, boardId) : null;
        // A sombra está em outro lugar quando o alvo é outro card ou o fim de
        // uma coluna; sobre a própria origem (ou fora de tudo), a origem segue
        // ocupando o próprio lugar.
        const elsewhere = (overCard !== null && overCard.cardId !== card.cardId) || overColumn !== null;
        setDrag((prev) => (prev.shadowElsewhere === elsewhere ? prev : { ...prev, shadowElsewhere: elsewhere }));
      },
      onDrop: ({ source, location }) => {
        setDrag(IDLE);
        const targets = location.current.dropTargets;
        const { sortedColumns: columnsNow } = latest.current;

        const draggedColumn = parseKanbanColumnDragData(source.data, boardId);
        if (draggedColumn) {
          const target = targets[0];
          const over = target ? parseKanbanColumnDropData(target.data, boardId) : null;
          if (!target || !over) return;
          const next = resolveColumnReorder(
            columnsNow,
            draggedColumn.columnId,
            over.columnId,
            extractClosestEdge(target.data),
          );
          if (next) latest.current.onReorderColumns(next);
          return;
        }

        const draggedCard = parseKanbanCardDragData(source.data, boardId);
        if (!draggedCard) return;
        const card = findCard(draggedCard.cardId);
        if (!card) return;
        const drop = resolveCardDrop(
          refsByColumn(),
          { cardId: draggedCard.cardId, columnId: latest.current.getCardColumnId(card) },
          boardId,
          targets,
          extractClosestEdge,
        );
        const column = drop ? columnsNow.find((c) => c.id === drop.columnId) : undefined;
        if (drop && column) latest.current.onMoveCard(card, column, drop.position);
      },
    });
  }, [boardId, findCard, refsByColumn]);

  // Arrastar perto da borda esquerda/direita do board rola as colunas; fora
  // da tela cheia, perto do topo/fundo da janela rola a página.
  useEffect(() => {
    if (!scrollEl) return;
    return autoScrollForElements({
      element: scrollEl,
      canScroll: ({ source }) =>
        parseKanbanCardDragData(source.data, boardId) !== null ||
        parseKanbanColumnDragData(source.data, boardId) !== null,
    });
  }, [scrollEl, boardId]);

  useEffect(() => {
    if (fullHeight) return;
    return autoScrollWindowForElements({
      canScroll: ({ source }) => parseKanbanCardDragData(source.data, boardId) !== null,
    });
  }, [fullHeight, boardId]);

  const handleCardMenuAction = useCallback(
    (cardId: string, action: KanbanCardMenuAction) => {
      const card = findCard(cardId);
      if (!card) return;
      const { sortedColumns: columnsNow, getCardColumnId: columnOf } = latest.current;
      const refs = refsByColumn();
      const currentColumnId = columnOf(card);
      const targetColumnId = action.type === "column" ? action.columnId : currentColumnId;
      const column = columnsNow.find((c) => c.id === targetColumnId);
      if (!column) return;
      const others = (refs.get(targetColumnId) ?? []).filter((ref) => ref.id !== cardId);
      const position =
        action.type === "top"
          ? positionBetween(null, others[0]?.position)
          : positionAtEnd(others.map((ref) => ref.position));
      latest.current.onMoveCard(card, column, position);
    },
    [findCard, refsByColumn],
  );

  const requestDelete = useCallback((columnId: string) => {
    const { sortedColumns: columnsNow, allByColumn: byColumn } = latest.current;
    const column = columnsNow.find((c) => c.id === columnId);
    if (!column) return;
    setDeleteError(null);
    setDeleteTarget("");
    setPendingDelete({ column, cardCount: byColumn.get(columnId)?.length ?? 0 });
  }, []);

  async function confirmDelete() {
    if (!pendingDelete) return;
    if (pendingDelete.cardCount > 0 && !deleteTarget) return;
    setDeleting(true);
    const result = await onDeleteColumn(
      pendingDelete.column.id,
      pendingDelete.cardCount > 0 ? deleteTarget : undefined,
    );
    setDeleting(false);
    if (!result.ok) {
      setDeleteError(result.error);
      return;
    }
    setPendingDelete(null);
  }

  const otherColumnOptions = pendingDelete
    ? sortedColumns
        .filter((c) => c.id !== pendingDelete.column.id)
        .map((c) => ({ value: c.id, label: c.label }))
    : [];

  const panScroll = useKanbanPanScroll();
  const colorPicker = appearance.theme === "colorful";
  const dragging = drag.cardId !== null || drag.columnId !== null;
  const firstId = sortedColumns[0]?.id;
  const lastId = sortedColumns[sortedColumns.length - 1]?.id;

  return (
    <>
      <div
        ref={setScrollEl}
        className={cn(
          "flex gap-3 overflow-x-auto overscroll-x-contain",
          // Snap só ajuda a rolar no celular; durante o arrasto ele brigaria
          // com o autoscroll (cada passo do autoscroll "voltaria" pro snap).
          dragging ? "snap-none" : "snap-x snap-mandatory sm:snap-none",
          fullHeight
            ? "min-h-0 flex-1 px-3 pb-3 sm:px-4 sm:pb-12 kanban-scroll-x"
            : "rounded-2xl p-3 max-sm:-mx-4 max-sm:rounded-none max-sm:px-4",
        )}
        style={!fullHeight && background ? { background } : undefined}
        {...panScroll}
      >
        {sortedColumns.map((column) => {
          const isEdgeLocked = column.isLocked && (column.id === firstId || column.id === lastId);
          const reorderEdges = !isEdgeLocked
            ? BOTH_EDGES
            : column.id === firstId && column.id === lastId
              ? NO_EDGES
              : column.id === firstId
                ? RIGHT_EDGE
                : LEFT_EDGE;
          return (
            <KanbanColumn
              key={column.id}
              boardId={boardId}
              column={column}
              reorderEdges={reorderEdges}
              cards={visibleByColumn.get(column.id) ?? NO_CARDS}
              getCardId={getCardId}
              getCardLabel={getCardLabel}
              renderCard={renderCard}
              busyCardIds={busyCardIds}
              draggingCardId={drag.cardId}
              shadowElsewhere={drag.shadowElsewhere}
              draggingColumnId={drag.columnId}
              colorId={colorIdByColumn.get(column.id)}
              colorMode={appearance.colorMode}
              colorPicker={colorPicker}
              fullHeight={fullHeight}
              menuColumns={sortedColumns}
              onRename={onRenameColumn}
              onToggleCollapse={onToggleCollapse}
              onRequestDelete={requestDelete}
              onColorChange={setColumnColor}
              onCardMenuAction={handleCardMenuAction}
            />
          );
        })}
        <KanbanAddColumn onAdd={onAddColumn} />
      </div>

      <AlertDialog
        open={pendingDelete != null}
        onOpenChange={(next) => !next && setPendingDelete(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Excluir coluna &quot;{pendingDelete?.column.label}&quot;?
            </AlertDialogTitle>
            <AlertDialogDescription>
              {pendingDelete && pendingDelete.cardCount > 0
                ? `Essa coluna tem ${pendingDelete.cardCount} card${pendingDelete.cardCount === 1 ? "" : "s"}. Escolha para qual coluna movê-los antes de excluir.`
                : "Essa coluna está vazia — pode excluir sem afetar nenhum card."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          {pendingDelete && pendingDelete.cardCount > 0 ? (
            <FormSelect
              label="Mover cards para"
              value={deleteTarget}
              onValueChange={setDeleteTarget}
              options={otherColumnOptions}
              placeholder="Selecione a coluna de destino"
            />
          ) : null}
          {deleteError ? <UserFeedback>{deleteError}</UserFeedback> : null}
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={
                deleting ||
                Boolean(pendingDelete && pendingDelete.cardCount > 0 && !deleteTarget)
              }
              onClick={(e) => {
                e.preventDefault();
                void confirmDelete();
              }}
            >
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
