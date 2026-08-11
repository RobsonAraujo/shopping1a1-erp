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

/** Auditoria do Custo produto: quantidade vendida e custo por SKU/anúncio no mês. */
export type DreProductCostBreakdownItem = {
  key: string;
  sku: string | null;
  title: string;
  quantity: number;
  unitCost: number;
  totalCost: number;
  missingCost: boolean;
};

/** Auditoria do Imposto ML: faturamento, % de imposto aplicado e imposto total por SKU/anúncio no mês. */
export type DreTaxBreakdownItem = {
  key: string;
  sku: string | null;
  title: string;
  quantity: number;
  revenue: number;
  taxPercent: number | null;
  totalTax: number;
  missingTax: boolean;
};

/** Auditoria genérica (quantidade + valor) por SKU/anúncio, usada por linhas mais simples (faturamento, canceladas, tarifas, frete, ADS). */
export type DreLineBreakdownItem = {
  key: string;
  sku: string | null;
  title: string;
  quantity: number | null;
  amount: number;
};

export type DreMonthSnapshotPayload = DreLineAmounts & {
  adsCost: number;
  billingSource: DreBillingSource;
  isPartial: boolean;
  incompleteProductCostCount: number;
  syncWarnings: string[];
  cancelledIncludeOverlay?: DreCancelledIncludeOverlay;
  productCostBreakdown?: DreProductCostBreakdownItem[];
  taxBreakdown?: DreTaxBreakdownItem[];
  revenueBreakdown?: DreLineBreakdownItem[];
  cancelledSalesBreakdown?: DreLineBreakdownItem[];
  saleFeeBreakdown?: DreLineBreakdownItem[];
  sellerShippingBreakdown?: DreLineBreakdownItem[];
  adsCostBreakdown?: DreLineBreakdownItem[];
  /** true quando Full envios/inconformidade vieram dos envios já importados no Relatório Full deste mês (mais confiável que o total consolidado da fatura). */
  fullReportSourced?: boolean;
};

/** Linhas do snapshot que podem ser editadas manualmente na grade do DRE. */
export const DRE_EDITABLE_LINE_KEYS = [
  "revenueMl",
  "cancelledSalesMl",
  "saleFeeMl",
  "productCostErp",
  "taxErp",
  "sellerShippingMl",
  "fullShippingMl",
  "fullStorageMl",
  "fullNonComplianceMl",
  "adsCost",
] as const;

export type DreEditableLineKey = (typeof DRE_EDITABLE_LINE_KEYS)[number];

export function isDreEditableLineKey(key: string): key is DreEditableLineKey {
  return (DRE_EDITABLE_LINE_KEYS as readonly string[]).includes(key);
}

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

/** Combina listas de auditoria do Custo produto (ex.: pedidos pagos + cancelados, ou vários meses), somando por SKU/anúncio. */
export function mergeProductCostBreakdowns(
  lists: DreProductCostBreakdownItem[][],
): DreProductCostBreakdownItem[] {
  const byKey = new Map<string, DreProductCostBreakdownItem>();
  for (const list of lists) {
    for (const item of list) {
      const existing = byKey.get(item.key);
      if (!existing) {
        byKey.set(item.key, { ...item });
        continue;
      }
      existing.quantity += item.quantity;
      existing.totalCost = roundMoney(existing.totalCost + item.totalCost);
      existing.unitCost =
        existing.quantity > 0
          ? roundMoney(existing.totalCost / existing.quantity)
          : 0;
      existing.missingCost = existing.missingCost || item.missingCost;
    }
  }
  return [...byKey.values()].sort((a, b) => b.totalCost - a.totalCost);
}

/** Junta a auditoria do Custo produto de todos os meses do ano em uma única lista por SKU/anúncio. */
export function getYearProductCostBreakdown(
  months: Array<{ productCostBreakdown: DreProductCostBreakdownItem[] | null }>,
): DreProductCostBreakdownItem[] {
  const lists = months
    .map((month) => month.productCostBreakdown)
    .filter((list): list is DreProductCostBreakdownItem[] => list !== null);
  return mergeProductCostBreakdowns(lists);
}

/** Combina listas de auditoria do Imposto ML (ex.: pedidos pagos + cancelados, ou vários meses), somando por SKU/anúncio. */
export function mergeTaxBreakdowns(
  lists: DreTaxBreakdownItem[][],
): DreTaxBreakdownItem[] {
  const byKey = new Map<string, DreTaxBreakdownItem>();
  for (const list of lists) {
    for (const item of list) {
      const existing = byKey.get(item.key);
      if (!existing) {
        byKey.set(item.key, { ...item });
        continue;
      }
      existing.quantity += item.quantity;
      existing.revenue = roundMoney(existing.revenue + item.revenue);
      existing.totalTax = roundMoney(existing.totalTax + item.totalTax);
      existing.taxPercent =
        existing.revenue > 0
          ? roundMoney((existing.totalTax / existing.revenue) * 100)
          : null;
      existing.missingTax = existing.missingTax || item.missingTax;
    }
  }
  return [...byKey.values()].sort((a, b) => b.totalTax - a.totalTax);
}

/** Junta a auditoria do Imposto ML de todos os meses do ano em uma única lista por SKU/anúncio. */
export function getYearTaxBreakdown(
  months: Array<{ taxBreakdown: DreTaxBreakdownItem[] | null }>,
): DreTaxBreakdownItem[] {
  const lists = months
    .map((month) => month.taxBreakdown)
    .filter((list): list is DreTaxBreakdownItem[] => list !== null);
  return mergeTaxBreakdowns(lists);
}

/** Combina listas de auditoria genérica (ex.: pedidos pagos + cancelados, ou vários meses), somando por SKU/anúncio. */
export function mergeLineBreakdowns(
  lists: DreLineBreakdownItem[][],
): DreLineBreakdownItem[] {
  const byKey = new Map<string, DreLineBreakdownItem>();
  for (const list of lists) {
    for (const item of list) {
      const existing = byKey.get(item.key);
      if (!existing) {
        byKey.set(item.key, { ...item });
        continue;
      }
      existing.quantity =
        existing.quantity === null && item.quantity === null
          ? null
          : (existing.quantity ?? 0) + (item.quantity ?? 0);
      existing.amount = roundMoney(existing.amount + item.amount);
    }
  }
  return [...byKey.values()].sort((a, b) => b.amount - a.amount);
}

/** Junta uma auditoria genérica de todos os meses do ano em uma única lista por SKU/anúncio. */
export function getYearLineBreakdown(
  lists: Array<DreLineBreakdownItem[] | null>,
): DreLineBreakdownItem[] {
  const nonNull = lists.filter(
    (list): list is DreLineBreakdownItem[] => list !== null,
  );
  return mergeLineBreakdowns(nonNull);
}
