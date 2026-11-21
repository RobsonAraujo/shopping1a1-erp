import type { OrderSearchOrder } from "@/lib/mercadolibre/types";

/**
 * Lógica pura (sem I/O) do que um pedido do Mercado Livre faz no estoque.
 *
 * Regras:
 * - Só pedidos fechados a partir da ativação contam. O que foi vendido antes
 *   já está no saldo inicial.
 * - Pago (`paid`, `partially_refunded`, `pending_cancel`) → venda.
 *   - Local `own` quando a unidade saiu do depósito do vendedor: o
 *     `order_items[].stock.node_id` é um dos nós do vendedor.
 *   - Local `full` quando saiu de um centro do ML. A venda Full não mexe no
 *     Em casa; existe para auditoria e para o custo por lote.
 * - Cancelado (`cancelled`, `invalid`) → estorno da venda, se o envio não
 *   saiu. Se já saiu, a venda de casa vira "devolução a conferir"; a do
 *   Full é problema do ML.
 * - Pago com sinal forte de devolução (`order_request.return`, tag
 *   `returned`, pagamento estornado) → "devolução a conferir" para o que saiu
 *   de casa. Nunca volta sozinho para o estoque: alguém precisa ver se o
 *   produto voltou bom.
 * - Linha sem item de estoque → pendência "venda sem item". Nunca é
 *   descartada calada.
 */

export type StockLocationValue = "own" | "full";

/** Destino de estoque de um anúncio vendido. */
export type ListingStockTarget =
  | { kind: "item"; stockItemId: string }
  /** Kit: cada componente baixa `quantity` unidades por kit vendido. */
  | { kind: "kit"; components: Array<{ stockItemId: string; quantity: number }> };

export type OrderShipmentInfo = {
  logisticType: string | null;
  status: string | null;
  tags: string[];
};

export type SaleMovementDraft = {
  stockItemId: string;
  location: StockLocationValue;
  /** Unidades que saíram (positivo). A movimentação grava −units. */
  units: number;
  sourceLineKey: string;
  listingMlItemId: string;
  nodeId: string | null;
};

export type UnmappedLineDraft = {
  listingMlItemId: string;
  units: number;
  location: StockLocationValue | null;
  title: string | null;
};

export type OrderStockPlan = {
  orderId: string;
  occurredAt: Date | null;
  phase: "before_activation" | "paid" | "cancelled" | "ignored";
  /** Linhas com item de estoque e local resolvido. */
  sales: SaleMovementDraft[];
  /** Linhas sem item de estoque. */
  unmapped: UnmappedLineDraft[];
  /**
   * Alguma linha não deu para localizar sem o envio (nó ausente ou nós do
   * vendedor ainda desconhecidos). O chamador busca o envio e planeja de novo.
   */
  needsShipment: boolean;
  /** O envio já saiu do vendedor/centro (shipped, delivered, not_delivered). */
  dispatched: boolean | null;
  /** Pedido pago com sinal forte de devolução. */
  returnSignaled: boolean;
};

const PAID_STATUSES = new Set(["paid", "partially_refunded", "pending_cancel"]);
const CANCELLED_STATUSES = new Set(["cancelled", "invalid"]);
/** Envio que já deixou o local de origem. */
const DISPATCHED_SHIPMENT_STATUSES = new Set(["shipped", "delivered", "not_delivered"]);

export function orderOccurredAt(order: OrderSearchOrder): Date | null {
  const raw = order.date_closed || order.date_created;
  if (!raw) return null;
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Sinal forte de devolução num pedido pago — sem a heurística de idade do DRE. */
export function orderSignalsReturn(order: OrderSearchOrder): boolean {
  if (order.order_request?.return) return true;
  if ((order.tags ?? []).map(String).includes("returned")) return true;
  return (order.payments ?? []).some(
    (p) => p.status === "refunded" || p.status === "charged_back",
  );
}

export function shipmentDispatched(shipment: OrderShipmentInfo | null): boolean | null {
  if (!shipment?.status) return null;
  return DISPATCHED_SHIPMENT_STATUSES.has(shipment.status);
}

function lineItemId(line: NonNullable<OrderSearchOrder["order_items"]>[number]): string | null {
  const id = line.item?.id ?? line.item_id;
  return typeof id === "string" && id.trim() ? id.trim() : null;
}

function lineNodeId(line: NonNullable<OrderSearchOrder["order_items"]>[number]): string | null {
  const node = line.stock?.node_id;
  return typeof node === "string" && node.trim() ? node.trim() : null;
}

/**
 * Local de onde a linha saiu. O nó da linha é a fonte principal; o
 * `logistic.type` do envio só decide quando não há nó, ou quando os nós do
 * vendedor ainda não são conhecidos.
 */
export function resolveLineLocation(input: {
  nodeId: string | null;
  sellerNodeIds: ReadonlySet<string>;
  shipment: OrderShipmentInfo | null;
}): StockLocationValue | null {
  const { nodeId, sellerNodeIds, shipment } = input;
  if (nodeId && sellerNodeIds.has(nodeId)) return "own";
  if (nodeId && sellerNodeIds.size > 0) return "full";
  const type = shipment?.logisticType?.trim();
  if (type) return type === "fulfillment" ? "full" : "own";
  return null;
}

function roundUnits(value: number): number {
  if (!Number.isFinite(value) || value <= 0) return 0;
  return Math.round(value);
}

export function planOrderStockEffects(input: {
  order: OrderSearchOrder;
  activatedAt: Date;
  sellerNodeIds: ReadonlySet<string>;
  shipment: OrderShipmentInfo | null;
  resolveListing: (mlItemId: string) => ListingStockTarget | null;
  /**
   * Sem nó e sem `logistic.type` (pedido sem envio — retirada/a combinar — ou
   * envio que o ML não devolveu): conta como saída de casa. Só o Full tem nó
   * do ML; venda sem envio do ML sai sempre do vendedor.
   */
  assumeOwnWhenUnknown?: boolean;
}): OrderStockPlan {
  const { order, activatedAt, sellerNodeIds, shipment, resolveListing } = input;
  const assumeOwn = input.assumeOwnWhenUnknown === true;
  const orderId = order.id == null ? "" : String(order.id);
  const occurredAt = orderOccurredAt(order);
  const status = order.status ?? "";
  const base: OrderStockPlan = {
    orderId,
    occurredAt,
    phase: "ignored",
    sales: [],
    unmapped: [],
    needsShipment: false,
    dispatched: shipmentDispatched(shipment),
    returnSignaled: false,
  };

  if (!orderId || !occurredAt) return base;
  if (occurredAt.getTime() < activatedAt.getTime()) {
    return { ...base, phase: "before_activation" };
  }

  const phase = PAID_STATUSES.has(status)
    ? "paid"
    : CANCELLED_STATUSES.has(status)
      ? "cancelled"
      : "ignored";
  if (phase === "ignored") return base;

  const sales: SaleMovementDraft[] = [];
  const unmapped: UnmappedLineDraft[] = [];
  let needsShipment = false;

  for (const line of order.order_items ?? []) {
    const itemId = lineItemId(line);
    const units = roundUnits(Number(line.quantity ?? 0));
    if (!itemId || units === 0) continue;

    const nodeId = lineNodeId(line);
    const resolved = resolveLineLocation({ nodeId, sellerNodeIds, shipment });
    const location = resolved ?? (assumeOwn ? "own" : null);
    if (location === null) needsShipment = true;

    const target = resolveListing(itemId);
    if (!target) {
      unmapped.push({
        listingMlItemId: itemId,
        units,
        location,
        title: line.item?.title ?? null,
      });
      continue;
    }
    if (location === null) continue;

    if (target.kind === "item") {
      sales.push({
        stockItemId: target.stockItemId,
        location,
        units,
        sourceLineKey: itemId,
        listingMlItemId: itemId,
        nodeId,
      });
      continue;
    }

    for (const component of target.components) {
      const componentUnits = roundUnits(units * component.quantity);
      if (componentUnits === 0) continue;
      sales.push({
        stockItemId: component.stockItemId,
        location,
        units: componentUnits,
        sourceLineKey: `${itemId}#${component.stockItemId}`,
        listingMlItemId: itemId,
        nodeId,
      });
    }
  }

  return {
    ...base,
    phase,
    sales,
    unmapped,
    needsShipment,
    returnSignaled: phase === "paid" && orderSignalsReturn(order),
  };
}

/**
 * Precisa ler o envio deste pedido? Sim quando falta localizar alguma linha,
 * quando um cancelamento precisa saber se o envio saiu, ou quando há venda
 * de casa (só para mostrar o canal — Flex, Agência…).
 */
export function orderNeedsShipment(plan: OrderStockPlan): boolean {
  if (plan.phase === "before_activation" || plan.phase === "ignored") return false;
  if (plan.needsShipment) return true;
  if (plan.phase === "cancelled") return true;
  return plan.sales.some((s) => s.location === "own");
}
