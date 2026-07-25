import { roundMoney } from "@/lib/financial-margin";
import type { ApuracaoConsolidada } from "@/lib/tax-report/types";

export type ExtraCostCategory =
  | "frete"
  | "embalagem"
  | "energia"
  | "aluguel"
  | "outro";

export const EXTRA_COST_CATEGORY_LABELS: Record<ExtraCostCategory, string> = {
  frete: "Frete de venda",
  embalagem: "Embalagem",
  energia: "Energia elétrica",
  aluguel: "Aluguel",
  outro: "Outro",
};

export type MonthlyExtraCost = {
  id: string;
  descricao: string;
  categoria: ExtraCostCategory;
  valor: number;
};

/**
 * Cadastro de custos mensais (frete, embalagem, energia, aluguel etc.) que geram
 * crédito de PIS/COFINS não-cumulativo (Lei 10.637/2002, Lei 10.833/2003) mas não
 * têm nota fiscal por SKU — hoje só persistido no navegador via
 * src/hooks/use-persisted-json.ts.
 *
 * TODO(db-migration): migrar para tabela `tax_report_extra_costs`
 * (sellerId, year, month, descricao, categoria, valor) e trocar a leitura/escrita
 * em tax-report-extra-costs-panel.tsx por chamadas a uma rota
 * /api/tax-report/extra-costs, mantendo os mesmos tipos MonthlyExtraCost/ExtraCostCategory.
 */
export function extraCostsStorageKey(year: number, month: number): string {
  return `tax-report-extra-costs:${year}-${month}`;
}

export function sumExtraCosts(costs: MonthlyExtraCost[]): number {
  return roundMoney(costs.reduce((sum, c) => sum + c.valor, 0));
}

export function computeExtraCostsCredit(
  costs: MonthlyExtraCost[],
  pisRatePercent: number,
  cofinsRatePercent: number,
): { pisCredito: number; cofinsCredito: number } {
  const base = sumExtraCosts(costs);
  return {
    pisCredito: roundMoney(base * (pisRatePercent / 100)),
    cofinsCredito: roundMoney(base * (cofinsRatePercent / 100)),
  };
}

function applyCredit(
  linha: { debito: number; credito: number; liquido: number },
  extraCredito: number,
) {
  const credito = roundMoney(linha.credito + extraCredito);
  return {
    ...linha,
    credito,
    liquido: roundMoney(Math.max(0, linha.debito - credito)),
  };
}

export function applyExtraCostsToApuracao(
  apuracao: ApuracaoConsolidada,
  extraCredit: { pisCredito: number; cofinsCredito: number },
): ApuracaoConsolidada {
  const pis = applyCredit(apuracao.pis, extraCredit.pisCredito);
  const cofins = applyCredit(apuracao.cofins, extraCredit.cofinsCredito);
  return {
    ...apuracao,
    pis,
    cofins,
    pisCofinsLiquido: roundMoney(pis.liquido + cofins.liquido),
  };
}
