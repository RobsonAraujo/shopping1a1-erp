import type { ItemBody } from "@/lib/mercadolibre/types";

export function getItemSku(item: ItemBody): string | null {
  const directSku = item.seller_custom_field?.trim();
  if (directSku) return directSku;

  const attrSku = item.attributes
    ?.find((attr) => attr.id === "SELLER_SKU")
    ?.value_name?.trim();
  if (attrSku) return attrSku;

  return null;
}
