import type {
  OrderSearchOrder,
  OrderSearchOrderItem,
} from "@/lib/mercadolibre/types";

/** Vendas pagas de um anúncio somadas no período (base da Lucratividade por data). */
export type PeriodSaleAgg = {
  itemId: string;
  quantity: number;
  revenue: number;
  /** Soma da tarifa ML cobrada (já × unidades) das linhas que trouxeram `sale_fee`. */
  saleFeeSum: number;
  /** Unidades cobertas por `saleFeeSum` — divisor da tarifa média por unidade. */
  saleFeeKnownQty: number;
};

export function quantityFromOrderLine(line: { quantity?: unknown }): number {
  const q = line.quantity;
  if (typeof q === "number" && Number.isFinite(q)) return Math.max(0, q);
  if (typeof q === "string") {
    const n = parseInt(q, 10);
    return Number.isFinite(n) ? Math.max(0, n) : 0;
  }
  return 0;
}

export function revenueFromOrderLine(line: {
  quantity?: unknown;
  unit_price?: unknown;
}): number {
  const qty = quantityFromOrderLine(line);
  const price = line.unit_price;
  if (typeof price !== "number" || !Number.isFinite(price) || price < 0) {
    return 0;
  }
  return price * qty;
}

/**
 * Tarifa ML **por unidade** da linha do pedido. Conferido com pedidos reais
 * (out/2026): numa linha com 3 un. a R$ 29,85, `sale_fee` = 3,58, igual à
 * tarifa do anúncio em 1 un. — por isso o total da linha é `sale_fee × qtd`.
 */
export function saleFeePerUnitFromOrderLine(line: {
  sale_fee?: unknown;
}): number | null {
  const fee = line.sale_fee;
  if (typeof fee === "number" && Number.isFinite(fee) && fee >= 0) {
    return fee;
  }
  return null;
}

export function listingIdFromOrderLine(
  line: Pick<OrderSearchOrderItem, "item" | "item_id">,
): string | undefined {
  return line.item?.id ?? line.item_id ?? undefined;
}

export function aggregatePeriodSalesByItem(
  orders: OrderSearchOrder[],
): Map<string, PeriodSaleAgg> {
  const byItem = new Map<string, PeriodSaleAgg>();

  for (const order of orders) {
    if (order.status === "cancelled") continue;
    for (const line of order.order_items ?? []) {
      const itemId = listingIdFromOrderLine(line);
      if (!itemId) continue;
      const quantity = quantityFromOrderLine(line);
      const revenue = revenueFromOrderLine(line);
      if (quantity <= 0 && revenue <= 0) continue;

      const existing = byItem.get(itemId) ?? {
        itemId,
        quantity: 0,
        revenue: 0,
        saleFeeSum: 0,
        saleFeeKnownQty: 0,
      };
      existing.quantity += quantity;
      existing.revenue += revenue;

      const saleFee = saleFeePerUnitFromOrderLine(line);
      if (saleFee !== null && quantity > 0) {
        existing.saleFeeSum += saleFee * quantity;
        existing.saleFeeKnownQty += quantity;
      }

      byItem.set(itemId, existing);
    }
  }

  return byItem;
}
