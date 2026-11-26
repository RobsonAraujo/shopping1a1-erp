import { orderChannel } from "@/lib/mercadolibre/order-channel";
import type {
  OrderSearchOrder,
  OrderSearchOrderItem,
} from "@/lib/mercadolibre/types";
import {
  createSalesMixAccumulator,
  type SalesMixEntry,
} from "@/lib/lucratividade/sales-mix";

/** Vendas pagas de um anúncio somadas no período (base da Lucratividade por data). */
export type PeriodSaleAgg = {
  itemId: string;
  quantity: number;
  revenue: number;
  /** Soma da tarifa ML cobrada (já × unidades) das linhas que trouxeram `sale_fee`. */
  saleFeeSum: number;
  /** Unidades cobertas por `saleFeeSum` — divisor da tarifa média por unidade. */
  saleFeeKnownQty: number;
  /** Unidades enviadas pelo Flex: entram sem frete na margem (o bônus de
   * envio do ML paga a entrega). */
  flexUnits: number;
  /** As mesmas vendas por canal (varejo/B2B) × tipo de anúncio do pedido —
   * sem a forma de envio (essa só no painel, sob demanda); cada entrada
   * traz as suas unidades Flex. */
  mix: SalesMixEntry[];
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

/** `unit_price` válido da linha, ou `null`. */
export function unitPriceFromOrderLine(line: { unit_price?: unknown }): number | null {
  const price = line.unit_price;
  return typeof price === "number" && Number.isFinite(price) && price >= 0
    ? price
    : null;
}

export function aggregatePeriodSalesByItem(
  orders: OrderSearchOrder[],
  /** Envios (`shipping.id`) que foram Flex — ver `loadFlexShipmentIds`. */
  flexShipmentIds: ReadonlySet<string> = new Set(),
): Map<string, PeriodSaleAgg> {
  const byItem = new Map<string, PeriodSaleAgg>();
  const mixByItem = new Map<string, ReturnType<typeof createSalesMixAccumulator>>();

  for (const order of orders) {
    if (order.status === "cancelled") continue;
    const channel = orderChannel(order);
    const isFlex =
      order.shipping?.id != null && flexShipmentIds.has(String(order.shipping.id));
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
        flexUnits: 0,
        mix: [],
      };
      existing.quantity += quantity;
      existing.revenue += revenue;
      if (isFlex) existing.flexUnits += quantity;

      const saleFee = saleFeePerUnitFromOrderLine(line);
      if (saleFee !== null && quantity > 0) {
        existing.saleFeeSum += saleFee * quantity;
        existing.saleFeeKnownQty += quantity;
      }

      byItem.set(itemId, existing);

      const mix = mixByItem.get(itemId) ?? createSalesMixAccumulator();
      mix.add({
        channel,
        listingTypeId: line.listing_type_id ?? null,
        quantity,
        revenue,
        unitPrice: unitPriceFromOrderLine(line),
        saleFeePerUnit: saleFee,
        flexUnits: isFlex ? quantity : 0,
      });
      mixByItem.set(itemId, mix);
    }
  }

  for (const [itemId, agg] of byItem) {
    agg.mix = mixByItem.get(itemId)?.entries() ?? [];
  }

  return byItem;
}
