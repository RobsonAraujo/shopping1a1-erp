"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Maximize2, RefreshCw } from "lucide-react";
import { DndContext, DragOverlay, type DragEndEvent } from "@dnd-kit/core";
import { arrayMove } from "@dnd-kit/sortable";
import {
  ItemListSearch,
  itemListSearchEmptyMessage,
} from "@/components/shared/ItemListSearch";
import {
  COLUMN_DRAG_ID_PREFIX,
  OPERATIONS_COLUMN_DROP_ID_PREFIX,
  OperationsKanbanBoard,
} from "@/components/operacoes-full/OperationsKanbanBoard";
import {
  OPERATIONS_DRAG_ID_PREFIX,
  OperationsCardBody,
} from "@/components/operacoes-full/OperationsKanbanCard";
import { Button } from "@/components/ui/button";
import { UserFeedback } from "@/components/ui/user-feedback";
import type {
  OperationsBoardCard,
  OperationsBoardsData,
  OperationsCardSalesPatch,
} from "@/lib/compras/replenishment-cycle-data";
import {
  finalStatusForKind,
  mergeOperationsBoardCards,
  patchOperationsBoardCardsSales,
  summarizeOperationsCounts,
} from "@/lib/compras/replenishment-cycle";
import { filterByItemListSearch } from "@/lib/item-list-search";
import { useDndSensors } from "@/hooks/use-dnd-sensors";
import { useSSEStream } from "@/hooks/use-sse-stream";
import { useKanbanBoard, type KanbanColumnRow } from "@/hooks/use-kanban-columns";
import { KanbanBackgroundPicker } from "@/components/kanban/KanbanBackgroundPicker";
import { KanbanAppearancePicker } from "@/components/kanban/KanbanAppearancePicker";
import { KanbanFullscreenFrame } from "@/components/kanban/KanbanFullscreenFrame";
import type { OperationCycleKind } from "@/generated/prisma/client";
import { cn } from "@/lib/utils";

/** Move o card localmente pra coluna alvo antes da resposta do servidor —
 * sem isso, o card fica "preso" na coluna antiga (desabilitado) até o PATCH
 * voltar, que hoje ainda refaz o sweep pesado do Mercado Livre. `status`
 * também é recalculado aqui (mesma regra do servidor: só a última coluna
 * travada do kind vira o status final, qualquer outra vira "attention") —
 * sem isso os contadores/badge Urgente ficariam 1 round-trip atrasados. */
function applyOptimisticColumn(
  boards: OperationsBoardsData,
  cycleId: string,
  targetColumn: KanbanColumnRow,
  isFinalColumn: boolean,
): OperationsBoardsData {
  const updateList = (cards: OperationsBoardCard[]) =>
    cards.map((c) =>
      c.cycleId === cycleId
        ? {
            ...c,
            columnId: targetColumn.id,
            columnLabel: targetColumn.label,
            columnPosition: targetColumn.position,
            status: isFinalColumn ? finalStatusForKind(c.kind) : "attention",
          }
        : c,
    );
  const purchaseCards = updateList(boards.purchase.cards);
  const fullCards = updateList(boards.full.cards);
  const summary = summarizeOperationsCounts([
    ...purchaseCards.map((c) => ({ kind: c.kind, status: c.status })),
    ...fullCards.map((c) => ({ kind: c.kind, status: c.status })),
  ]);
  return {
    purchase: { cards: purchaseCards, summary: summary.purchase },
    full: { cards: fullCards, summary: summary.full },
    summary,
  };
}

/** Substitui só os cards do board `kind` (o outro lado do `OperationsBoardsData`
 * nunca é tocado por este componente — cada página só sincroniza o `kind`
 * que exibe) e recomputa os dois resumos a partir daí. */
function withKindCards(
  boards: OperationsBoardsData,
  kind: OperationCycleKind,
  cards: OperationsBoardCard[],
): OperationsBoardsData {
  const purchaseCards = kind === "purchase" ? cards : boards.purchase.cards;
  const fullCards = kind === "full" ? cards : boards.full.cards;
  const summary = summarizeOperationsCounts([
    ...purchaseCards.map((c) => ({ kind: c.kind, status: c.status })),
    ...fullCards.map((c) => ({ kind: c.kind, status: c.status })),
  ]);
  return {
    purchase: { cards: purchaseCards, summary: summary.purchase },
    full: { cards: fullCards, summary: summary.full },
    summary,
  };
}

type ResyncStreamEvent =
  | ({ type: "card-patch"; mlItemId: string } & OperationsCardSalesPatch)
  | { type: "done"; cards: OperationsBoardCard[] }
  | { type: "error"; message: string };

type OperationsKanbanProps = {
  initialData: OperationsBoardsData;
  /** Board único — sem abas internas. */
  kind: OperationCycleKind;
  /** Colunas + cor de fundo + preferência de tela cheia já carregadas no
   * servidor — evita o "piscar" de buscar isso num `useEffect` depois de
   * montar (ver `useKanbanBoard`). */
  initialColumns: KanbanColumnRow[];
  initialBackground: string;
  initialFullscreen: boolean;
};

const KIND_CONFIG: Record<
  OperationCycleKind,
  { label: string; description: string }
> = {
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

function filterCards(
  cards: OperationsBoardCard[],
  searchQuery: string,
): OperationsBoardCard[] {
  return filterByItemListSearch(cards, searchQuery, (card) => ({
    sku: card.sku,
    title: card.title,
    mlItemId: card.mlItemId,
  }));
}

export function OperationsKanban({
  initialData,
  kind,
  initialColumns,
  initialBackground,
  initialFullscreen,
}: OperationsKanbanProps) {
  const [data, setData] = useState(initialData);
  const [searchQuery, setSearchQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [activeDragCycleId, setActiveDragCycleId] = useState<string | null>(null);
  const [activeDragColumnId, setActiveDragColumnId] = useState<string | null>(null);
  const sensors = useDndSensors();
  const {
    columns,
    background,
    isFullscreen,
    rename: renameColumn,
    addColumn,
    removeColumn,
    reorder: reorderColumns,
    toggleCollapse,
    setBackground,
    setFullscreen,
  } = useKanbanBoard(kind, {
    columns: initialColumns,
    background: initialBackground,
    isFullscreen: initialFullscreen,
  });

  const activeCards =
    kind === "purchase" ? data.purchase.cards : data.full.cards;
  const activeCount =
    kind === "purchase"
      ? data.purchase.summary.totalActive
      : data.full.summary.totalActive;

  const filteredActive = useMemo(
    () => filterCards(activeCards, searchQuery),
    [activeCards, searchQuery],
  );

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/replenishment-cycles?kind=${kind}`, {
        method: "POST",
      });
      const json = (await res.json()) as OperationsBoardsData & { error?: string };
      if (!res.ok) {
        setError((json as { error?: string }).error ?? "Falha ao sincronizar.");
        return;
      }
      const incomingCards = kind === "purchase" ? json.purchase.cards : json.full.cards;
      setData((prev) => {
        const currentCards = kind === "purchase" ? prev.purchase.cards : prev.full.cards;
        return withKindCards(
          prev,
          kind,
          mergeOperationsBoardCards(currentCards, incomingCards),
        );
      });
    } catch {
      setError("Falha de rede ao sincronizar.");
    } finally {
      setLoading(false);
    }
  }, [kind]);

  const patchCycle = useCallback(
    async (cycleId: string, targetColumn: KanbanColumnRow, isFinalColumn: boolean) => {
      // Otimista: move o card na hora, antes da resposta — sem isso ele
      // fica "preso" na coluna antiga (desabilitado) até o PATCH voltar,
      // que hoje ainda refaz o sweep pesado do Mercado Livre. Reverte se a
      // chamada falhar.
      const previousData = data;
      setData((prev) => applyOptimisticColumn(prev, cycleId, targetColumn, isFinalColumn));
      setBusyId(cycleId);
      setError(null);
      try {
        const res = await fetch(`/api/replenishment-cycles/${cycleId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ columnId: targetColumn.id }),
        });
        const json = (await res.json()) as OperationsBoardsData & {
          error?: string;
        };
        if (!res.ok) {
          setError(json.error ?? "Não foi possível atualizar o card.");
          setData(previousData);
          return;
        }
        // Merge (não replace): a resposta do PATCH é `loadOperationsBoards`
        // completo (mesmo `kind`) — se um resync em streaming também
        // estiver em voo, o card recém-confirmado aqui (updatedAt mais
        // novo) não pode ser revertido por um snapshot do stream que
        // começou antes deste PATCH terminar.
        const incomingCards = kind === "purchase" ? json.purchase.cards : json.full.cards;
        setData((prev) => {
          const currentCards = kind === "purchase" ? prev.purchase.cards : prev.full.cards;
          return withKindCards(
            prev,
            kind,
            mergeOperationsBoardCards(currentCards, incomingCards),
          );
        });
      } catch {
        setError("Falha de rede ao atualizar card.");
        setData(previousData);
      } finally {
        setBusyId(null);
      }
    },
    [data, kind],
  );

  // Resync em background: o board já pintou com o que estava no banco
  // (fast path do server component) — este stream busca a venda de
  // verdade no Mercado Livre e vai destravando os campos borrados
  // (`salesPending`) card a card, sem travar a tela. Também pode fazer
  // cards novos aparecerem/desaparecerem no evento final (`done`).
  const resyncStream = useSSEStream<ResyncStreamEvent>(
    useCallback(
      (event) => {
        if (event.type === "card-patch") {
          const { mlItemId, ...patch } = event;
          setData((prev) => {
            const currentCards = kind === "purchase" ? prev.purchase.cards : prev.full.cards;
            return withKindCards(
              prev,
              kind,
              patchOperationsBoardCardsSales(currentCards, mlItemId, patch),
            );
          });
        } else if (event.type === "done") {
          setData((prev) => {
            const currentCards = kind === "purchase" ? prev.purchase.cards : prev.full.cards;
            return withKindCards(
              prev,
              kind,
              mergeOperationsBoardCards(currentCards, event.cards),
            );
          });
        } else if (event.type === "error") {
          setError(event.message);
        }
      },
      [kind],
    ),
  );

  useEffect(() => {
    const controller = new AbortController();
    void resyncStream.start("/api/replenishment-cycles/resync-stream", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kind }),
      signal: controller.signal,
    });
    return () => controller.abort();
    // Dispara 1x ao montar (e de novo se `kind` mudar, o que não acontece
    // hoje — cada página monta um `OperationsKanban` com `kind` fixo).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kind]);

  const activeDragCard = activeDragCycleId
    ? activeCards.find((card) => card.cycleId === activeDragCycleId)
    : undefined;
  const activeDragColumn = activeDragColumnId
    ? columns.find((c) => c.id === activeDragColumnId)
    : undefined;

  function handleDragStart(id: string) {
    if (id.startsWith(OPERATIONS_DRAG_ID_PREFIX)) {
      setActiveDragCycleId(id.replace(OPERATIONS_DRAG_ID_PREFIX, ""));
    } else if (id.startsWith(COLUMN_DRAG_ID_PREFIX)) {
      setActiveDragColumnId(id.replace(COLUMN_DRAG_ID_PREFIX, ""));
    }
  }

  function handleDragEnd(event: DragEndEvent) {
    setActiveDragCycleId(null);
    setActiveDragColumnId(null);
    const activeId = String(event.active.id);
    const overId = event.over?.id ? String(event.over.id) : null;
    if (!overId) return;

    if (activeId.startsWith(COLUMN_DRAG_ID_PREFIX)) {
      // Reordenar colunas: só as do meio (não travadas) participam do
      // SortableContext — a primeira e a última nunca mudam de posição.
      if (!overId.startsWith(COLUMN_DRAG_ID_PREFIX)) return;
      const draggedId = activeId.replace(COLUMN_DRAG_ID_PREFIX, "");
      const targetId = overId.replace(COLUMN_DRAG_ID_PREFIX, "");
      if (draggedId === targetId) return;
      const sorted = [...columns].sort((a, b) => a.position - b.position);
      const locked = sorted.filter((c) => c.isLocked);
      const middle = sorted.filter((c) => !c.isLocked);
      const fromIndex = middle.findIndex((c) => c.id === draggedId);
      const toIndex = middle.findIndex((c) => c.id === targetId);
      if (fromIndex === -1 || toIndex === -1) return;
      const reordered = arrayMove(middle, fromIndex, toIndex);
      const first = locked.find((c) => c.position === 0);
      const last = locked.find((c) => c.position === sorted.length - 1);
      const fullOrder = [
        ...(first ? [first.id] : []),
        ...reordered.map((c) => c.id),
        ...(last ? [last.id] : []),
      ];
      void reorderColumns(fullOrder);
      return;
    }

    const cycleId = activeId.replace(OPERATIONS_DRAG_ID_PREFIX, "");
    const targetColumnId = overId.replace(OPERATIONS_COLUMN_DROP_ID_PREFIX, "");
    const card = activeCards.find((c) => c.cycleId === cycleId);
    const targetColumn = columns.find((c) => c.id === targetColumnId);
    if (!card || !targetColumn || card.columnId === targetColumn.id) return;
    const sorted = [...columns].sort((a, b) => a.position - b.position);
    const isFinalColumn = targetColumn.id === sorted[sorted.length - 1]?.id;
    void patchCycle(cycleId, targetColumn, isFinalColumn);
  }

  const config = KIND_CONFIG[kind];

  const exitFullscreen = useCallback(() => {
    void setFullscreen(false);
  }, [setFullscreen]);

  return (
    <DndContext
      sensors={sensors}
      autoScroll={false}
      onDragStart={(event) => handleDragStart(String(event.active.id))}
      onDragEnd={handleDragEnd}
      onDragCancel={() => {
        setActiveDragCycleId(null);
        setActiveDragColumnId(null);
      }}
    >
    <KanbanFullscreenFrame
      active={isFullscreen}
      title={config.label}
      count={activeCount}
      background={background}
      onExit={exitFullscreen}
    >
    <div className={cn("flex min-h-0 flex-col gap-3 sm:gap-5", isFullscreen && "h-full max-sm:overflow-hidden")}>
      <div className={cn("flex shrink-0 flex-col gap-3 sm:gap-5", isFullscreen && "px-3 pt-3 sm:px-4")}>
        {!isFullscreen ? (
          <div className="hidden sm:block">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-base font-semibold text-[var(--foreground)]">
                {config.label}
              </h2>
              <span className="rounded-full bg-[var(--muted)] px-2 py-0.5 text-xs tabular-nums text-[var(--foreground)]">
                {activeCount}
              </span>
            </div>

            <p className="mt-1 max-w-3xl text-sm text-[var(--muted-foreground)]">
              {config.description}
            </p>
          </div>
        ) : null}

        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between sm:gap-3">
          <ItemListSearch
            className="max-sm:w-full"
            value={searchQuery}
            onChange={setSearchQuery}
            filteredCount={filteredActive.length}
            totalCount={activeCards.length}
            placeholder="Buscar por SKU, título ou MLB…"
          />
          <div className="flex shrink-0 items-center gap-1.5 overflow-x-auto sm:gap-2">
            <KanbanBackgroundPicker background={background} onChange={setBackground} />
            <KanbanAppearancePicker kind={kind} />
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="gap-2 max-sm:size-9 max-sm:px-0"
              disabled={loading}
              onClick={() => void refresh()}
              aria-label="Sincronizar"
            >
              <RefreshCw
                className={cn("size-4", loading && "animate-spin")}
                aria-hidden
              />
              <span className="hidden sm:inline">Sincronizar</span>
            </Button>
            {!isFullscreen ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="gap-2 max-sm:size-9 max-sm:px-0"
                onClick={() => void setFullscreen(true)}
                aria-label="Tela cheia"
              >
                <Maximize2 className="size-4" aria-hidden />
                <span className="hidden sm:inline">Tela cheia</span>
              </Button>
            ) : null}
          </div>
        </div>

        {error ? <UserFeedback>{error}</UserFeedback> : null}

        {activeCards.length > 0 && filteredActive.length === 0 ? (
          <p className="text-sm text-[var(--muted-foreground)]">
            {itemListSearchEmptyMessage(searchQuery)}
          </p>
        ) : null}
      </div>

      <OperationsKanbanBoard
        cards={filteredActive}
        busyId={busyId}
        columns={columns}
        onRenameColumn={renameColumn}
        onAddColumn={addColumn}
        onDeleteColumn={removeColumn}
        onToggleCollapse={toggleCollapse}
        kind={kind}
        background={background}
        fullHeight={isFullscreen}
      />
    </div>
    </KanbanFullscreenFrame>
      <DragOverlay>
        {activeDragCard ? (
          <OperationsCardBody card={activeDragCard} className="w-[calc(100vw-2.75rem)] sm:w-72" />
        ) : activeDragColumn ? (
          <div className="w-56 rounded-xl border border-[var(--border)] bg-[var(--card)] px-3 py-2.5 text-sm font-semibold shadow-md">
            {activeDragColumn.label}
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}

/** @deprecated Use OperationsKanban */
export const ReplenishmentKanban = OperationsKanban;
