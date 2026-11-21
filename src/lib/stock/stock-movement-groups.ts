import type { StockMovementType } from "@/generated/prisma";

/** Grupos do filtro "Tipo" do extrato (compartilhado entre a página e o cliente). */
export const MOVEMENT_GROUPS: Record<
  "all" | "sales" | "entries" | "full" | "adjustments" | "returns" | "opening",
  { label: string; types: StockMovementType[] }
> = {
  all: { label: "Todos os tipos", types: [] },
  sales: { label: "Vendas e cancelamentos", types: ["sale", "sale_reversal"] },
  entries: { label: "Entradas", types: ["entry", "entry_reversal"] },
  full: { label: "Envios e retiradas do Full", types: ["full_transfer", "full_return"] },
  adjustments: { label: "Ajustes e saídas manuais", types: ["adjustment", "manual_out", "inventory_count"] },
  returns: { label: "Devoluções", types: ["return_in"] },
  opening: { label: "Saldo inicial", types: ["opening"] },
};
export type MovementGroup = keyof typeof MOVEMENT_GROUPS;
