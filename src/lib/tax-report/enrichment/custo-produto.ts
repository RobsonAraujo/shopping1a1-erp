import type { ProductView } from "@/lib/product-data";

export type CustoProduto = {
  sku: string;
  pricingCost: number | null;
  unitCostNf: number | null;
  purchaseIcmsPercent: number;
  hasIcmsSt: boolean;
  extraCosts: number;
  isMonophasic: boolean;
  isImported: boolean;
  importContentPercent: number;
};

export function custoProdutoFromView(view: ProductView): CustoProduto {
  const unitCostNf =
    Number.isFinite(view.unitCostNf) && view.unitCostNf > 0
      ? view.unitCostNf
      : null;
  return {
    sku: view.sku,
    pricingCost: view.pricingCost,
    unitCostNf,
    purchaseIcmsPercent: view.purchaseIcmsPercent ?? 0,
    hasIcmsSt: view.hasIcmsSt,
    extraCosts: view.extraCosts,
    isMonophasic: view.isMonophasic,
    isImported: view.isImported,
    importContentPercent: view.importContentPercent,
  };
}
