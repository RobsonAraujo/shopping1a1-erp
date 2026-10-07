"use client";

import {
  draggable,
  dropTargetForElements,
} from "@atlaskit/pragmatic-drag-and-drop/adapter/element-adapter";
import { preserveOffsetOnSource } from "@atlaskit/pragmatic-drag-and-drop/utils/preserve-offset-on-source";
import { setCustomNativeDragPreview } from "@atlaskit/pragmatic-drag-and-drop/utils/set-custom-native-drag-preview";
import { autoScrollForElements } from "@atlaskit/pragmatic-drag-and-drop-auto-scroll/element";
import { attachClosestEdge } from "@atlaskit/pragmatic-drag-and-drop-hitbox/closest-edge/attach-closest-edge";
import { extractClosestEdge } from "@atlaskit/pragmatic-drag-and-drop-hitbox/closest-edge/extract-closest-edge";
import type { Edge } from "@atlaskit/pragmatic-drag-and-drop-hitbox/types";
import { ChevronRight } from "lucide-react";
import { memo, useEffect, useMemo, useState, type ReactNode } from "react";
import type { KanbanCardMenuAction } from "@/components/kanban/KanbanCardMenu";
import { KanbanCardSlot, KanbanDropShadow } from "@/components/kanban/KanbanCardSlot";
import { KanbanColumnHeader } from "@/components/kanban/KanbanColumnHeader";
import type { KanbanColumnRow } from "@/hooks/use-kanban-columns";
import { renderCardDragPreview } from "@/lib/dnd/drag-preview";
import {
  kanbanColumnDragData,
  kanbanColumnDropData,
  parseKanbanCardDragData,
  parseKanbanColumnDragData,
} from "@/lib/kanban/kanban-dnd";
import {
  resolveKanbanColumnPaint,
  type KanbanColumnColorMode,
} from "@/lib/kanban/kanban-column-colors";
import { cn } from "@/lib/utils";

type KanbanColumnProps<T> = {
  boardId: string;
  column: KanbanColumnRow;
  /** Bordas em que outra coluna pode ser solta aqui. A primeira e a última
   * coluna (travadas) só aceitam do lado de dentro — vazio = nenhuma. */
  reorderEdges: readonly Edge[];
  /** Cards visíveis (já filtrados pela busca), na ordem da coluna. */
  cards: readonly T[];
  getCardId: (card: T) => string;
  getCardLabel: (card: T) => string;
  renderCard: (card: T, menu: ReactNode) => ReactNode;
  busyCardIds: ReadonlySet<string>;
  draggingCardId: string | null;
  /** A origem do arrasto cedeu o espaço pra uma sombra em outro lugar. */
  shadowElsewhere: boolean;
  draggingColumnId: string | null;
  colorId: string | undefined;
  colorMode: KanbanColumnColorMode;
  /** Tema "colorido": cada coluna escolhe a própria cor no header. */
  colorPicker: boolean;
  fullHeight: boolean;
  menuColumns: readonly KanbanColumnRow[];
  onRename: (columnId: string, label: string) => void;
  onToggleCollapse: (columnId: string, isCollapsed: boolean) => void;
  onRequestDelete: (columnId: string) => void;
  onColorChange: (columnId: string, colorId: string) => void;
  onCardMenuAction: (cardId: string, action: KanbanCardMenuAction) => void;
};

/**
 * Uma coluna do Kanban. É três coisas no Pragmatic drag and drop:
 *
 * - **Alvo de card** fora dos cards (área vazia, header, coluna recolhida):
 *   soltar aqui manda o card pro fim — e a coluna mostra a sombra no fim
 *   enquanto ela é o alvo mais interno.
 * - **Alvo de coluna**, com a borda esquerda/direita mais próxima decidindo
 *   de que lado a coluna arrastada entra (linha vertical como indicador).
 * - **Arrastável pelo header** (menos as travadas e durante a edição do nome).
 *
 * Os elementos chegam por `ref` de callback em estado, não por `useRef`: o
 * header só existe com a coluna expandida, e o effect precisa rodar de novo
 * quando ele aparece.
 */
function KanbanColumnImpl<T>({
  boardId,
  column,
  reorderEdges,
  cards,
  getCardId,
  getCardLabel,
  renderCard,
  busyCardIds,
  draggingCardId,
  shadowElsewhere,
  draggingColumnId,
  colorId,
  colorMode,
  colorPicker,
  fullHeight,
  menuColumns,
  onRename,
  onToggleCollapse,
  onRequestDelete,
  onColorChange,
  onCardMenuAction,
}: KanbanColumnProps<T>) {
  const [shellEl, setShellEl] = useState<HTMLElement | null>(null);
  const [headerEl, setHeaderEl] = useState<HTMLElement | null>(null);
  const [listEl, setListEl] = useState<HTMLDivElement | null>(null);
  const [editing, setEditing] = useState(false);
  const [endShadowHeight, setEndShadowHeight] = useState<number | null>(null);
  const [showEndShadow, setShowEndShadow] = useState(false);
  const [columnEdge, setColumnEdge] = useState<Edge | null>(null);

  const collapsed = column.isCollapsed;
  const canDragColumn = !column.isLocked && !collapsed && !editing;
  const paint = useMemo(() => resolveKanbanColumnPaint(colorId, colorMode), [colorId, colorMode]);

  useEffect(() => {
    if (!shellEl) return;
    const allowedEdges = [...reorderEdges];
    return dropTargetForElements({
      element: shellEl,
      canDrop: ({ source }) => {
        if (parseKanbanCardDragData(source.data, boardId)) return true;
        const dragged = parseKanbanColumnDragData(source.data, boardId);
        return dragged !== null && allowedEdges.length > 0;
      },
      getData: ({ input, element, source }) => {
        const data = { ...kanbanColumnDropData(boardId, column.id) };
        return parseKanbanColumnDragData(source.data, boardId)
          ? attachClosestEdge(data, { input, element, allowedEdges })
          : data;
      },
      onDrag: ({ self, source, location }) => {
        const card = parseKanbanCardDragData(source.data, boardId);
        if (card) {
          // Sombra no fim só quando é a coluna (e não um card dela) que está
          // sob o cursor — sobre um card, quem abre a sombra é o card.
          const isInnermost = location.current.dropTargets[0]?.element === self.element;
          setShowEndShadow(isInnermost);
          setEndShadowHeight(card.height ?? null);
          return;
        }
        const dragged = parseKanbanColumnDragData(source.data, boardId);
        setColumnEdge(dragged && dragged.columnId !== column.id ? extractClosestEdge(self.data) : null);
      },
      onDragLeave: () => {
        setShowEndShadow(false);
        setColumnEdge(null);
      },
      onDrop: () => {
        setShowEndShadow(false);
        setColumnEdge(null);
      },
    });
  }, [shellEl, boardId, column.id, reorderEdges]);

  useEffect(() => {
    if (!shellEl || !headerEl || !canDragColumn) return;
    return draggable({
      element: headerEl,
      getInitialData: () => ({ ...kanbanColumnDragData(boardId, column.id) }),
      onGenerateDragPreview: ({ location, nativeSetDragImage }) => {
        const width = shellEl.getBoundingClientRect().width;
        setCustomNativeDragPreview({
          nativeSetDragImage,
          getOffset: preserveOffsetOnSource({ element: shellEl, input: location.current.input }),
          render: ({ container }) => renderCardDragPreview({ source: shellEl, container, width }),
        });
      },
    });
  }, [shellEl, headerEl, canDragColumn, boardId, column.id]);

  // Em tela cheia a lista de cards rola por dentro: arrastar perto da borda
  // de cima/baixo dela tem que rolar, senão não dá pra alcançar o fim.
  useEffect(() => {
    if (!listEl || !fullHeight) return;
    return autoScrollForElements({
      element: listEl,
      canScroll: ({ source }) => parseKanbanCardDragData(source.data, boardId) !== null,
    });
  }, [listEl, fullHeight, boardId]);

  return (
    <div
      className={cn(
        "relative flex shrink-0 snap-center flex-col sm:snap-align-none",
        (collapsed || fullHeight) && "self-start",
        fullHeight && !collapsed && "max-h-full",
      )}
    >
      {columnEdge === "left" ? <ColumnDropIndicator side="left" /> : null}
      <section
        ref={setShellEl}
        aria-label={`Coluna ${column.label}`}
        className={cn(
          "flex min-h-0 flex-col overflow-hidden rounded-xl border border-[var(--border)] bg-[rgb(255_255_255_/_65%)] shadow-sm transition-opacity",
          collapsed ? "w-10" : "w-[calc(100vw-2.75rem)] sm:w-72",
          draggingColumnId === column.id && "opacity-40",
          showEndShadow && collapsed && "ring-2 ring-[var(--primary)] ring-inset",
        )}
        style={paint.shellStyle}
      >
        {paint.stripe ? (
          <div aria-hidden className="h-1.5 shrink-0" style={{ background: paint.stripe }} />
        ) : null}
        {collapsed ? (
          <button
            type="button"
            onClick={() => onToggleCollapse(column.id, false)}
            aria-label={`Expandir coluna ${column.label}`}
            className="flex h-64 cursor-pointer flex-col items-center justify-between gap-2 py-3 text-[var(--muted-foreground)] transition-colors hover:text-[var(--foreground)]"
          >
            <ChevronRight className="size-4 shrink-0" aria-hidden />
            <span className="flex-1 text-sm font-semibold [writing-mode:vertical-rl]">
              {column.label}
            </span>
            <span className="rounded-full bg-[var(--muted)] px-1.5 py-0.5 text-xs tabular-nums">
              {cards.length}
            </span>
          </button>
        ) : (
          <>
            <KanbanColumnHeader
              column={column}
              count={cards.length}
              headerStyle={paint.headerStyle}
              colorId={colorId}
              onColorChange={colorPicker ? (next) => onColorChange(column.id, next) : undefined}
              onToggleCollapse={() => onToggleCollapse(column.id, true)}
              onRename={(label) => onRename(column.id, label)}
              onRequestDelete={() => onRequestDelete(column.id)}
              dragRef={setHeaderEl}
              onEditingChange={setEditing}
            />
            <div
              ref={setListEl}
              className={cn("flex flex-1 flex-col gap-2 p-2", fullHeight && "min-h-0 overflow-y-auto")}
            >
              {cards.length === 0 && !showEndShadow ? (
                <p className="px-1 py-6 text-center text-xs text-[var(--muted-foreground)]">Vazio</p>
              ) : null}
              {cards.map((card, index) => {
                const cardId = getCardId(card);
                const isDragging = draggingCardId === cardId;
                return (
                  <KanbanCardSlot
                    key={cardId}
                    boardId={boardId}
                    card={card}
                    cardId={cardId}
                    columnId={column.id}
                    label={getCardLabel(card)}
                    renderCard={renderCard}
                    busy={busyCardIds.has(cardId)}
                    isDragging={isDragging}
                    collapsed={isDragging && shadowElsewhere}
                    isFirst={index === 0}
                    isLast={index === cards.length - 1}
                    menuColumns={menuColumns}
                    onMenuAction={onCardMenuAction}
                  />
                );
              })}
              {showEndShadow ? <KanbanDropShadow height={endShadowHeight} /> : null}
            </div>
          </>
        )}
      </section>
      {columnEdge === "right" ? <ColumnDropIndicator side="right" /> : null}
    </div>
  );
}

function ColumnDropIndicator({ side }: { side: "left" | "right" }) {
  return (
    <div
      aria-hidden
      className={cn(
        "pointer-events-none absolute inset-y-0 z-10 w-1 rounded-full bg-[var(--primary)]",
        // Meio do `gap-3` entre as colunas.
        side === "left" ? "-left-2" : "-right-2",
      )}
    />
  );
}

function sameItems<T>(a: readonly T[], b: readonly T[]): boolean {
  return a.length === b.length && a.every((item, index) => item === b[index]);
}

/**
 * `cards` é comparado item a item: o board recalcula a lista de cada coluna
 * sempre que **qualquer** card muda, mas uma coluna cujos cards são os
 * mesmos objetos não precisa renderizar de novo (o streaming de vendas só
 * troca o objeto do card que mudou).
 */
export const KanbanColumn = memo(KanbanColumnImpl, (prev, next) => {
  for (const key of Object.keys(next) as (keyof KanbanColumnProps<unknown>)[]) {
    if (key === "cards") {
      if (!sameItems(prev.cards, next.cards)) return false;
    } else if (prev[key] !== next[key]) {
      return false;
    }
  }
  return true;
}) as typeof KanbanColumnImpl;
