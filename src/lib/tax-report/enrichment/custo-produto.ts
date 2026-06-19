import type { ProductView } from "@/lib/product-data";

export type CustoProduto = {
  sku: string;
  pricingCost: number | null;
  extraCosts: number;
  isMonophasic: boolean;
  isImported: boolean;
  importContentPercent: number;
};

export function custoProdutoFromView(view: ProductView): CustoProduto {
  return {
    sku: view.sku,
    pricingCost: view.pricingCost,
    extraCosts: view.extraCosts,
    isMonophasic: view.isMonophasic,
    isImported: view.isImported,
    importContentPercent: view.importContentPercent,
  };
}
