import type { FinancialEvaluationRow } from "@/lib/lucratividade/financial-evaluation-data";
import { marginExclusionReason } from "@/lib/lucratividade/margin-summary";

/**
 * Lucratividade por produto: as opções de venda (Clássico, Premium… do mesmo
 * produto físico) viram uma linha do produto, com as opções dentro. É só a
 * apresentação — o resumo do topo continua sobre as linhas dos anúncios, com
 * os mesmos números.
 */

export type EvaluationProductGroup = {
  /** Anúncio principal do produto. */
  key: string;
  /** Linhas das opções, na ordem em que a tabela já as ordenou. */
  rows: FinancialEvaluationRow[];
};

/**
 * Agrupa as linhas já ordenadas pelo principal, mantendo a ordem: o produto
 * aparece onde aparece a primeira das suas opções.
 */
export function groupEvaluationRowsByProduct(
  sortedRows: readonly FinancialEvaluationRow[],
): EvaluationProductGroup[] {
  const byKey = new Map<string, EvaluationProductGroup>();
  const groups: EvaluationProductGroup[] = [];
  for (const row of sortedRows) {
    const key = row.principalMlItemId ?? row.mlItemId;
    const existing = byKey.get(key);
    if (existing) {
      existing.rows.push(row);
      continue;
    }
    const group = { key, rows: [row] };
    byKey.set(key, group);
    groups.push(group);
  }
  return groups;
}

export type ProductGroupAggregate = {
  /** Linha que representa o produto (o principal, se está na lista). */
  lead: FinancialEvaluationRow;
  units: number;
  revenue: number;
  /** Período: faturamento ÷ unidades. Simulação: o preço do principal. */
  price: number | null;
  marginPercent: number | null;
  /** Por unidade. */
  marginValue: number | null;
  afterAdsPercent: number | null;
  afterAdsValue: number | null;
  afterAdsAvailable: boolean;
  pending: boolean;
  /** Nenhuma opção entra na média (sem custo, sem imposto…). */
  allExcluded: boolean;
};

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * Números da linha do produto:
 * - **período:** unidades e faturamento somados; margem ponderada pela venda
 *   de cada opção (Σ margem R$ ÷ Σ venda), como o resumo do topo;
 * - **simulação** (preço de hoje, sem vendas): os números do principal.
 */
export function aggregateProductGroup(
  group: EvaluationProductGroup,
  isSimulation: boolean,
): ProductGroupAggregate {
  const lead = group.rows.find((row) => row.mlItemId === group.key) ?? group.rows[0];
  const pending = group.rows.some((row) => row.pending);
  const included = group.rows.filter((row) => !row.pending && marginExclusionReason(row) === null);
  const allExcluded = !pending && included.length === 0;
  const units = group.rows.reduce((sum, row) => sum + (row.periodUnitsSold ?? 0), 0);
  const revenue = group.rows.reduce((sum, row) => sum + (row.periodRevenue ?? 0), 0);

  if (isSimulation) {
    return {
      lead,
      units,
      revenue,
      price: lead.pending ? null : lead.salePrice,
      marginPercent: lead.breakdown?.marginPercent ?? null,
      marginValue: lead.breakdown?.marginValue ?? null,
      afterAdsPercent: lead.marginAfterAdsPercent,
      afterAdsValue: lead.marginAfterAdsValue,
      afterAdsAvailable: lead.adsMetricsAvailable,
      pending: Boolean(lead.pending),
      allExcluded: marginExclusionReason(lead) !== null,
    };
  }

  let marginTotal = 0;
  let saleBase = 0;
  let marginUnits = 0;
  let afterAdsTotal = 0;
  let afterAdsBase = 0;
  let afterAdsUnits = 0;
  for (const row of included) {
    const rowUnits = row.periodUnitsSold ?? 0;
    if (rowUnits <= 0 || !row.breakdown) continue;
    marginTotal += row.breakdown.marginValue * rowUnits;
    saleBase += row.breakdown.salePrice * rowUnits;
    marginUnits += rowUnits;
    if (row.adsMetricsAvailable && row.marginAfterAdsValue !== null) {
      afterAdsTotal += row.marginAfterAdsValue * rowUnits;
      afterAdsBase += row.breakdown.salePrice * rowUnits;
      afterAdsUnits += rowUnits;
    }
  }

  return {
    lead,
    units,
    revenue,
    price: units > 0 ? round2(revenue / units) : null,
    marginPercent: saleBase > 0 ? round2((marginTotal / saleBase) * 100) : null,
    marginValue: marginUnits > 0 ? round2(marginTotal / marginUnits) : null,
    afterAdsPercent: afterAdsBase > 0 ? round2((afterAdsTotal / afterAdsBase) * 100) : null,
    afterAdsValue: afterAdsUnits > 0 ? round2(afterAdsTotal / afterAdsUnits) : null,
    afterAdsAvailable: afterAdsUnits > 0,
    pending,
    allExcluded,
  };
}
