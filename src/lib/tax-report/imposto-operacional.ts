import { roundMoney } from "@/lib/financial-margin";
import type {
  DetalhamentoTributario,
  RelatorioConsolidado,
  SkuAggregation,
} from "@/lib/tax-report/types";

/** PIS/COFINS líquido + ICMS — sem IRPJ/CSLL. */
export function impostoOperacionalLinha(
  row: DetalhamentoTributario,
): number | null {
  if (!row.incluidoNaApuracao) return null;
  return roundMoney(
    (row.pisCofins?.liquido ?? 0) + (row.icmsDifal?.icmsTotal ?? 0),
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
          (row.icmsDifal?.icmsTotal ?? 0),
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
