import { roundMoney } from "@/lib/financial-margin";

export type DreLineAmounts = {
  revenueMl: number;
  cancelledSalesMl: number;
  saleFeeMl: number;
  partialReturnsMl: number;
  productCostErp: number;
  taxErp: number;
  sellerShippingMl: number;
};

export type DreBillingSource = "billing" | "fallback";

export type DreMonthSnapshotPayload = DreLineAmounts & {
  adsCost: number;
  billingSource: DreBillingSource;
  isPartial: boolean;
  incompleteProductCostCount: number;
  syncWarnings: string[];
};

export type DreFixedCostInput = {
  costItemId: string;
  amount: number;
};

export type DreComputedTotals = {
  totalEntrada: number;
  totalCustoOperacional: number;
  margemContribuicao: number;
  margemContribuicaoPercent: number | null;
  totalCustoFixoManual: number;
  adsCost: number;
  totalCustoFixo: number;
  lucroLiquido: number;
  lucroLiquidoPercent: number | null;
};

const OPERATIONAL_KEYS: (keyof DreLineAmounts)[] = [
  "cancelledSalesMl",
  "saleFeeMl",
  "partialReturnsMl",
  "productCostErp",
  "taxErp",
  "sellerShippingMl",
];

export function percentOfRevenue(
  value: number,
  revenue: number,
): number | null {
  if (revenue <= 0) return null;
  return roundMoney((value / revenue) * 100);
}

export function computeDreTotals(
  lines: DreLineAmounts,
  adsCost: number,
  fixedCosts: DreFixedCostInput[],
): DreComputedTotals {
  const revenueMl = roundMoney(Math.max(0, lines.revenueMl));
  const totalEntrada = revenueMl;

  let totalCustoOperacional = 0;
  for (const key of OPERATIONAL_KEYS) {
    totalCustoOperacional += lines[key] ?? 0;
  }
  totalCustoOperacional = roundMoney(totalCustoOperacional);

  const margemContribuicao = roundMoney(totalEntrada + totalCustoOperacional);
  const margemContribuicaoPercent = percentOfRevenue(
    margemContribuicao,
    totalEntrada,
  );

  const ads = roundMoney(Math.max(0, adsCost));
  let totalCustoFixoManual = 0;
  for (const row of fixedCosts) {
    totalCustoFixoManual += Math.max(0, row.amount);
  }
  totalCustoFixoManual = roundMoney(totalCustoFixoManual);

  const totalCustoFixo = roundMoney(-(totalCustoFixoManual + ads));
  const lucroLiquido = roundMoney(margemContribuicao + totalCustoFixo);
  const lucroLiquidoPercent = percentOfRevenue(lucroLiquido, totalEntrada);

  return {
    totalEntrada,
    totalCustoOperacional,
    margemContribuicao,
    margemContribuicaoPercent,
    totalCustoFixoManual,
    adsCost: ads,
    totalCustoFixo,
    lucroLiquido,
    lucroLiquidoPercent,
  };
}

export function sumYearLineAmounts(
  months: DreLineAmounts[],
): DreLineAmounts {
  const out: DreLineAmounts = {
    revenueMl: 0,
    cancelledSalesMl: 0,
    saleFeeMl: 0,
    partialReturnsMl: 0,
    productCostErp: 0,
    taxErp: 0,
    sellerShippingMl: 0,
  };
  for (const month of months) {
    for (const key of Object.keys(out) as (keyof DreLineAmounts)[]) {
      out[key] = roundMoney(out[key] + (month[key] ?? 0));
    }
  }
  return out;
}
