import { roundMoney } from "@/lib/pricing/financial-margin";
import type {
  DetalhamentoTributario,
  RelatorioConsolidado,
  SkuAggregation,
} from "@/lib/tax-report/types";

/** PIS/COFINS líquido + ICMS líquido (débito da venda − crédito de compra) − crédito Meli/ADS — sem IRPJ/CSLL. */
export function impostoOperacionalLinha(
  row: DetalhamentoTributario,
): number | null {
  if (!row.incluidoNaApuracao) return null;
  return roundMoney(
    (row.pisCofins?.liquido ?? 0) +
      (row.icmsDifal?.icmsTotal ?? 0) -
      (row.icmsCreditoCompra?.creditoTotal ?? 0) -
      (row.creditoOutrasDespesas?.creditoTotal ?? 0),
  );
}

function sumImpostoOperacionalTransacoes(
  transacoes: DetalhamentoTributario[],
): number {
  return roundMoney(
    transacoes
      .filter((row) => row.incluidoNaApuracao)
      .reduce(
        (sum, row) =>
          sum +
          (row.pisCofins?.liquido ?? 0) +
          (row.icmsDifal?.icmsTotal ?? 0) -
          (row.icmsCreditoCompra?.creditoTotal ?? 0) -
          (row.creditoOutrasDespesas?.creditoTotal ?? 0),
        0,
      ),
  );
}

export function skuImpostoOperacionalTotal(sku: SkuAggregation): number {
  if (sku.impostoOperacionalTotal != null) {
    return sku.impostoOperacionalTotal;
  }
  return sumImpostoOperacionalTransacoes(sku.transacoes);
}

export function skuImpostoOperacionalMedio(sku: SkuAggregation): number {
  if (sku.impostoOperacionalMedioPorVenda != null) {
    return sku.impostoOperacionalMedioPorVenda;
  }
  if (sku.quantidadeVendas <= 0) return 0;
  return roundMoney(skuImpostoOperacionalTotal(sku) / sku.quantidadeVendas);
}

export function skuImpostoOperacionalPercentual(sku: SkuAggregation): number {
  if (sku.impostoOperacionalMedioPercentual != null) {
    return sku.impostoOperacionalMedioPercentual;
  }
  if (sku.receitaTotal <= 0) return 0;
  return roundMoney(
    (skuImpostoOperacionalTotal(sku) / sku.receitaTotal) * 100,
  );
}

export function margemOperacionalEstimadaLinha(
  row: DetalhamentoTributario,
): number {
  return row.margemOperacionalEstimada ?? row.margemLiquidaEstimada ?? 0;
}

export function margemOperacionalConsolidado(
  consolidado: RelatorioConsolidado,
): number {
  return consolidado.margemOperacional ?? consolidado.margemLiquida ?? 0;
}

/**
 * PIS/COFINS líquido + ICMS/DIFAL total do consolidado — sem IRPJ/CSLL (não
 * calculados neste motor). Usado pelo simulador Simples x Lucro Real para
 * comparar com o DAS pago; ver disclaimer de "comparação parcial" na UI.
 */
export function impostoOperacionalConsolidado(
  consolidado: RelatorioConsolidado,
): number {
  return roundMoney(
    consolidado.pisCofinsLiquido + consolidado.icmsDifalTotal,
  );
}
