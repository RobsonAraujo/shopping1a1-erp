import type { SkuAggregation } from "@/lib/tax-report/types";

/** Encontra agregação por SKU canônico ou alias (após repair do snapshot). */
export function findSkuInReport(
  porSku: SkuAggregation[],
  sku: string,
): SkuAggregation | undefined {
  const trimmed = sku.trim();
  if (!trimmed) return undefined;

  const direct = porSku.find((row) => row.sku === trimmed);
  if (direct) return direct;

  return porSku.find((row) => row.skuAliases?.includes(trimmed));
}

export function canonicalSkuFromReport(
  porSku: SkuAggregation[],
  sku: string,
): string {
  return findSkuInReport(porSku, sku)?.sku ?? sku.trim();
}
