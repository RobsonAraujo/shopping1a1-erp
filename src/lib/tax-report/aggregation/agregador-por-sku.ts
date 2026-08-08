import { roundMoney } from "@/lib/financial-margin";
import { normalizeProductSku } from "@/lib/product-pricing";
import {
  getAliasSkusForCanonical,
  resolveCanonicalSku,
  type SkuAliasMap,
} from "@/lib/product-sku-alias";
import { consolidarApuracao } from "@/lib/tax-report/aggregation/consolidar-apuracao";
import { icmsSemDifal } from "@/lib/tax-report/calculators/icms-difal";
import type {
  DetalhamentoTributario,
  RelatorioConsolidado,
  SkuAggregation,
} from "@/lib/tax-report/types";

function impostoOperacionalLinhaValor(det: DetalhamentoTributario): number {
  return (
    (det.pisCofins?.liquido ?? 0) +
    (det.icmsDifal?.icmsTotal ?? 0) -
    (det.icmsCreditoCompra?.creditoTotal ?? 0) -
    (det.creditoOutrasDespesas?.creditoTotal ?? 0)
  );
}

function aggregationSkuKey(
  det: DetalhamentoTributario,
  aliasMap?: SkuAliasMap,
): string {
  const raw = det.transacao.sku || "(sem SKU)";
  if (raw === "(sem SKU)") return raw;
  const normalized = normalizeProductSku(raw);
  return resolveCanonicalSku(normalized, aliasMap) || normalized || raw;
}

export function agregarPorSku(
  transacoes: DetalhamentoTributario[],
  aliasMap?: SkuAliasMap,
): SkuAggregation[] {
  const map = new Map<string, SkuAggregation>();

  for (const det of transacoes) {
    if (!det.incluidoNaApuracao) continue;
    const sku = aggregationSkuKey(det, aliasMap);
    const existing = map.get(sku) ?? {
      sku,
      skuAliases: getAliasSkusForCanonical(sku, aliasMap),
      quantidadeVendas: 0,
      unidadesVendidas: 0,
      receitaTotal: 0,
      impostoTotal: 0,
      impostoMedioPorVenda: 0,
      impostoMedioPercentual: 0,
      impostoOperacionalTotal: 0,
      impostoOperacionalMedioPorVenda: 0,
      impostoOperacionalMedioPercentual: 0,
      creditoOutrasDespesasTotal: 0,
      creditoCustosFixosTotal: 0,
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
    existing.creditoOutrasDespesasTotal = roundMoney(
      (existing.creditoOutrasDespesasTotal ?? 0) +
        (det.creditoOutrasDespesas?.creditoTotal ?? 0),
    );
    existing.creditoCustosFixosTotal = roundMoney(
      (existing.creditoCustosFixosTotal ?? 0) +
        (det.creditoOutrasDespesas?.custosFixos?.credito ?? 0),
    );
    existing.transacoes.push(det);
    map.set(sku, existing);
  }

  return [...map.values()]
    .map((row) => ({
      ...row,
      skuAliases: getAliasSkusForCanonical(row.sku, aliasMap),
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
  options: {
    creditoCustosFixosBaseRegistrada?: number;
    creditoCustosFixosBaseCreditavel?: number;
  } = {},
): RelatorioConsolidado {
  const creditoCustosFixosBaseRegistrada = roundMoney(
    options.creditoCustosFixosBaseRegistrada ?? 0,
  );
  const creditoCustosFixosBaseCreditavel = roundMoney(
    options.creditoCustosFixosBaseCreditavel ?? 0,
  );
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
  const icmsSemDifalTotal = roundMoney(
    incluidas.reduce((s, t) => s + icmsSemDifal(t.icmsDifal), 0),
  );
  const difalTotal = roundMoney(
    incluidas.reduce((s, t) => s + (t.icmsDifal?.difal ?? 0), 0),
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
  const icmsCreditoCompraTotal = roundMoney(
    incluidas.reduce((s, t) => s + (t.icmsCreditoCompra?.creditoTotal ?? 0), 0),
  );
  const creditoOutrasDespesasTotal = roundMoney(
    incluidas.reduce(
      (s, t) => s + (t.creditoOutrasDespesas?.creditoTotal ?? 0),
      0,
    ),
  );
  // Já embutido em creditoOutrasDespesasTotal (é um dos 4 buckets rateados por venda) —
  // não subtrair de novo em impostosOperacionais, só exibir separado pra transparência.
  const creditoCustosFixosTotal = roundMoney(
    incluidas.reduce(
      (s, t) => s + (t.creditoOutrasDespesas?.custosFixos?.credito ?? 0),
      0,
    ),
  );
  const impostosOperacionais = roundMoney(
    pisCofinsLiquido +
      icmsDifalTotal -
      icmsCreditoCompraTotal -
      creditoOutrasDespesasTotal,
  );
  const cmvTotal = roundMoney(
    incluidas.reduce(
      (s, t) =>
        s +
        (t.transacao.custoAquisicaoUnitario ?? 0) * t.transacao.quantidade +
        t.transacao.extraCostsUnitario * t.transacao.quantidade,
      0,
    ),
  );

  const margemOperacional = roundMoney(
    faturamento - cmvTotal - impostosOperacionais,
  );

  return {
    faturamento,
    pisCofinsLiquido,
    apuracao: consolidarApuracao(transacoes),
    icmsSemDifalTotal,
    difalTotal,
    creditoOutrasDespesasTotal,
    creditoCustosFixosTotal,
    creditoCustosFixosBaseRegistrada,
    creditoCustosFixosBaseCreditavel,
    icmsDifalTotal,
    cbsIbsInformativoTotal,
    margemOperacional,
    transacoesIncluidas: incluidas.length,
    transacoesExcluidas: excluidas.length,
    transacoesSemBillingInfo: semBilling.length,
  };
}

export function findSkuAggregation(
  porSku: SkuAggregation[],
  sku: string,
  aliasMap?: SkuAliasMap,
): SkuAggregation | undefined {
  const canonical = resolveCanonicalSku(sku, aliasMap);
  if (!canonical) return undefined;
  return porSku.find((row) => row.sku === canonical);
}
