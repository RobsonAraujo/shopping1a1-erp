"use client";

import {
  PURCHASE_BOARD_COLUMNS,
  PURCHASE_STATUS_LABELS,
} from "@/lib/compras/replenishment-cycle";
import type { SupplierBoardCard } from "@/lib/compras/supplier-board";
import { SupplierPurchaseKanbanCard } from "@/components/compras/SupplierPurchaseKanbanCard";
import { useDropHighlight } from "@/hooks/use-drop-highlight";
import type { ReplenishmentStatus } from "@/generated/prisma/client";
import { cn } from "@/lib/utils";

export const COLUMN_DROP_ID_PREFIX = "column:";

type SupplierPurchaseKanbanBoardProps = {
  cards: SupplierBoardCard[];
  busySupplier: string | null;
};

function DroppableColumn({
  status,
  children,
}: {
  status: ReplenishmentStatus;
  children: React.ReactNode;
}) {
  const { setNodeRef, className } = useDropHighlight(`${COLUMN_DROP_ID_PREFIX}${status}`);
  return (
    <section
      ref={setNodeRef}
      className={cn(
        "flex w-[85vw] shrink-0 snap-center flex-col rounded-xl border border-[var(--border)] bg-[var(--muted)]/15 sm:w-72 sm:snap-align-none",
        className,
      )}
    >
      {children}
    </section>
  );
}

export function SupplierPurchaseKanbanBoard({
  cards,
  busySupplier,
}: SupplierPurchaseKanbanBoardProps) {
  const cardsByStatus = new Map<ReplenishmentStatus, SupplierBoardCard[]>();
  for (const status of PURCHASE_BOARD_COLUMNS) {
    cardsByStatus.set(status, []);
  }
  for (const card of cards) {
    cardsByStatus.get(card.status)?.push(card);
  }

  return (
    <div className="flex snap-x snap-mandatory gap-3 overflow-x-auto pb-2 sm:snap-none">
      {PURCHASE_BOARD_COLUMNS.map((status) => {
        const columnCards = cardsByStatus.get(status) ?? [];
        return (
          <DroppableColumn key={status} status={status}>
            <header className="border-b border-[var(--border)] px-3 py-2.5">
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-sm font-semibold">{PURCHASE_STATUS_LABELS[status]}</h3>
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
                  <SupplierPurchaseKanbanCard
                    key={card.supplier}
                    card={card}
                    busy={busySupplier === card.supplier}
                  />
                ))
              )}
            </div>
          </DroppableColumn>
        );
      })}
    </div>
  );
}
