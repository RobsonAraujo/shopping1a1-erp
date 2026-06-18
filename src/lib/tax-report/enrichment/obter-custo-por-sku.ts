import { resolvePricingForSku } from "@/lib/product-data";
import { normalizeProductSku } from "@/lib/product-pricing";

export type CustoProduto = {
  sku: string;
  pricingCost: number | null;
  extraCosts: number;
  isMonophasic: boolean;
  isImported: boolean;
  importContentPercent: number;
};

// TODO: integrar com o serviço real de precificação se divergir do cadastro de produtos.
export async function obterCustoPorSku(
  sku: string | null,
): Promise<CustoProduto | null> {
  if (!sku) return null;
  const normalized = normalizeProductSku(sku);
  const resolved = await resolvePricingForSku(normalized);
  if (!resolved.product) return null;

  return {
    sku: normalized,
    pricingCost: resolved.pricing?.pricingCost ?? null,
    extraCosts: resolved.product.extraCosts,
    isMonophasic: resolved.product.isMonophasic,
    isImported: resolved.product.isImported ?? false,
    importContentPercent: resolved.product.importContentPercent ?? 0,
  };
}
