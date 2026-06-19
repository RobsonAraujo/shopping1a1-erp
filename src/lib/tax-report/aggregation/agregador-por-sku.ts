import { roundMoney } from "@/lib/financial-margin";
import type {
  DetalhamentoTributario,
  RelatorioConsolidado,
  SkuAggregation,
} from "@/lib/tax-report/types";

function impostoOperacionalLinhaValor(det: DetalhamentoTributario): number {
  return (det.pisCofins?.liquido ?? 0) + (det.icmsDifal?.icmsTotal ?? 0);
}

export function agregarPorSku(
  transacoes: DetalhamentoTributario[],
): SkuAggregation[] {
  const map = new Map<string, SkuAggregation>();

  for (const det of transacoes) {
    if (!det.incluidoNaApuracao) continue;
    const sku = det.transacao.sku || "(sem SKU)";
    const existing = map.get(sku) ?? {
      sku,
      quantidadeVendas: 0,
      unidadesVendidas: 0,
      receitaTotal: 0,
      impostoTotal: 0,
      impostoMedioPorVenda: 0,
      impostoMedioPercentual: 0,
      impostoOperacionalTotal: 0,
      impostoOperacionalMedioPorVenda: 0,
      impostoOperacionalMedioPercentual: 0,
      transacoes: [],
    };

    existing.quantidadeVendas += 1;
    existing.unidadesVendidas += det.transacao.quantidade;
    existing.receitaTotal = roundMoney(
      existing.receitaTotal + det.transacao.receitaBruta,
    );
    existing.impostoTotal = roundMoney(existing.impostoTotal + det.impostoTotal);
    existing.impostoOperacionalTotal = roundMoney(
      (existing.impostoOperacionalTotal ?? 0) + impostoOperacionalLinhaValor(det),
    );
    existing.transacoes.push(det);
    map.set(sku, existing);
  }

  return [...map.values()]
    .map((row) => ({
      ...row,
      receitaTotal: roundMoney(row.receitaTotal),
      impostoTotal: roundMoney(row.impostoTotal),
      impostoOperacionalTotal: roundMoney(row.impostoOperacionalTotal ?? 0),
      impostoMedioPorVenda:
        row.quantidadeVendas > 0
          ? roundMoney(row.impostoTotal / row.quantidadeVendas)
          : 0,
      impostoMedioPercentual:
        row.receitaTotal > 0
          ? roundMoney((row.impostoTotal / row.receitaTotal) * 100)
          : 0,
      impostoOperacionalMedioPorVenda:
        row.quantidadeVendas > 0
          ? roundMoney((row.impostoOperacionalTotal ?? 0) / row.quantidadeVendas)
          : 0,
      impostoOperacionalMedioPercentual:
        row.receitaTotal > 0
          ? roundMoney(
              ((row.impostoOperacionalTotal ?? 0) / row.receitaTotal) * 100,
            )
          : 0,
    }))
    .sort((a, b) => b.receitaTotal - a.receitaTotal);
}

export function consolidarRelatorio(
  transacoes: DetalhamentoTributario[],
  irpjTotal: number,
  csllTotal: number,
): RelatorioConsolidado {
  const incluidas = transacoes.filter((t) => t.incluidoNaApuracao);
  const excluidas = transacoes.filter((t) => !t.incluidoNaApuracao);
  const semBilling = transacoes.filter(
    (t) => t.transacao.dadosFiscaisIndisponiveis,
  );

  const faturamento = roundMoney(
    incluidas.reduce((s, t) => s + t.transacao.receitaBruta, 0),
  );
  const pisCofinsLiquido = roundMoney(
    incluidas.reduce((s, t) => s + (t.pisCofins?.liquido ?? 0), 0),
  );
  const icmsDifalTotal = roundMoney(
    incluidas.reduce((s, t) => s + (t.icmsDifal?.icmsTotal ?? 0), 0),
  );
  const cbsIbsInformativoTotal = roundMoney(
    incluidas.reduce(
      (s, t) =>
        s + (t.cbsIbs?.valorCbs ?? 0) + (t.cbsIbs?.valorIbs ?? 0),
      0,
    ),
  );
  const impostosSemIrpj = roundMoney(pisCofinsLiquido + icmsDifalTotal);
  const cmvTotal = roundMoney(
    incluidas.reduce(
      (s, t) =>
        s +
        (t.transacao.custoAquisicaoUnitario ?? 0) * t.transacao.quantidade +
        t.transacao.extraCostsUnitario * t.transacao.quantidade,
      0,
    ),
  );

  const margemLiquida = roundMoney(
    faturamento - cmvTotal - impostosSemIrpj - irpjTotal - csllTotal,
  );

  return {
    faturamento,
    pisCofinsLiquido,
    icmsDifalTotal,
    irpjEstimado: irpjTotal,
    csllEstimado: csllTotal,
    cbsIbsInformativoTotal,
    margemLiquida,
    transacoesIncluidas: incluidas.length,
    transacoesExcluidas: excluidas.length,
    transacoesSemBillingInfo: semBilling.length,
  };
}
