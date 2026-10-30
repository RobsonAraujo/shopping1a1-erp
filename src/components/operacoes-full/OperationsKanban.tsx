"use client";

import { useCallback, useMemo, useState, type ReactNode } from "react";
import { itemListSearchEmptyMessage } from "@/components/shared/ItemListSearch";
import { OperationsCardBody } from "@/components/operacoes-full/OperationsKanbanCard";
import { KanbanBoard } from "@/components/kanban/KanbanBoard";
import { KanbanFullscreenFrame } from "@/components/kanban/KanbanFullscreenFrame";
import { KanbanToolbar } from "@/components/kanban/KanbanToolbar";
import { UserFeedback } from "@/components/ui/user-feedback";
import type { OperationsBoardCard } from "@/lib/compras/replenishment-cycle-data";
import { matchesItemListSearch } from "@/lib/item-list-search";
import { useKanbanBoard, type KanbanColumnRow } from "@/hooks/use-kanban-columns";
import { useOperationsBoardCards } from "@/hooks/use-operations-board-cards";
import type { OperationCycleKind } from "@/generated/prisma/client";
import type { KanbanAppearance } from "@/lib/kanban/kanban-column-colors";

type OperationsKanbanProps = {
  initialCards: OperationsBoardCard[];
  /** Board único — sem abas internas. */
  kind: OperationCycleKind;
  /** Colunas + fundo + aparência já carregadas no servidor —
   * evita o "piscar" de buscar isso num `useEffect` depois de montar
   * (ver `useKanbanBoard`). */
  initialColumns: KanbanColumnRow[];
  initialBackground: string;
  initialAppearance: KanbanAppearance;
};

const KIND_LABEL: Record<OperationCycleKind, string> = {
  purchase: "Reposição de compra",
  full: "Envio Full",
};

const getCycleId = (card: OperationsBoardCard) => card.cycleId;
const getCycleColumnId = (card: OperationsBoardCard) => card.columnId;
const getCyclePosition = (card: OperationsBoardCard) => card.position;
const getCycleLabel = (card: OperationsBoardCard) => card.sku ?? card.title;
const renderCycleCard = (card: OperationsBoardCard, menu: ReactNode) => (
  <OperationsCardBody card={card} menu={menu} />
);

/** Kanban de um board de operações (hoje só Operações Full): um card por
 * ciclo de um anúncio. */
export function OperationsKanban({
  initialCards,
  kind,
  initialColumns,
  initialBackground,
  initialAppearance,
}: OperationsKanbanProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const board = useKanbanBoard(kind, {
    columns: initialColumns,
    background: initialBackground,
    appearance: initialAppearance,
  });
  const { columns, removeColumn } = board;
  const {
    cards,
    busyIds,
    error: cardsError,
    streamError,
    streaming,
    syncing,
    refresh,
    moveCycles,
    applyServerRows,
  } = useOperationsBoardCards(kind, initialCards, columns);

  const filterCard = useMemo(
    () =>
      searchQuery.trim()
        ? (card: OperationsBoardCard) =>
            matchesItemListSearch(searchQuery, {
              sku: card.sku,
              title: card.title,
              mlItemId: card.mlItemId,
            })
        : null,
    [searchQuery],
  );
  const filteredCount = filterCard ? cards.filter(filterCard).length : cards.length;

  const handleMoveCard = useCallback(
    (card: OperationsBoardCard, column: KanbanColumnRow, position: number) => {
      const last = columns.reduce<KanbanColumnRow | undefined>(
        (max, c) => (!max || c.position > max.position ? c : max),
        undefined,
      );
      void moveCycles([card.cycleId], { column, isFinal: column.id === last?.id, position });
    },
    [columns, moveCycles],
  );

  const handleDeleteColumn = useCallback(
    async (id: string, moveCardsToColumnId?: string) => {
      const result = await removeColumn(id, moveCardsToColumnId);
      if (result.ok) applyServerRows(result.relocated);
      return result;
    },
    [removeColumn, applyServerRows],
  );

  const errors = [...new Set([cardsError, board.error, streamError].filter(Boolean))];

  return (
    <KanbanFullscreenFrame title={KIND_LABEL[kind]} count={cards.length} background={board.background}>
      <div className="flex h-full min-h-0 flex-col gap-3 max-sm:overflow-hidden sm:gap-5">
        <div className="flex shrink-0 flex-col gap-3 px-3 pt-3 sm:gap-5 sm:px-4">
          <KanbanToolbar
            search={{
              value: searchQuery,
              onChange: setSearchQuery,
              filteredCount,
              totalCount: cards.length,
              placeholder: "Buscar por SKU, título ou MLB…",
            }}
            background={board.background}
            onBackgroundChange={board.setBackground}
            appearance={board.appearance}
            setTheme={board.setTheme}
            setSolidColor={board.setSolidColor}
            setColorMode={board.setColorMode}
            syncing={syncing}
            syncDisabled={syncing || streaming}
            onSync={() => void refresh()}
          />

          {errors.map((message) => (
            <UserFeedback key={message}>{message}</UserFeedback>
          ))}

          {cards.length > 0 && filteredCount === 0 ? (
            <p className="text-sm text-[var(--muted-foreground)]">
              {itemListSearchEmptyMessage(searchQuery)}
            </p>
          ) : null}
        </div>

        <KanbanBoard
          boardId={kind}
          columns={columns}
          cards={cards}
          filterCard={filterCard}
          getCardId={getCycleId}
          getCardColumnId={getCycleColumnId}
          getCardPosition={getCyclePosition}
          getCardLabel={getCycleLabel}
          renderCard={renderCycleCard}
          busyCardIds={busyIds}
          onMoveCard={handleMoveCard}
          onReorderColumns={board.reorder}
          onRenameColumn={board.rename}
          onAddColumn={board.addColumn}
          onDeleteColumn={handleDeleteColumn}
          onToggleCollapse={board.toggleCollapse}
          appearance={board.appearance}
          setColumnColor={board.setColumnColor}
        />
      </div>
    </KanbanFullscreenFrame>
  );
}
