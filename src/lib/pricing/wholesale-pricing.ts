import { roundMoney, type MinSalePriceReason } from "@/lib/pricing/financial-margin";

export const DEFAULT_WHOLESALE_LEVEL1_REDUCTION_PERCENT = 10;
export const DEFAULT_WHOLESALE_LEVEL2_REDUCTION_PERCENT = 15;
export const DEFAULT_WHOLESALE_LEVEL3_REDUCTION_PERCENT = 20;
/** Qtd mín. da âncora ML (nível 1 ERP) — fixo em 1 unidade. */
export const WHOLESALE_ANCHOR_MIN_PURCHASE_UNIT = 1;
export const DEFAULT_WHOLESALE_LEVEL1_MIN_PURCHASE_UNIT =
  WHOLESALE_ANCHOR_MIN_PURCHASE_UNIT;
export const DEFAULT_WHOLESALE_LEVEL2_MIN_PURCHASE_UNIT = 5;
export const DEFAULT_WHOLESALE_LEVEL3_MIN_PURCHASE_UNIT = 10;

export type WholesaleReductionSettings = {
  level1ReductionPercent: number;
  level2ReductionPercent: number;
  level3ReductionPercent: number;
  level1MinPurchaseUnit: number;
  level2MinPurchaseUnit: number;
  level3MinPurchaseUnit: number;
};

export const DEFAULT_WHOLESALE_REDUCTIONS: WholesaleReductionSettings = {
  level1ReductionPercent: DEFAULT_WHOLESALE_LEVEL1_REDUCTION_PERCENT,
  level2ReductionPercent: DEFAULT_WHOLESALE_LEVEL2_REDUCTION_PERCENT,
  level3ReductionPercent: DEFAULT_WHOLESALE_LEVEL3_REDUCTION_PERCENT,
  level1MinPurchaseUnit: DEFAULT_WHOLESALE_LEVEL1_MIN_PURCHASE_UNIT,
  level2MinPurchaseUnit: DEFAULT_WHOLESALE_LEVEL2_MIN_PURCHASE_UNIT,
  level3MinPurchaseUnit: DEFAULT_WHOLESALE_LEVEL3_MIN_PURCHASE_UNIT,
};

export function validateWholesaleDiscountMinPurchaseUnit(
  value: unknown,
): string | null {
  const n = Number(value);
  if (!Number.isInteger(n) || n < 2) {
    return "Quantidade mínima deve ser um inteiro maior ou igual a 2";
  }
  return null;
}

/** @deprecated Use validateWholesaleDiscountMinPurchaseUnit */
export function validateWholesaleMinPurchaseUnit(
  value: unknown,
): string | null {
  return validateWholesaleDiscountMinPurchaseUnit(value);
}

export function displayMinPurchaseUnitForLevel(
  level: 1 | 2 | 3,
  settings: WholesaleReductionSettings,
): number {
  if (level === 1) return WHOLESALE_ANCHOR_MIN_PURCHASE_UNIT;
  if (level === 2) return settings.level2MinPurchaseUnit;
  return settings.level3MinPurchaseUnit;
}

/** Qtd mín. enviada ao ML para cada nível (nível 1 = âncora em 1 un.). */
export function mlDiscountMinPurchaseUnitForLevel(
  level: 1 | 2 | 3,
  settings: WholesaleReductionSettings,
): number {
  if (level === 1) return WHOLESALE_ANCHOR_MIN_PURCHASE_UNIT;
  if (level === 2) return settings.level2MinPurchaseUnit;
  return settings.level3MinPurchaseUnit;
}

export function isWholesaleAnchorLevel(level: number): boolean {
  return level === 1;
}

export function validateWholesaleReductionSettings(
  settings: WholesaleReductionSettings,
): string | null {
  if (settings.level1MinPurchaseUnit !== WHOLESALE_ANCHOR_MIN_PURCHASE_UNIT) {
    return "Nível 1 (âncora): quantidade mínima deve ser 1 unidade";
  }

  const discountQtys = [
    settings.level2MinPurchaseUnit,
    settings.level3MinPurchaseUnit,
  ];
  for (let i = 0; i < discountQtys.length; i++) {
    const err = validateWholesaleDiscountMinPurchaseUnit(discountQtys[i]);
    if (err) return `Nível ${i + 2}: ${err}`;
  }
  if (!(discountQtys[0] < discountQtys[1])) {
    return "Quantidades mínimas dos níveis 2 e 3 devem crescer";
  }
  return null;
}

export function wholesaleMinPurchaseUnitsFromSettings(
  settings: WholesaleReductionSettings,
): [number, number, number] {
  return [
    settings.level1MinPurchaseUnit,
    settings.level2MinPurchaseUnit,
    settings.level3MinPurchaseUnit,
  ];
}

export type WholesalePriceLevelReason =
  | MinSalePriceReason
  | "missing_current_margin";

export type WholesalePriceLevelResult = {
  level: 1 | 2 | 3;
  reductionPercent: number;
  targetMarginPercent: number | null;
  targetMarginValue: number | null;
  suggestedPrice: number | null;
  reason: WholesalePriceLevelReason;
};

export function computeTargetMarginFromReduction(
  currentMarginPercent: number,
  reductionPercent: number,
): number {
  return roundMoney(currentMarginPercent * (1 - reductionPercent / 100));
}

export function computeTargetMarginValueFromReduction(
  currentMarginValue: number,
  reductionPercent: number,
): number {
  return roundMoney(currentMarginValue * (1 - reductionPercent / 100));
}

export function wholesaleReductionsToTuple(
  settings: WholesaleReductionSettings,
): [number, number, number] {
  return [
    settings.level1ReductionPercent,
    settings.level2ReductionPercent,
    settings.level3ReductionPercent,
  ];
}

export function computeWholesaleFixedCosts(input: {
  mlFeeAmount: number;
  mlFeeRebate?: number | null;
  shippingCost: number;
  productCost: number;
  extraCosts: number;
}): number {
  const netMlFee = roundMoney(
    Math.max(
      0,
      input.mlFeeAmount -
        Math.min(
          Math.max(0, input.mlFeeRebate ?? 0),
          Math.max(0, input.mlFeeAmount),
        ),
    ),
  );
  const shippingCost = roundMoney(Math.max(0, input.shippingCost));
  const productCost = roundMoney(Math.max(0, input.productCost));
  const extraCosts = roundMoney(Math.max(0, input.extraCosts));

  return roundMoney(netMlFee + shippingCost + productCost + extraCosts);
}

/**
 * Preço atacado = custos fixos do varejo (taxa ML + frete + custo + extras) + margem reduzida em R$.
 * Taxa ML e frete não escalam com o preço sugerido. Imposto = 0 (repasse B2B).
 */
export function computeWholesaleSalePrice(input: {
  mlFeeAmount: number;
  mlFeeRebate?: number | null;
  shippingCost: number;
  productCost: number;
  extraCosts: number;
  targetMarginValue: number;
}): { suggestedPrice: number | null; reason: MinSalePriceReason } {
  const fixedCosts = computeWholesaleFixedCosts(input);
  const suggestedPrice = roundMoney(fixedCosts + input.targetMarginValue);

  if (!Number.isFinite(suggestedPrice) || suggestedPrice <= 0) {
    return { suggestedPrice: null, reason: "impossible" };
  }

  return { suggestedPrice, reason: "ok" };
}

export function computeWholesalePricesForListing(input: {
  salePrice: number;
  mlFeeAmount: number | null;
  mlFeeRebate?: number | null;
  shippingCost: number | null;
  productCost: number | null;
  extraCosts: number | null;
  currentMarginPercent: number | null;
  currentMarginValue: number | null;
  reductions: [number, number, number];
}): WholesalePriceLevelResult[] {
  const levels = [1, 2, 3] as const;

  if (
    input.currentMarginValue === null ||
    !Number.isFinite(input.currentMarginValue) ||
    input.currentMarginPercent === null ||
    !Number.isFinite(input.currentMarginPercent)
  ) {
    return levels.map((level, index) => ({
      level,
      reductionPercent: input.reductions[index],
      targetMarginPercent: null,
      targetMarginValue: null,
      suggestedPrice: null,
      reason: "missing_current_margin" as const,
    }));
  }

  const currentMarginPercent = input.currentMarginPercent;
  const currentMarginValue = input.currentMarginValue;

  if (
    input.mlFeeAmount === null ||
    !Number.isFinite(input.mlFeeAmount) ||
    input.shippingCost === null ||
    !Number.isFinite(input.shippingCost)
  ) {
    return levels.map((level, index) => ({
      level,
      reductionPercent: input.reductions[index],
      targetMarginPercent: computeTargetMarginFromReduction(
        currentMarginPercent,
        input.reductions[index],
      ),
      targetMarginValue: computeTargetMarginValueFromReduction(
        currentMarginValue,
        input.reductions[index],
      ),
      suggestedPrice: null,
      reason: "incomplete" as const,
    }));
  }

  if (input.productCost === null || !Number.isFinite(input.productCost)) {
    return levels.map((level, index) => ({
      level,
      reductionPercent: input.reductions[index],
      targetMarginPercent: computeTargetMarginFromReduction(
        currentMarginPercent,
        input.reductions[index],
      ),
      targetMarginValue: computeTargetMarginValueFromReduction(
        currentMarginValue,
        input.reductions[index],
      ),
      suggestedPrice: null,
      reason: "missing_product_cost" as const,
    }));
  }

  return levels.map((level, index) => {
    const reductionPercent = input.reductions[index];
    const targetMarginPercent = computeTargetMarginFromReduction(
      currentMarginPercent,
      reductionPercent,
    );
    const targetMarginValue = computeTargetMarginValueFromReduction(
      currentMarginValue,
      reductionPercent,
    );

    const result = computeWholesaleSalePrice({
      mlFeeAmount: input.mlFeeAmount!,
      mlFeeRebate: input.mlFeeRebate,
      shippingCost: input.shippingCost!,
      productCost: input.productCost!,
      extraCosts: input.extraCosts ?? 0,
      targetMarginValue,
    });

    return {
      level,
      reductionPercent,
      targetMarginPercent,
      targetMarginValue,
      suggestedPrice: result.suggestedPrice,
      reason: result.reason,
    };
  });
}
