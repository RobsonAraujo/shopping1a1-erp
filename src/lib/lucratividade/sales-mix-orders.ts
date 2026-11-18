import { fetchOrdersInDateRange } from "@/lib/mercadolibre/api";
import { mapWithConcurrency } from "@/lib/mercadolibre/concurrency";
import { orderChannel } from "@/lib/mercadolibre/order-channel";
import { fetchShipmentLogisticType } from "@/lib/mercadolibre/shipment-logistic";
import type { OrderSearchOrder } from "@/lib/mercadolibre/types";
import {
  listingIdFromOrderLine,
  quantityFromOrderLine,
  revenueFromOrderLine,
  saleFeePerUnitFromOrderLine,
  unitPriceFromOrderLine,
} from "@/lib/lucratividade/period-sales-aggregate";
import {
  createSalesMixAccumulator,
  salesMixLogisticFromShipmentType,
  type SalesMixForItem,
  type SalesMixLogistic,
} from "@/lib/lucratividade/sales-mix";
import { roundMoney } from "@/lib/pricing/financial-margin";

/** Envios consultados por abertura do painel — acima disso, "não classificado". */
export const SALES_MIX_SHIPMENT_LIMIT = 1500;
const SHIPMENT_CONCURRENCY = 8;

function orderTime(order: OrderSearchOrder): number {
  const raw = order.date_closed ?? order.date_created;
  const time = raw ? new Date(raw).getTime() : Number.NaN;
  return Number.isFinite(time) ? time : 0;
}

/**
 * Composição das vendas de UM anúncio no período, com a forma de envio de
 * cada pedido (`GET /shipments/{id}`). Mesma janela e mesmo campo de data da
 * Lucratividade; `until` corta os pedidos que chegaram depois da linha ser
 * calculada, pra composição fechar com ela. Só lê do ML.
 */
export async function loadSalesMixForItem(
  accessToken: string,
  sellerId: number,
  itemId: string,
  range: { from: Date; to: Date },
  options: { until?: Date | null; signal?: AbortSignal } = {},
): Promise<SalesMixForItem> {
  const { until, signal } = options;
  const orders = (
    await fetchOrdersInDateRange(accessToken, sellerId, range.from, range.to, {
      orderStatus: "paid",
      itemId,
      signal,
    })
  ).filter(
    (order) =>
      order.status === "paid" && (!until || orderTime(order) <= until.getTime()),
  );

  // Envios distintos, do pedido mais recente pro mais antigo (o teto corta os antigos).
  const shipmentIds: string[] = [];
  const seen = new Set<string>();
  for (const order of [...orders].sort((a, b) => orderTime(b) - orderTime(a))) {
    const id = order.shipping?.id;
    if (id == null) continue;
    const key = String(id);
    if (seen.has(key)) continue;
    seen.add(key);
    shipmentIds.push(key);
  }

  const toFetch = shipmentIds.slice(0, SALES_MIX_SHIPMENT_LIMIT);
  let failed = 0;
  const types = await mapWithConcurrency(toFetch, SHIPMENT_CONCURRENCY, async (id) => {
    signal?.throwIfAborted();
    try {
      return await fetchShipmentLogisticType(accessToken, id, signal);
    } catch (err) {
      if (signal?.aborted) throw err;
      failed += 1;
      return null;
    }
  });
  const typeByShipment = new Map(toFetch.map((id, index) => [id, types[index]]));

  const mix = createSalesMixAccumulator();
  let units = 0;
  let revenue = 0;
  for (const order of orders) {
    const channel = orderChannel(order);
    const shipmentId = order.shipping?.id != null ? String(order.shipping.id) : null;
    const logistic: SalesMixLogistic =
      shipmentId === null
        ? "other"
        : typeByShipment.has(shipmentId)
          ? salesMixLogisticFromShipmentType(typeByShipment.get(shipmentId))
          : "unclassified";
    for (const line of order.order_items ?? []) {
      if (listingIdFromOrderLine(line) !== itemId) continue;
      const quantity = quantityFromOrderLine(line);
      const lineRevenue = revenueFromOrderLine(line);
      if (quantity <= 0 && lineRevenue <= 0) continue;
      units += quantity;
      revenue += lineRevenue;
      mix.add({
        channel,
        listingTypeId: line.listing_type_id ?? null,
        logistic,
        quantity,
        revenue: lineRevenue,
        unitPrice: unitPriceFromOrderLine(line),
        saleFeePerUnit: saleFeePerUnitFromOrderLine(line),
      });
    }
  }

  return {
    entries: mix.entries(),
    units,
    revenue: roundMoney(revenue),
    shipments: {
      total: shipmentIds.length,
      classified: types.filter((type) => type !== null).length,
      capped: shipmentIds.length > toFetch.length,
      failed,
    },
  };
}
