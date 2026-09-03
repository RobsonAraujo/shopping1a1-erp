import type { OrderSearchOrderItem } from "@/lib/mercadolibre/types";
import { getItemSku } from "@/lib/mercadolibre/item-sku";
import { normalizeProductSku } from "@/lib/pricing/product-pricing";
import type { ItemBody } from "@/lib/mercadolibre/types";

function normalizeOrderSku(sku: string | null | undefined): string | null {
  if (!sku) return null;
  const normalized = normalizeProductSku(sku);
  return normalized || null;
}

export function skuFromOrderLine(line: OrderSearchOrderItem): string | null {
  const fromItem = normalizeOrderSku(line.item?.seller_sku);
  if (fromItem) return fromItem;

  const fromItemCustom = normalizeOrderSku(line.item?.seller_custom_field);
  if (fromItemCustom) return fromItemCustom;

  const fromLine = normalizeOrderSku(line.seller_custom_field);
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
