import type { ItemBody } from "@/lib/mercadolibre/types";
import { normalizeProductSku } from "@/lib/pricing/product-pricing";

const NO_SUPPLIER_LABEL = "Sem fornecedor";

/** Primeira palavra do SKU — usada como marca/fornecedor (ex.: MXT, Aquário). */
export function getSkuSupplier(sku: string | null | undefined): string {
  if (!sku?.trim()) return NO_SUPPLIER_LABEL;
  const firstWord = sku.trim().split(/\s+/)[0];
  return firstWord || NO_SUPPLIER_LABEL;
}

function sortSupplierGroups<T>(
  bySupplier: Map<string, T[]>,
): { supplier: string; rows: T[] }[] {
  return [...bySupplier.entries()]
    .sort(([a], [b]) => {
      if (a === NO_SUPPLIER_LABEL) return 1;
      if (b === NO_SUPPLIER_LABEL) return -1;
      return a.localeCompare(b, "pt-BR", { sensitivity: "base" });
    })
    .map(([supplier, groupRows]) => ({ supplier, rows: groupRows }));
}

export function groupBySkuSupplier<T>(
  rows: T[],
  getSku: (row: T) => string | null | undefined,
): { supplier: string; rows: T[] }[] {
  const bySupplier = new Map<string, T[]>();
  for (const row of rows) {
    const supplier = getSkuSupplier(getSku(row));
    const group = bySupplier.get(supplier) ?? [];
    group.push(row);
    bySupplier.set(supplier, group);
  }
  return sortSupplierGroups(bySupplier);
}

/**
 * Mesmo agrupamento/ordenação de `groupBySkuSupplier`, mas para quando o
 * nome do fornecedor já foi resolvido pelo chamador (fornecedor cadastrado,
 * com fallback para `getSkuSupplier` já aplicado antes de chegar aqui) — não
 * reaplica o parsing de SKU em cima do nome resolvido.
 */
export function groupBySupplierName<T>(
  rows: T[],
  getSupplierName: (row: T) => string,
): { supplier: string; rows: T[] }[] {
  const bySupplier = new Map<string, T[]>();
  for (const row of rows) {
    const supplier = getSupplierName(row) || NO_SUPPLIER_LABEL;
    const group = bySupplier.get(supplier) ?? [];
    group.push(row);
    bySupplier.set(supplier, group);
  }
  return sortSupplierGroups(bySupplier);
}

/**
 * Anúncio "kit" do Mercado Livre: formado a partir de outros SKUs já cadastrados,
 * não tem `seller_custom_field`/`SELLER_SKU` próprio (não é possível cadastrar SKU nele).
 */
export function isKitItem(item: ItemBody): boolean {
  return Boolean(item.tags?.includes("bundle")) && !getItemSku(item);
}

export function getItemSku(item: ItemBody): string | null {
  const directSku = item.seller_custom_field
    ? normalizeProductSku(item.seller_custom_field)
    : "";
  if (directSku) return directSku;

  const rawAttr = item.attributes?.find((attr) => attr.id === "SELLER_SKU")
    ?.value_name;
  const attrSku = rawAttr ? normalizeProductSku(rawAttr) : "";
  if (attrSku) return attrSku;

  return null;
}
