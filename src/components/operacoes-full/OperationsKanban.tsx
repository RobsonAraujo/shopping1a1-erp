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
import { cn } from "@/lib/utils";

type OperationsKanbanProps = {
  initialCards: OperationsBoardCard[];
  /** Board único — sem abas internas. */
  kind: OperationCycleKind;
  /** Colunas + fundo + tela cheia + aparência já carregadas no servidor —
   * evita o "piscar" de buscar isso num `useEffect` depois de montar
   * (ver `useKanbanBoard`). */
  initialColumns: KanbanColumnRow[];
  initialBackground: string;
  initialFullscreen: boolean;
  initialAppearance: KanbanAppearance;
};

const KIND_CONFIG: Record<OperationCycleKind, { label: string; description: string }> = {
  purchase: {
    label: "Reposição de compra",
    description:
      "Do alerta de compra até a chegada no galpão. O card some quando o estoque é imputado ou a necessidade de compra se resolve.",
  },
  full: {
    label: "Envio Full",
    description:
      "Agende o envio ao Full do Mercado Livre. O card some quando o estoque ML sobe após a coleta ou a necessidade de agendamento se resolve.",
  },
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
  initialFullscreen,
  initialAppearance,
}: OperationsKanbanProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const board = useKanbanBoard(kind, {
    columns: initialColumns,
    background: initialBackground,
    isFullscreen: initialFullscreen,
    appearance: initialAppearance,
  });
  const { columns, removeColumn, setFullscreen } = board;
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

  const exitFullscreen = useCallback(() => {
    void setFullscreen(false);
  }, [setFullscreen]);

  const config = KIND_CONFIG[kind];
  const isFullscreen = board.isFullscreen;
  const errors = [...new Set([cardsError, board.error, streamError].filter(Boolean))];

  return (
    <KanbanFullscreenFrame
      active={isFullscreen}
      title={config.label}
      count={cards.length}
      background={board.background}
      onExit={exitFullscreen}
    >
      <div className={cn("flex min-h-0 flex-col gap-3 sm:gap-5", isFullscreen && "h-full max-sm:overflow-hidden")}>
        <div className={cn("flex shrink-0 flex-col gap-3 sm:gap-5", isFullscreen && "px-3 pt-3 sm:px-4")}>
          {!isFullscreen ? (
            <div className="hidden sm:block">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-base font-semibold text-[var(--foreground)]">{config.label}</h2>
                <span className="rounded-full bg-[var(--muted)] px-2 py-0.5 text-xs tabular-nums text-[var(--foreground)]">
                  {cards.length}
                </span>
              </div>
              <p className="mt-1 max-w-3xl text-sm text-[var(--muted-foreground)]">
                {config.description}
              </p>
            </div>
          ) : null}

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
            isFullscreen={isFullscreen}
            onEnterFullscreen={() => void setFullscreen(true)}
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
          background={board.background}
          fullHeight={isFullscreen}
        />
      </div>
    </KanbanFullscreenFrame>
  );
}
