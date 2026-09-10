"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import type { OperationCycleKind } from "@/generated/prisma/client";
import { OperationsKanbanCard } from "@/components/operacoes-full/OperationsKanbanCard";
import {
  boardColumnsForKind,
  statusLabelsForKind,
} from "@/lib/compras/replenishment-cycle";
import type { OperationsBoardCard } from "@/lib/compras/replenishment-cycle-data";
import { useDropHighlight } from "@/hooks/use-drop-highlight";
import { useCollapsedKanbanColumns } from "@/hooks/use-collapsed-kanban-columns";
import type { ReplenishmentStatus } from "@/generated/prisma/client";
import { cn } from "@/lib/utils";

export const OPERATIONS_COLUMN_DROP_ID_PREFIX = "column:";

type OperationsKanbanBoardProps = {
  kind: OperationCycleKind;
  cards: OperationsBoardCard[];
  busyId: string | null;
  title?: string;
  description?: string;
};

function DroppableColumn({
  status,
  collapsed,
  children,
}: {
  status: ReplenishmentStatus;
  collapsed: boolean;
  children: React.ReactNode;
}) {
  const { setNodeRef, className } = useDropHighlight(
    `${OPERATIONS_COLUMN_DROP_ID_PREFIX}${status}`,
  );
  return (
    <section
      ref={setNodeRef}
      className={cn(
        "flex shrink-0 snap-center flex-col rounded-xl border border-[var(--border)] bg-[var(--muted)]/15 sm:snap-align-none",
        collapsed ? "w-10 sm:w-10" : "w-[85vw] sm:w-72",
        className,
      )}
    >
      {children}
    </section>
  );
}

export function OperationsKanbanBoard({
  title,
  description,
  kind,
  cards,
  busyId,
}: OperationsKanbanBoardProps) {
  const columns = boardColumnsForKind(kind);
  const labels = statusLabelsForKind(kind);
  const { collapsed, toggle } = useCollapsedKanbanColumns(kind);

  const cardsByStatus = new Map<ReplenishmentStatus, OperationsBoardCard[]>();
  for (const status of columns) {
    cardsByStatus.set(status, []);
  }
  for (const card of cards) {
    cardsByStatus.get(card.status)?.push(card);
  }

  return (
    <section className="space-y-3">
      {title ? (
        <div>
          <h2 className="text-xl font-semibold text-[var(--primary)]">{title}</h2>
          {description ? (
            <p className="mt-1 max-w-3xl text-sm text-[var(--muted-foreground)]">
              {description}
            </p>
          ) : null}
        </div>
      ) : null}

      <div className="flex snap-x snap-mandatory gap-3 overflow-x-auto pb-2 sm:snap-none">
        {columns.map((status) => {
          const columnCards = cardsByStatus.get(status) ?? [];
          const isCollapsed = collapsed.has(status);
          return (
            <DroppableColumn key={status} status={status} collapsed={isCollapsed}>
              {isCollapsed ? (
                <button
                  type="button"
                  onClick={() => toggle(status)}
                  aria-label={`Expandir coluna ${labels[status]}`}
                  className="flex h-full min-h-40 flex-1 flex-col items-center justify-between gap-2 py-3 text-[var(--muted-foreground)] transition-colors hover:text-[var(--foreground)]"
                >
                  <ChevronRight className="size-4 shrink-0" aria-hidden />
                  <span className="flex-1 text-sm font-semibold [writing-mode:vertical-rl]">
                    {labels[status]}
                  </span>
                  <span className="rounded-full bg-[var(--muted)] px-1.5 py-0.5 text-xs tabular-nums">
                    {columnCards.length}
                  </span>
                </button>
              ) : (
                <>
                  <header className="border-b border-[var(--border)] px-3 py-2.5">
                    <div className="flex items-center justify-between gap-2">
                      <h3 className="text-sm font-semibold">{labels[status]}</h3>
                      <div className="flex items-center gap-1.5">
                        <span className="rounded-full bg-[var(--muted)] px-2 py-0.5 text-xs tabular-nums">
                          {columnCards.length}
                        </span>
                        <button
                          type="button"
                          onClick={() => toggle(status)}
                          aria-label={`Recolher coluna ${labels[status]}`}
                          className="text-[var(--muted-foreground)] transition-colors hover:text-[var(--foreground)]"
                        >
                          <ChevronLeft className="size-4" aria-hidden />
                        </button>
                      </div>
                    </div>
                  </header>
                  <div className="flex flex-1 flex-col gap-2 p-2">
                    {columnCards.length === 0 ? (
                      <p className="px-1 py-6 text-center text-xs text-[var(--muted-foreground)]">
                        Vazio
                      </p>
                    ) : (
                      columnCards.map((card) => (
                        <OperationsKanbanCard
                          key={card.cycleId}
                          card={card}
                          busy={busyId === card.cycleId}
                        />
                      ))
                    )}
                  </div>
                </>
              )}
            </DroppableColumn>
          );
        })}
      </div>
    </section>
  );
}
