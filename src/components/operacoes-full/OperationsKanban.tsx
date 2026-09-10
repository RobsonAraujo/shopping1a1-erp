"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { RefreshCw } from "lucide-react";
import { DndContext, DragOverlay, type DragEndEvent } from "@dnd-kit/core";
import {
  ItemListSearch,
  itemListSearchEmptyMessage,
} from "@/components/shared/ItemListSearch";
import {
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
  mergeOperationsBoardCards,
  patchOperationsBoardCardsSales,
  summarizeOperationsCounts,
} from "@/lib/compras/replenishment-cycle";
import { filterByItemListSearch } from "@/lib/item-list-search";
import { useDndSensors } from "@/hooks/use-dnd-sensors";
import { useSSEStream } from "@/hooks/use-sse-stream";
import type { OperationCycleKind, ReplenishmentStatus } from "@/generated/prisma/client";
import { cn } from "@/lib/utils";

/** Move o card localmente pra coluna alvo antes da resposta do servidor —
 * sem isso, o card fica "preso" na coluna antiga (desabilitado) até o PATCH
 * voltar, que hoje ainda refaz o sweep pesado do Mercado Livre. */
function applyOptimisticStatus(
  boards: OperationsBoardsData,
  cycleId: string,
  status: ReplenishmentStatus,
): OperationsBoardsData {
  const updateList = (cards: OperationsBoardCard[]) =>
    cards.map((c) => (c.cycleId === cycleId ? { ...c, status } : c));
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

export function OperationsKanban({ initialData, kind }: OperationsKanbanProps) {
  const [data, setData] = useState(initialData);
  const [searchQuery, setSearchQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [activeDragCycleId, setActiveDragCycleId] = useState<string | null>(null);
  const sensors = useDndSensors();

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
    async (cycleId: string, status: ReplenishmentStatus) => {
      // Otimista: move o card na hora, antes da resposta — sem isso ele
      // fica "preso" na coluna antiga (desabilitado) até o PATCH voltar,
      // que hoje ainda refaz o sweep pesado do Mercado Livre. Reverte se a
      // chamada falhar.
      const previousData = data;
      setData((prev) => applyOptimisticStatus(prev, cycleId, status));
      setBusyId(cycleId);
      setError(null);
      try {
        const res = await fetch(`/api/replenishment-cycles/${cycleId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status }),
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

  function handleDragEnd(event: DragEndEvent) {
    setActiveDragCycleId(null);
    const cycleId = String(event.active.id).replace(OPERATIONS_DRAG_ID_PREFIX, "");
    const overId = event.over?.id ? String(event.over.id) : null;
    if (!overId) return;
    const targetStatus = overId.replace(
      OPERATIONS_COLUMN_DROP_ID_PREFIX,
      "",
    ) as ReplenishmentStatus;
    const card = activeCards.find((c) => c.cycleId === cycleId);
    if (!card || card.status === targetStatus) return;
    void patchCycle(cycleId, targetStatus);
  }

  const config = KIND_CONFIG[kind];

  return (
    <DndContext
      sensors={sensors}
      autoScroll={false}
      onDragStart={(event) =>
        setActiveDragCycleId(String(event.active.id).replace(OPERATIONS_DRAG_ID_PREFIX, ""))
      }
      onDragEnd={handleDragEnd}
      onDragCancel={() => setActiveDragCycleId(null)}
    >
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-base font-semibold text-[var(--foreground)]">
          {config.label}
        </h2>
        <span className="rounded-full bg-[var(--muted)] px-2 py-0.5 text-xs tabular-nums text-[var(--foreground)]">
          {activeCount}
        </span>
      </div>

      <p className="max-w-3xl text-sm text-[var(--muted-foreground)]">
        {config.description}
      </p>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <ItemListSearch
          value={searchQuery}
          onChange={setSearchQuery}
          filteredCount={filteredActive.length}
          totalCount={activeCards.length}
          placeholder="Buscar por SKU, título ou MLB…"
        />
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="gap-2"
          disabled={loading}
          onClick={() => void refresh()}
        >
          <RefreshCw
            className={cn("size-4", loading && "animate-spin")}
            aria-hidden
          />
          Sincronizar
        </Button>
      </div>

      {error ? <UserFeedback>{error}</UserFeedback> : null}

      {activeCards.length > 0 && filteredActive.length === 0 ? (
        <p className="text-sm text-[var(--muted-foreground)]">
          {itemListSearchEmptyMessage(searchQuery)}
        </p>
      ) : null}

      <OperationsKanbanBoard
        kind={kind}
        cards={filteredActive}
        busyId={busyId}
      />
    </div>
      <DragOverlay>
        {activeDragCard ? (
          <OperationsCardBody card={activeDragCard} className="w-[85vw] sm:w-72" />
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}

/** @deprecated Use OperationsKanban */
export const ReplenishmentKanban = OperationsKanban;
