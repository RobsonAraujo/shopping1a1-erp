"use client";

import { SupplierPurchaseKanban } from "@/components/compras/SupplierPurchaseKanban";
import type { OperationsBoardCard } from "@/lib/compras/replenishment-cycle-data";

type ComprasPageClientProps = {
  cards: OperationsBoardCard[];
};

export function ComprasPageClient({ cards }: ComprasPageClientProps) {
  return <SupplierPurchaseKanban initialCards={cards} />;
}
