import type { OrderSearchOrder } from "@/lib/mercadolibre/types";

/**
 * Canal da venda. `b2b` = comprador empresa: o ML marca o pedido com a tag
 * `b2b` e o fluxo `b2b` (sempre juntos nos pedidos reais de nov/2026); é o
 * canal do preço por quantidade (`price_per_quantity`, que nunca apareceu sem
 * `b2b`). Todo o resto é varejo.
 */
export type OrderChannel = "retail" | "b2b";

export function orderChannel(
  order: Pick<OrderSearchOrder, "tags" | "context">,
): OrderChannel {
  const tags = order.tags ?? [];
  const flows = order.context?.flows ?? [];
  return tags.includes("b2b") || flows.includes("b2b") ? "b2b" : "retail";
}
