"use client";

import type { OperationCycleKind } from "@/generated/prisma/client";
import { OperationsKanbanCard } from "@/components/operacoes-full/operations-kanban-card";
import {
  boardColumnsForKind,
  statusLabelsForKind,
} from "@/lib/replenishment-cycle";
import type { OperationsBoardCard } from "@/lib/replenishment-cycle-data";
import type { ReplenishmentStatus } from "@/generated/prisma/client";

type OperationsKanbanBoardProps = {
  kind: OperationCycleKind;
  cards: OperationsBoardCard[];
  busyId: string | null;
  onAdvance: (cycleId: string) => void | Promise<void>;
  onMove: (
    cycleId: string,
    status: ReplenishmentStatus,
  ) => void | Promise<void>;
  title?: string;
  description?: string;
};

export function OperationsKanbanBoard({
  title,
  description,
  kind,
  cards,
  busyId,
  onAdvance,
  onMove,
}: OperationsKanbanBoardProps) {
  const columns = boardColumnsForKind(kind);
  const labels = statusLabelsForKind(kind);

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
          return (
            <section
              key={status}
              className="flex w-[85vw] shrink-0 snap-center flex-col rounded-xl border border-[var(--border)] bg-[var(--muted)]/15 sm:w-72 sm:snap-align-none"
            >
              <header className="border-b border-[var(--border)] px-3 py-2.5">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="text-sm font-semibold">{labels[status]}</h3>
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
                    <OperationsKanbanCard
                      key={card.cycleId}
                      card={card}
                      busy={busyId === card.cycleId}
                      onAdvance={() => void onAdvance(card.cycleId)}
                      onMove={(nextStatus) =>
                        void onMove(card.cycleId, nextStatus)
                      }
                    />
                  ))
                )}
              </div>
            </section>
          );
        })}
      </div>
    </section>
  );
}
