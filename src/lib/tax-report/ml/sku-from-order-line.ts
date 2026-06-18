import { getMercadoLibreConfig } from "@/lib/mercadolibre/config";
import type { OrderSearchOrderItem } from "@/lib/mercadolibre/types";
import { getItemSku } from "@/lib/mercadolibre/item-sku";
import type { ItemBody } from "@/lib/mercadolibre/types";

export function skuFromOrderLine(line: OrderSearchOrderItem): string | null {
  const fromItem = line.item?.seller_sku?.trim();
  if (fromItem) return fromItem;

  const fromItemCustom = line.item?.seller_custom_field?.trim();
  if (fromItemCustom) return fromItemCustom;

  const fromLine = line.seller_custom_field?.trim();
  if (fromLine) return fromLine;

  return null;
}

export function skuFromOrderLineWithFallback(
  line: OrderSearchOrderItem,
  itemById: Map<string, ItemBody>,
): string | null {
  const direct = skuFromOrderLine(line);
  if (direct) return direct;

  const itemId = line.item?.id ?? line.item_id;
  if (!itemId) return null;
  const item = itemById.get(itemId);
  if (!item) return null;
  return getItemSku(item);
}

export function revenueFromOrderItemLine(line: OrderSearchOrderItem): number {
  const qty =
    typeof line.quantity === "number" && Number.isFinite(line.quantity)
      ? line.quantity
      : 0;
  const price =
    typeof line.unit_price === "number" && Number.isFinite(line.unit_price)
      ? line.unit_price
      : 0;
  return Math.round(qty * price * 100) / 100;
}

export function itemIdFromOrderLine(line: OrderSearchOrderItem): string | null {
  return line.item?.id ?? line.item_id ?? null;
}
