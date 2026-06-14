export type FinancialMarginLineKey =
  | "mlFee"
  | "mlFeeRebate"
  | "shipping"
  | "productCost"
  | "extraCosts"
  | "tax"
  | "totalCosts"
  | "salePrice"
  | "margin"
  | "ads"
  | "marginAfterAds";

export type FinancialMarginLine = {
  key: FinancialMarginLineKey;
  label: string;
  value: number;
  percentOfSale: number | null;
};

export type FinancialMarginInput = {
  salePrice: number;
  mlFeeAmount: number;
  /** Crédito de tarifa (rebate) da última venda MLB; reduz custos totais. */
  mlFeeRebate?: number;
  shippingCost: number;
  productCost: number | null;
  extraCosts: number | null;
  taxRatePercent: number | null;
  listingTypeLabel?: string | null;
};

export type FinancialMarginBreakdown = {
  salePrice: number;
  lines: FinancialMarginLine[];
  totalCosts: number;
  marginValue: number;
  marginPercent: number | null;
  listingTypeLabel: string | null;
  isComplete: boolean;
  missingFields: string[];
};

export function listingTypeLabelFromId(
  listingTypeId: string | null | undefined,
): string | null {
  if (!listingTypeId) return null;
  if (listingTypeId === "gold_special") return "Clássico";
  if (listingTypeId === "gold_pro") return "Premium";
  return listingTypeId;
}

export function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

export function percentOfSale(value: number, salePrice: number): number | null {
  if (salePrice <= 0) return null;
  return roundMoney((value / salePrice) * 100);
}

export function formatFinancialPercent(value: number | null): string {
  if (value === null) return "—";
  return `${value.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`;
}

export function formatFinancialMoney(value: number | null): string {
  if (value === null) return "—";
  return value.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

export function computeFinancialMargin(
  input: FinancialMarginInput,
): FinancialMarginBreakdown {
  const salePrice = roundMoney(input.salePrice);
  const mlFeeAmount = roundMoney(Math.max(0, input.mlFeeAmount));
  const mlFeeRebate = roundMoney(
    Math.min(
      Math.max(0, input.mlFeeRebate ?? 0),
      Math.max(0, input.mlFeeAmount),
    ),
  );
  const shippingCost = roundMoney(Math.max(0, input.shippingCost));
  const productCost =
    input.productCost !== null ? roundMoney(Math.max(0, input.productCost)) : null;
  const extraCosts =
    input.extraCosts !== null ? roundMoney(Math.max(0, input.extraCosts)) : null;
  const taxRatePercent = input.taxRatePercent;

  const missingFields: string[] = [];
  if (productCost === null) missingFields.push("productCost");
  if (extraCosts === null) missingFields.push("extraCosts");
  if (taxRatePercent === null) missingFields.push("taxRatePercent");

  const taxAmount =
    taxRatePercent !== null && salePrice > 0
      ? roundMoney(salePrice * (taxRatePercent / 100))
      : 0;

  const feeLabel = input.listingTypeLabel
    ? `Taxa ${input.listingTypeLabel}`
    : "Taxa ML";

  const productCostValue = productCost ?? 0;
  const extraCostsValue = extraCosts ?? 0;

  const totalCosts = roundMoney(
    mlFeeAmount +
      shippingCost +
      productCostValue +
      extraCostsValue +
      taxAmount -
      mlFeeRebate,
  );
  const marginValue = roundMoney(salePrice - totalCosts);
  const marginPercent = percentOfSale(marginValue, salePrice);

  const lines: FinancialMarginLine[] = [
    {
      key: "mlFee",
      label: feeLabel,
      value: mlFeeAmount,
      percentOfSale: percentOfSale(mlFeeAmount, salePrice),
    },
    ...(mlFeeRebate > 0
      ? [
          {
            key: "mlFeeRebate" as const,
            label: "Desconto de tarifa oferecido pelo Mercado Livre",
            value: -mlFeeRebate,
            percentOfSale: percentOfSale(-mlFeeRebate, salePrice),
          },
        ]
      : []),
    {
      key: "shipping",
      label: "Frete",
      value: shippingCost,
      percentOfSale: percentOfSale(shippingCost, salePrice),
    },
    {
      key: "productCost",
      label: "Custo do Produto",
      value: productCostValue,
      percentOfSale: percentOfSale(productCostValue, salePrice),
    },
    {
      key: "extraCosts",
      label: "Custos Extras",
      value: extraCostsValue,
      percentOfSale: percentOfSale(extraCostsValue, salePrice),
    },
    {
      key: "tax",
      label: "Alíquota de Impostos",
      value: taxAmount,
      percentOfSale: percentOfSale(taxAmount, salePrice),
    },
    {
      key: "totalCosts",
      label: "Custos Totais",
      value: totalCosts,
      percentOfSale: percentOfSale(totalCosts, salePrice),
    },
    {
      key: "salePrice",
      label: "Preço de Venda",
      value: salePrice,
      percentOfSale: salePrice > 0 ? 100 : null,
    },
    {
      key: "margin",
      label: "Margem de Contribuição",
      value: marginValue,
      percentOfSale: marginPercent,
    },
  ];

  return {
    salePrice,
    lines,
    totalCosts,
    marginValue,
    marginPercent,
    listingTypeLabel: input.listingTypeLabel ?? null,
    isComplete: missingFields.length === 0,
    missingFields,
  };
}

export type MarginAfterAdsInput = {
  marginBreakdown: FinancialMarginBreakdown;
  tacosPercent: number | null;
  adsCost: number | null;
  unitsSold: number | null;
};

export type MarginAfterAdsResult = {
  marginAfterAdsPercent: number | null;
  marginAfterAdsValue: number | null;
  adsCostPerUnit: number | null;
  adsCostImputed: number | null;
  extendedLines: FinancialMarginLine[];
};

export function computeMarginAfterAds(
  input: MarginAfterAdsInput,
): MarginAfterAdsResult | null {
  const { marginBreakdown, tacosPercent, adsCost, unitsSold } = input;
  const salePrice = marginBreakdown.salePrice;
  const marginPercent = marginBreakdown.marginPercent;
  const marginValue = marginBreakdown.marginValue;

  if (marginPercent === null) {
    return null;
  }

  const tacos = tacosPercent ?? 0;
  const marginAfterAdsPercent =
    marginPercent !== null ? roundMoney(marginPercent - tacos) : null;

  let adsCostPerUnit: number | null = null;
  let adsCostImputed: number | null = null;

  if (adsCost !== null && adsCost > 0) {
    if (unitsSold !== null && unitsSold > 0) {
      adsCostPerUnit = roundMoney(adsCost / unitsSold);
    }
    if (salePrice > 0 && tacosPercent !== null) {
      adsCostImputed = roundMoney(salePrice * (tacosPercent / 100));
    }
  } else {
    adsCostImputed = 0;
    adsCostPerUnit = 0;
  }

  const adsDeduction =
    adsCostPerUnit !== null && adsCostPerUnit > 0
      ? adsCostPerUnit
      : (adsCostImputed ?? 0);

  const marginAfterAdsValue = roundMoney(marginValue - adsDeduction);

  const adsLine: FinancialMarginLine = {
    key: "ads",
    label: "Publicidade (TACOS)",
    value: adsDeduction,
    percentOfSale: percentOfSale(adsDeduction, salePrice),
  };

  const marginAfterAdsLine: FinancialMarginLine = {
    key: "marginAfterAds",
    label: "Margem após ADS",
    value: marginAfterAdsValue,
    percentOfSale: percentOfSale(marginAfterAdsValue, salePrice),
  };

  return {
    marginAfterAdsPercent,
    marginAfterAdsValue,
    adsCostPerUnit,
    adsCostImputed,
    extendedLines: [...marginBreakdown.lines, adsLine, marginAfterAdsLine],
  };
}

export type MarginBasis = "contribution" | "afterAds";

export type MinSalePriceInput = {
  salePrice: number;
  mlFeeAmount: number;
  mlFeeRebate?: number;
  shippingCost: number;
  productCost: number | null;
  extraCosts: number | null;
  taxRatePercent: number | null;
  targetMarginPercent: number;
  marginBasis: MarginBasis;
  tacosPercent?: number | null;
  /** Margem de contribuição atual (breakdown); usada para alreadyMeetsTarget. */
  currentContributionMarginPercent?: number | null;
  /** Margem pós ADS atual; usada quando marginBasis é afterAds. */
  currentAfterAdsMarginPercent?: number | null;
};

export type MinSalePriceReason =
  | "ok"
  | "missing_product_cost"
  | "impossible"
  | "incomplete";

export type MinSalePriceResult = {
  minSalePrice: number | null;
  currentMarginPercent: number | null;
  alreadyMeetsTarget: boolean;
  reason: MinSalePriceReason;
};

export function computeMinSalePriceForTargetMargin(
  input: MinSalePriceInput,
): MinSalePriceResult {
  const salePrice = input.salePrice;
  if (
    !Number.isFinite(salePrice) ||
    salePrice <= 0 ||
    !Number.isFinite(input.mlFeeAmount) ||
    !Number.isFinite(input.shippingCost)
  ) {
    return {
      minSalePrice: null,
      currentMarginPercent: null,
      alreadyMeetsTarget: false,
      reason: "incomplete",
    };
  }

  if (input.productCost === null || !Number.isFinite(input.productCost)) {
    return {
      minSalePrice: null,
      currentMarginPercent: null,
      alreadyMeetsTarget: false,
      reason: "missing_product_cost",
    };
  }

  const mlFeeRebate = roundMoney(
    Math.min(
      Math.max(0, input.mlFeeRebate ?? 0),
      Math.max(0, input.mlFeeAmount),
    ),
  );
  const netMlFee = roundMoney(Math.max(0, input.mlFeeAmount - mlFeeRebate));
  const shippingCost = roundMoney(Math.max(0, input.shippingCost));
  const productCost = roundMoney(Math.max(0, input.productCost));
  const extraCosts =
    input.extraCosts !== null && Number.isFinite(input.extraCosts)
      ? roundMoney(Math.max(0, input.extraCosts))
      : 0;
  const taxRate = input.taxRatePercent ?? 0;

  const variableRate =
    (netMlFee + shippingCost) / salePrice +
    taxRate / 100 +
    (input.marginBasis === "afterAds" ? (input.tacosPercent ?? 0) / 100 : 0);

  const targetFraction = input.targetMarginPercent / 100;
  const denominator = 1 - variableRate - targetFraction;

  const currentMarginPercent =
    input.marginBasis === "afterAds"
      ? input.currentAfterAdsMarginPercent ?? null
      : input.currentContributionMarginPercent ?? null;

  if (denominator <= 0) {
    return {
      minSalePrice: null,
      currentMarginPercent,
      alreadyMeetsTarget: false,
      reason: "impossible",
    };
  }

  const fixedCosts = roundMoney(productCost + extraCosts);
  const minSalePrice = roundMoney(fixedCosts / denominator);

  const alreadyMeetsTarget =
    currentMarginPercent !== null &&
    currentMarginPercent >= input.targetMarginPercent;

  return {
    minSalePrice,
    currentMarginPercent,
    alreadyMeetsTarget,
    reason: "ok",
  };
}

export function marginBasisLabel(basis: MarginBasis): string {
  return basis === "afterAds" ? "margem pós ADS" : "margem de contribuição";
}
