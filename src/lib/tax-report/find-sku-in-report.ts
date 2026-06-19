import { normalizeProductSku } from "@/lib/product-pricing";
import type { SkuAggregation } from "@/lib/tax-report/types";

/** Encontra agregação por SKU canônico ou alias (após repair do snapshot). */
export function findSkuInReport(
  porSku: SkuAggregation[],
  sku: string,
): SkuAggregation | undefined {
  const key = normalizeProductSku(sku);
  if (!key) return undefined;

  // URL com alias → preferir linha canônica agrupada (evita row legado sku=alias).
  const viaAlias = porSku.find((row) =>
    row.skuAliases?.some((alias) => normalizeProductSku(alias) === key),
  );
  if (viaAlias) return viaAlias;

  return porSku.find((row) => normalizeProductSku(row.sku) === key);
}

export function canonicalSkuFromReport(
  porSku: SkuAggregation[],
  sku: string,
): string {
  return findSkuInReport(porSku, sku)?.sku ?? normalizeProductSku(sku);
}
