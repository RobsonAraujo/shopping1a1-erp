"use client";

import { SupplierPurchaseKanban } from "@/components/compras/SupplierPurchaseKanban";
import type { OperationsBoardCard } from "@/lib/compras/replenishment-cycle-data";
import type { KanbanColumnRow } from "@/hooks/use-kanban-columns";

type ComprasPageClientProps = {
  cards: OperationsBoardCard[];
  initialColumns: KanbanColumnRow[];
  initialBackground: string;
};

export function ComprasPageClient({
  cards,
  initialColumns,
  initialBackground,
}: ComprasPageClientProps) {
  return (
    <SupplierPurchaseKanban
      initialCards={cards}
      initialColumns={initialColumns}
      initialBackground={initialBackground}
    />
  );
}
