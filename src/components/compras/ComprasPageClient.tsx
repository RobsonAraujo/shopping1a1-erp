"use client";

import { SupplierPurchaseKanban } from "@/components/compras/SupplierPurchaseKanban";
import type { OperationsBoardCard } from "@/lib/compras/replenishment-cycle-data";
import type { KanbanColumnRow } from "@/hooks/use-kanban-columns";

type ComprasPageClientProps = {
  cards: OperationsBoardCard[];
  initialColumns: KanbanColumnRow[];
  initialBackground: string;
  initialFullscreen: boolean;
};

export function ComprasPageClient({
  cards,
  initialColumns,
  initialBackground,
  initialFullscreen,
}: ComprasPageClientProps) {
  return (
    <SupplierPurchaseKanban
      initialCards={cards}
      initialColumns={initialColumns}
      initialBackground={initialBackground}
      initialFullscreen={initialFullscreen}
    />
  );
}
