import { normalizeProductSku } from "@/lib/pricing/product-pricing";
import type { SkuAggregation } from "@/lib/tax-report/types";

/**
 * Encontra a linha de agregação a partir do valor vindo da URL de drilldown
 * — que pode ser um `mlItemId` (link novo, gerado por `skuPathFor`) ou texto
 * de sku (link antigo salvo/bookmarkado, ou snapshot sem `mlItemId`). Tenta
 * por identidade primeiro — é a única forma de achar a linha certa quando
 * duas linhas compartilham o mesmo texto de exibição (Product.sku não é mais
 * único) — só cai pro texto/alias quando não bate por mlItemId.
 */
export function findSkuInReport(
  porSku: SkuAggregation[],
  value: string,
): SkuAggregation | undefined {
  const viaMlItemId = porSku.find((row) => row.mlItemId === value);
  if (viaMlItemId) return viaMlItemId;

  const key = normalizeProductSku(value);
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
