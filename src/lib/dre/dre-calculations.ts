import { roundMoney } from "@/lib/financial-margin";

export type DreLineAmounts = {
  revenueMl: number;
  cancelledSalesMl: number;
  saleFeeMl: number;
  partialReturnsMl: number;
  productCostErp: number;
  taxErp: number;
  sellerShippingMl: number;
  fullShippingMl: number;
  fullStorageMl: number;
  fullNonComplianceMl: number;
};

export type DreBillingSource = "billing" | "fallback";

/** Valores de pedidos cancelados para visão compatível com o painel ML. */
export type DreCancelledIncludeOverlay = {
  revenueGross: number;
  productCostErp: number;
  taxErp: number;
};

export type DreMonthSnapshotPayload = DreLineAmounts & {
  adsCost: number;
  billingSource: DreBillingSource;
  isPartial: boolean;
  incompleteProductCostCount: number;
  syncWarnings: string[];
  cancelledIncludeOverlay?: DreCancelledIncludeOverlay;
};

export type DreManualCostInput = {
  costItemId: string;
  amount: number;
};

/** @deprecated use DreManualCostInput */
export type DreFixedCostInput = DreManualCostInput;

export type DreComputedTotals = {
  totalEntrada: number;
  totalCustoOperacional: number;
  margemContribuicao: number;
  margemContribuicaoPercent: number | null;
  totalCustoFixoManual: number;
  totalCustoOperacionalManual: number;
  totalInvestimentoManual: number;
  adsCost: number;
  totalCustoFixo: number;
  totalInvestimento: number;
  lucroOperacionalAntesInvestimentos: number;
  lucroOperacionalAntesInvestimentosPercent: number | null;
  lucroOperacional: number;
  lucroOperacionalPercent: number | null;
};

const OPERATIONAL_LINE_KEYS: (keyof DreLineAmounts)[] = [
  "cancelledSalesMl",
  "saleFeeMl",
  "partialReturnsMl",
  "productCostErp",
  "taxErp",
  "sellerShippingMl",
  "fullShippingMl",
  "fullStorageMl",
  "fullNonComplianceMl",
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
  fixedCosts: DreManualCostInput[],
  operationalCosts: DreManualCostInput[] = [],
  investmentCosts: DreManualCostInput[] = [],
): DreComputedTotals {
  const revenueMl = roundMoney(Math.max(0, lines.revenueMl));
  const totalEntrada = revenueMl;

  let totalCustoOperacional = 0;
  for (const key of OPERATIONAL_LINE_KEYS) {
    totalCustoOperacional += lines[key] ?? 0;
  }

  let totalCustoOperacionalManual = 0;
  for (const row of operationalCosts) {
    totalCustoOperacionalManual += Math.max(0, row.amount);
  }
  totalCustoOperacionalManual = roundMoney(-totalCustoOperacionalManual);

  const ads = roundMoney(Math.max(0, adsCost));

  totalCustoOperacional = roundMoney(
    totalCustoOperacional + totalCustoOperacionalManual - ads,
  );

  const margemContribuicao = roundMoney(totalEntrada + totalCustoOperacional);
  const margemContribuicaoPercent = percentOfRevenue(
    margemContribuicao,
    totalEntrada,
  );

  let totalCustoFixoManual = 0;
  for (const row of fixedCosts) {
    totalCustoFixoManual += Math.max(0, row.amount);
  }
  totalCustoFixoManual = roundMoney(totalCustoFixoManual);

  const totalCustoFixo = roundMoney(-totalCustoFixoManual);
  const lucroOperacionalAntesInvestimentos = roundMoney(
    margemContribuicao + totalCustoFixo,
  );
  const lucroOperacionalAntesInvestimentosPercent = percentOfRevenue(
    lucroOperacionalAntesInvestimentos,
    totalEntrada,
  );

  let totalInvestimentoManual = 0;
  for (const row of investmentCosts) {
    totalInvestimentoManual += Math.max(0, row.amount);
  }
  totalInvestimentoManual = roundMoney(totalInvestimentoManual);

  const totalInvestimento = roundMoney(-totalInvestimentoManual);
  const lucroOperacional = roundMoney(
    lucroOperacionalAntesInvestimentos + totalInvestimento,
  );
  const lucroOperacionalPercent = percentOfRevenue(
    lucroOperacional,
    totalEntrada,
  );

  return {
    totalEntrada,
    totalCustoOperacional,
    margemContribuicao,
    margemContribuicaoPercent,
    totalCustoFixoManual,
    totalCustoOperacionalManual,
    totalInvestimentoManual,
    adsCost: ads,
    totalCustoFixo,
    totalInvestimento,
    lucroOperacionalAntesInvestimentos,
    lucroOperacionalAntesInvestimentosPercent,
    lucroOperacional,
    lucroOperacionalPercent,
  };
}

/**
 * Inclui vendas canceladas no faturamento bruto (como o painel ML), mantendo
 * a linha de canceladas nos custos variáveis para abater o resultado.
 */
export function applyDreIncludeCancelledView(
  lines: DreLineAmounts,
  overlay?: DreCancelledIncludeOverlay | null,
): DreLineAmounts {
  const cancelledLine = lines.cancelledSalesMl ?? 0;
  const revenueAdd =
    overlay && overlay.revenueGross > 0
      ? overlay.revenueGross
      : cancelledLine < 0
        ? Math.abs(cancelledLine)
        : 0;

  if (revenueAdd <= 0) {
    return lines;
  }

  return {
    ...lines,
    revenueMl: roundMoney(lines.revenueMl + revenueAdd),
    productCostErp: roundMoney(
      lines.productCostErp + (overlay?.productCostErp ?? 0),
    ),
    taxErp: roundMoney(lines.taxErp + (overlay?.taxErp ?? 0)),
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
    fullShippingMl: 0,
    fullStorageMl: 0,
    fullNonComplianceMl: 0,
  };
  for (const month of months) {
    for (const key of OPERATIONAL_LINE_KEYS) {
      out[key] = roundMoney(out[key] + (month[key] ?? 0));
    }
    out.revenueMl = roundMoney(out.revenueMl + (month.revenueMl ?? 0));
  }
  return out;
}
