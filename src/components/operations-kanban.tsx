"use client";

import { useCallback, useMemo, useState } from "react";
import { RefreshCw } from "lucide-react";
import {
  ItemListSearch,
  itemListSearchEmptyMessage,
} from "@/components/item-list-search";
import { OperationsKanbanBoard } from "@/components/operations-kanban-board";
import { Button } from "@/components/ui/button";
import type {
  OperationsBoardCard,
  OperationsBoardsData,
} from "@/lib/replenishment-cycle-data";
import { filterByItemListSearch } from "@/lib/item-list-search";
import type { OperationCycleKind } from "@/generated/prisma/client";
import { cn } from "@/lib/utils";

type OperationsKanbanProps = {
  initialData: OperationsBoardsData;
};

type OperationsTab = OperationCycleKind;

const TAB_CONFIG: Record<
  OperationsTab,
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

export function OperationsKanban({ initialData }: OperationsKanbanProps) {
  const [data, setData] = useState(initialData);
  const [activeTab, setActiveTab] = useState<OperationsTab>("purchase");
  const [searchQuery, setSearchQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const activeCards =
    activeTab === "purchase" ? data.purchase.cards : data.full.cards;

  const filteredActive = useMemo(
    () => filterCards(activeCards, searchQuery),
    [activeCards, searchQuery],
  );

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/replenishment-cycles", { method: "POST" });
      const json = (await res.json()) as OperationsBoardsData & { error?: string };
      if (!res.ok) {
        setError((json as { error?: string }).error ?? "Falha ao sincronizar.");
        return;
      }
      setData(json as OperationsBoardsData);
    } catch {
      setError("Falha de rede ao sincronizar.");
    } finally {
      setLoading(false);
    }
  }, []);

  const patchCycle = useCallback(
    async (
      cycleId: string,
      body: { advance?: boolean; status?: OperationsBoardCard["status"] },
    ) => {
      setBusyId(cycleId);
      setError(null);
      try {
        const res = await fetch(`/api/replenishment-cycles/${cycleId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        const json = (await res.json()) as OperationsBoardsData & {
          error?: string;
        };
        if (!res.ok) {
          setError(json.error ?? "Não foi possível atualizar o card.");
          return;
        }
        setData({
          purchase: json.purchase,
          full: json.full,
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

  const tabEntries = (["purchase", "full"] as const).map((tab) => ({
    id: tab,
    label: TAB_CONFIG[tab].label,
    count:
      tab === "purchase"
        ? data.purchase.summary.totalActive
        : data.full.summary.totalActive,
  }));

  return (
    <div className="space-y-5">
      <div
        role="tablist"
        aria-label="Tipo de operação"
        className="inline-flex rounded-lg border border-[var(--border)] bg-[var(--muted)]/20 p-1"
      >
        {tabEntries.map((tab) => {
          const selected = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={selected}
              className={cn(
                "inline-flex cursor-pointer items-center gap-2 rounded-md px-4 py-2 text-sm font-medium transition-colors",
                selected
                  ? "bg-[var(--card)] text-[var(--primary)] shadow-sm"
                  : "text-[var(--muted-foreground)] hover:text-[var(--foreground)]",
              )}
              onClick={() => setActiveTab(tab.id)}
            >
              {tab.label}
              <span
                className={cn(
                  "rounded-full px-2 py-0.5 text-xs tabular-nums",
                  selected
                    ? "bg-[var(--muted)] text-[var(--foreground)]"
                    : "bg-[var(--muted)]/60",
                )}
              >
                {tab.count}
              </span>
            </button>
          );
        })}
      </div>

      <p className="max-w-3xl text-sm text-[var(--muted-foreground)]">
        {TAB_CONFIG[activeTab].description}
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

      {error ? (
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-900">
          {error}
        </p>
      ) : null}

      {activeCards.length > 0 && filteredActive.length === 0 ? (
        <p className="text-sm text-[var(--muted-foreground)]">
          {itemListSearchEmptyMessage(searchQuery)}
        </p>
      ) : null}

      <div role="tabpanel">
        <OperationsKanbanBoard
          kind={activeTab}
          cards={filteredActive}
          busyId={busyId}
          onAdvance={(cycleId) => patchCycle(cycleId, { advance: true })}
          onMove={(cycleId, status) => patchCycle(cycleId, { status })}
        />
      </div>
    </div>
  );
}

/** @deprecated Use OperationsKanban */
export const ReplenishmentKanban = OperationsKanban;
