import type { ItemBody } from "@/lib/mercadolibre/types";

const NO_SUPPLIER_LABEL = "Sem fornecedor";

/** Primeira palavra do SKU — usada como marca/fornecedor (ex.: MXT, Aquário). */
export function getSkuSupplier(sku: string | null | undefined): string {
  if (!sku?.trim()) return NO_SUPPLIER_LABEL;
  const firstWord = sku.trim().split(/\s+/)[0];
  return firstWord || NO_SUPPLIER_LABEL;
}

export function getItemSku(item: ItemBody): string | null {
  const directSku = item.seller_custom_field?.trim();
  if (directSku) return directSku;

  const attrSku = item.attributes
    ?.find((attr) => attr.id === "SELLER_SKU")
    ?.value_name?.trim();
  if (attrSku) return attrSku;

  return null;
}
