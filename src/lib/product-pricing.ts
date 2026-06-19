import { roundMoney } from "@/lib/financial-margin";

export const DEFAULT_PIS_COFINS_PERCENT = 9.25;

export type ProductPricingInput = {
  unitCostNf: number;
  purchaseIcmsPercent: number;
  hasIcmsSt: boolean;
  purchaseCostWithSt: number | null;
  ipiPercent: number;
  isMonophasic: boolean;
  pisCofinsPercent: number;
};

export type ProductPricingTaxInput = {
  saleIcmsPercent: number;
  isMonophasic: boolean;
  pisCofinsPercent: number;
};

export type ResolvedProductPricing = {
  pricingCost: number;
  taxPercent: number;
  extraCosts: number;
};

export type ProductRecordForPricing = {
  unitCostNf: number;
  purchaseIcmsPercent: number;
  hasIcmsSt: boolean;
  purchaseCostWithSt: number | null;
  ipiPercent: number;
  extraCosts: number;
  isMonophasic: boolean;
  saleIcmsPercent: number;
};

/** Custo efetivo para precificação (fórmula da planilha). */
export function computeEffectivePricingCost(
  input: ProductPricingInput,
): number | null {
  const {
    unitCostNf,
    purchaseIcmsPercent,
    hasIcmsSt,
    purchaseCostWithSt,
    ipiPercent,
    isMonophasic,
    pisCofinsPercent,
  } = input;

  if (
    !Number.isFinite(unitCostNf) ||
    unitCostNf < 0 ||
    !Number.isFinite(purchaseIcmsPercent) ||
    purchaseIcmsPercent < 0
  ) {
    return null;
  }

  if (hasIcmsSt) {
    if (
      purchaseCostWithSt === null ||
      !Number.isFinite(purchaseCostWithSt) ||
      purchaseCostWithSt < 0
    ) {
      return null;
    }
  }

  const icmsRate = purchaseIcmsPercent / 100;
  const ipiRate = (ipiPercent ?? 0) / 100;
  const pisRate = (pisCofinsPercent ?? 0) / 100;

  const grossBase = hasIcmsSt
    ? purchaseCostWithSt!
    : unitCostNf * (1 + ipiRate);

  const icmsCredit = hasIcmsSt ? 0 : unitCostNf * icmsRate;

  const pisCofinsCredit = isMonophasic
    ? 0
    : (unitCostNf - unitCostNf * icmsRate) * pisRate;

  return roundMoney(grossBase - icmsCredit - pisCofinsCredit);
}

/** ICMS destacado na NF de entrada (crédito na compra). */
export function purchaseIcmsCreditUnit(input: {
  unitCostNf: number;
  purchaseIcmsPercent: number;
  hasIcmsSt: boolean;
}): number {
  const { unitCostNf, purchaseIcmsPercent, hasIcmsSt } = input;
  if (
    hasIcmsSt ||
    !Number.isFinite(unitCostNf) ||
    unitCostNf <= 0 ||
    !Number.isFinite(purchaseIcmsPercent) ||
    purchaseIcmsPercent <= 0
  ) {
    return 0;
  }
  return roundMoney(unitCostNf * (purchaseIcmsPercent / 100));
}

/** Base para crédito PIS/COFINS na aquisição (unitCostNf − ICMS entrada). */
export function purchasePisCofinsCreditBaseUnit(input: {
  unitCostNf: number;
  purchaseIcmsPercent: number;
  hasIcmsSt: boolean;
}): number {
  const { unitCostNf, purchaseIcmsPercent, hasIcmsSt } = input;
  if (!Number.isFinite(unitCostNf) || unitCostNf <= 0) {
    return 0;
  }
  const icmsEntrada = purchaseIcmsCreditUnit({
    unitCostNf,
    purchaseIcmsPercent,
    hasIcmsSt,
  });
  return roundMoney(Math.max(0, unitCostNf - icmsEntrada));
}

/** Imposto total % para precificação (venda). */
export function computePricingTaxPercent(
  input: ProductPricingTaxInput,
): number | null {
  const { saleIcmsPercent, isMonophasic, pisCofinsPercent } = input;
  if (!Number.isFinite(saleIcmsPercent) || saleIcmsPercent < 0) {
    return null;
  }
  const pis = isMonophasic ? 0 : (pisCofinsPercent ?? 0);
  if (!Number.isFinite(pis) || pis < 0) return null;
  return Math.round((saleIcmsPercent + pis) * 10000) / 10000;
}

export function resolveProductPricing(
  product: ProductRecordForPricing,
  pisCofinsPercent: number,
): ResolvedProductPricing | null {
  const pricingCost = computeEffectivePricingCost({
    unitCostNf: product.unitCostNf,
    purchaseIcmsPercent: product.purchaseIcmsPercent,
    hasIcmsSt: product.hasIcmsSt,
    purchaseCostWithSt: product.purchaseCostWithSt,
    ipiPercent: product.ipiPercent,
    isMonophasic: product.isMonophasic,
    pisCofinsPercent,
  });

  const taxPercent = computePricingTaxPercent({
    saleIcmsPercent: product.saleIcmsPercent,
    isMonophasic: product.isMonophasic,
    pisCofinsPercent,
  });

  if (pricingCost === null || taxPercent === null) return null;

  return {
    pricingCost,
    taxPercent,
    extraCosts: roundMoney(Math.max(0, product.extraCosts ?? 0)),
  };
}

export function normalizeProductSku(sku: string): string {
  return sku
    .replace(/\u00A0/g, " ")
    .replace(/[\t\r\n]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}
