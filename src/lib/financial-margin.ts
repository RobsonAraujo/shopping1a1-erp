export type FinancialMarginLineKey =
  | "mlFee"
  | "shipping"
  | "productCost"
  | "extraCosts"
  | "tax"
  | "totalCosts"
  | "salePrice"
  | "margin";

export type FinancialMarginLine = {
  key: FinancialMarginLineKey;
  label: string;
  value: number;
  percentOfSale: number | null;
};

export type FinancialMarginInput = {
  salePrice: number;
  mlFeeAmount: number;
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
    mlFeeAmount + shippingCost + productCostValue + extraCostsValue + taxAmount,
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
