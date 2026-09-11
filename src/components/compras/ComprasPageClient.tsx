"use client";

import { SupplierPurchaseKanban } from "@/components/compras/SupplierPurchaseKanban";
import type { OperationsBoardCard } from "@/lib/compras/replenishment-cycle-data";
import type { KanbanColumnRow } from "@/hooks/use-kanban-columns";
import type { KanbanAppearance } from "@/lib/kanban/kanban-column-colors";

type ComprasPageClientProps = {
  cards: OperationsBoardCard[];
  initialColumns: KanbanColumnRow[];
  initialBackground: string;
  initialFullscreen: boolean;
  initialAppearance: KanbanAppearance;
};

export function ComprasPageClient({
  cards,
  initialColumns,
  initialBackground,
  initialFullscreen,
  initialAppearance,
}: ComprasPageClientProps) {
  return (
    <SupplierPurchaseKanban
      initialCards={cards}
      initialColumns={initialColumns}
      initialBackground={initialBackground}
      initialFullscreen={initialFullscreen}
      initialAppearance={initialAppearance}
    />
  );
}
