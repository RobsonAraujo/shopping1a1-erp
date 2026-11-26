import { mapWithConcurrency } from "@/lib/mercadolibre/concurrency";
import { fetchShipmentLogisticType } from "@/lib/mercadolibre/shipment-logistic";
import type {
  OrderSearchOrder,
  OrderSearchOrderItem,
} from "@/lib/mercadolibre/types";
import { salesMixLogisticFromShipmentType } from "@/lib/lucratividade/sales-mix";

/**
 * Quais vendas do período foram Flex. No Flex o Mercado Livre não cobra frete
 * e consideramos que o bônus de envio paga a entrega, então a margem não
 * conta nem o frete nem o bônus (decisão do usuário, nov/2026).
 *
 * O pedido não diz a forma de envio. Ela vem de `GET /shipments/{id}`, uma
 * chamada por envio. Para não consultar todos, usamos o nó de estoque da
 * linha. Conferido em 400 pedidos reais em 26/11/2026:
 * - um nó de centro do ML (`store_id` nulo, ex.: `BRSP15`) foi sempre
 *   `fulfillment` (332 de 332);
 * - um nó do vendedor (`store_id` preenchido) foi `self_service` (Flex) ou
 *   `xd_drop_off` (Coleta).
 * Por isso só os envios de estoque próprio são consultados. Isso deu ~13% dos
 * pedidos e ~1 s para 7 dias.
 */

const SHIPMENT_CONCURRENCY = 8;
/** De quantos em quantos envios o progresso é avisado. */
const PROGRESS_EVERY = 10;

/** A linha pode ter saído do estoque do vendedor (Flex, Coleta…), não de um centro do ML. */
export function lineMayShipFromSeller(
  line: Pick<OrderSearchOrderItem, "stock">,
): boolean {
  const node =
    typeof line.stock?.node_id === "string" ? line.stock.node_id.trim() : "";
  if (!node) return true;
  const store = line.stock?.store_id;
  return store !== null && store !== undefined && String(store).trim() !== "";
}

/** Envios distintos que precisam de consulta para saber se foram Flex. */
export function shipmentIdsToClassify(orders: OrderSearchOrder[]): string[] {
  const ids: string[] = [];
  const seen = new Set<string>();
  for (const order of orders) {
    if (order.status === "cancelled") continue;
    const id = order.shipping?.id;
    if (id == null) continue;
    if (!(order.order_items ?? []).some(lineMayShipFromSeller)) continue;
    const key = String(id);
    if (seen.has(key)) continue;
    seen.add(key);
    ids.push(key);
  }
  return ids;
}

export type FlexShipmentsLoad = {
  /** Envios (`shipping.id`) que foram Flex. */
  flexShipmentIds: Set<string>;
  /** Envios consultados. */
  checked: number;
  /** Consultas que falharam: a venda conta como não Flex e paga o frete do anúncio. */
  failed: number;
};

export async function loadFlexShipmentIds(
  accessToken: string,
  orders: OrderSearchOrder[],
  options: {
    signal?: AbortSignal;
    onProgress?: (progress: { checked: number; total: number }) => void;
  } = {},
): Promise<FlexShipmentsLoad> {
  const { signal, onProgress } = options;
  const ids = shipmentIdsToClassify(orders);
  const flexShipmentIds = new Set<string>();
  if (ids.length === 0) return { flexShipmentIds, checked: 0, failed: 0 };

  let checked = 0;
  let failed = 0;
  onProgress?.({ checked: 0, total: ids.length });
  await mapWithConcurrency(ids, SHIPMENT_CONCURRENCY, async (id) => {
    signal?.throwIfAborted();
    try {
      const type = await fetchShipmentLogisticType(accessToken, id, signal);
      if (salesMixLogisticFromShipmentType(type) === "flex") {
        flexShipmentIds.add(id);
      }
    } catch (err) {
      if (signal?.aborted) throw err;
      failed += 1;
    }
    checked += 1;
    if (checked % PROGRESS_EVERY === 0 || checked === ids.length) {
      onProgress?.({ checked, total: ids.length });
    }
  });

  return { flexShipmentIds, checked, failed };
}
