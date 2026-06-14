"use client";

import { useCallback, useMemo, useState } from "react";
import { RefreshCw } from "lucide-react";
import {
  ItemListSearch,
  itemListSearchEmptyMessage,
} from "@/components/item-list-search";
import { ReplenishmentKanbanCard } from "@/components/replenishment-kanban-card";
import { Button } from "@/components/ui/button";
import {
  BOARD_COLUMN_STATUSES,
  REPLENISHMENT_STATUS_LABELS,
} from "@/lib/replenishment-cycle";
import type {
  ReplenishmentBoardCard,
  ReplenishmentBoardData,
} from "@/lib/replenishment-cycle-data";
import { filterByItemListSearch } from "@/lib/item-list-search";
import type { ReplenishmentStatus } from "@/generated/prisma/client";
import { cn } from "@/lib/utils";

type ReplenishmentKanbanProps = {
  initialData: ReplenishmentBoardData;
};

export function ReplenishmentKanban({ initialData }: ReplenishmentKanbanProps) {
  const [data, setData] = useState(initialData);
  const [searchQuery, setSearchQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const filteredCards = useMemo(
    () =>
      filterByItemListSearch(data.cards, searchQuery, (card) => ({
        sku: card.sku,
        title: card.title,
        mlItemId: card.mlItemId,
      })),
    [data.cards, searchQuery],
  );

  const cardsByStatus = useMemo(() => {
    const map = new Map<ReplenishmentStatus, ReplenishmentBoardCard[]>();
    for (const status of BOARD_COLUMN_STATUSES) {
      map.set(status, []);
    }
    for (const card of filteredCards) {
      map.get(card.status)?.push(card);
    }
    return map;
  }, [filteredCards]);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/replenishment-cycles", { method: "POST" });
      const json = (await res.json()) as ReplenishmentBoardData | { error?: string };
      if (!res.ok) {
        setError((json as { error?: string }).error ?? "Falha ao sincronizar.");
        return;
      }
      setData(json as ReplenishmentBoardData);
    } catch {
      setError("Falha de rede ao sincronizar.");
    } finally {
      setLoading(false);
    }
  }, []);

  const patchCycle = useCallback(
    async (
      cycleId: string,
      body: { advance?: boolean; skipFull?: boolean; status?: ReplenishmentStatus },
    ) => {
      setBusyId(cycleId);
      setError(null);
      try {
        const res = await fetch(`/api/replenishment-cycles/${cycleId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        const json = (await res.json()) as ReplenishmentBoardData & {
          error?: string;
        };
        if (!res.ok) {
          setError(json.error ?? "Não foi possível atualizar o card.");
          return;
        }
        setData({
          cards: json.cards,
          summary: json.summary,
        });
      } catch {
        setError("Falha de rede ao atualizar card.");
      } finally {
        setBusyId(null);
      }
    },
    [],
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <ItemListSearch
          value={searchQuery}
          onChange={setSearchQuery}
          filteredCount={filteredCards.length}
          totalCount={data.cards.length}
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

      {error ? (
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-900">
          {error}
        </p>
      ) : null}

      {data.cards.length > 0 && filteredCards.length === 0 ? (
        <p className="text-sm text-[var(--muted-foreground)]">
          {itemListSearchEmptyMessage(searchQuery)}
        </p>
      ) : null}

      <div className="flex gap-3 overflow-x-auto pb-2">
        {BOARD_COLUMN_STATUSES.map((status) => {
          const columnCards = cardsByStatus.get(status) ?? [];
          return (
            <section
              key={status}
              className="flex w-72 shrink-0 flex-col rounded-xl border border-[var(--border)] bg-[var(--muted)]/15"
            >
              <header className="border-b border-[var(--border)] px-3 py-2.5">
                <div className="flex items-center justify-between gap-2">
                  <h2 className="text-sm font-semibold">
                    {REPLENISHMENT_STATUS_LABELS[status]}
                  </h2>
                  <span className="rounded-full bg-[var(--muted)] px-2 py-0.5 text-xs tabular-nums">
                    {columnCards.length}
                  </span>
                </div>
              </header>
              <div className="flex flex-1 flex-col gap-2 p-2">
                {columnCards.length === 0 ? (
                  <p className="px-1 py-6 text-center text-xs text-[var(--muted-foreground)]">
                    Vazio
                  </p>
                ) : (
                  columnCards.map((card) => (
                    <ReplenishmentKanbanCard
                      key={card.cycleId}
                      card={card}
                      busy={busyId === card.cycleId}
                      onAdvance={(cycleId, options) =>
                        patchCycle(cycleId, {
                          advance: true,
                          skipFull: options?.skipFull,
                        })
                      }
                      onMove={(cycleId, nextStatus) =>
                        patchCycle(cycleId, { status: nextStatus })
                      }
                    />
                  ))
                )}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}
