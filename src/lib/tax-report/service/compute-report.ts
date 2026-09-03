import { roundMoney } from "@/lib/pricing/financial-margin";
import {
  agregarPorSku,
  consolidarRelatorio,
} from "@/lib/tax-report/aggregation/agregador-por-sku";
import { calcularCbsIbsInformativo } from "@/lib/tax-report/calculators/cbs-ibs";
import {
  buildCreditoOutrasDespesasMemoria,
  calcularCreditoOutrasDespesas,
} from "@/lib/tax-report/calculators/credito-outras-despesas";
import {
  buildIcmsCreditoMemoria,
  calcularIcmsCreditoCompra,
} from "@/lib/tax-report/calculators/icms-credito-compra";
import {
  buildIcmsMemoria,
  calcularIcmsDifal,
  icmsDestacadoParaBase,
} from "@/lib/tax-report/calculators/icms-difal";
import {
  buildPisCofinsMemoria,
  calcularPisCofins,
} from "@/lib/tax-report/calculators/pis-cofins";
import type { CbsIbsVigenciaRow } from "@/lib/tax-report/calculators/cbs-ibs";
import type { ItemAdMetrics } from "@/lib/mercadolibre/product-ads-metrics";
import type {
  DetalhamentoTributario,
  IcmsRateRow,
  ManualFiscalOverride,
  TaxCompanyConfig,
  TaxReportPayload,
  TransacaoVenda,
} from "@/lib/tax-report/types";

export function calcularDetalhamentoTransacao(input: {
  transacao: TransacaoVenda;
  config: TaxCompanyConfig;
  icmsRates: Map<string, IcmsRateRow>;
  cbsIbsVigencia: CbsIbsVigenciaRow | null;
  year: number;
  incluirNaApuracao: boolean;
  adsMetricsByItem?: Map<string, ItemAdMetrics>;
  receitaTotalByItem?: Map<string, number>;
  /** Receita total do mês inteiro (todas as vendas) — denominador do rateio do crédito de custos fixos. */
  receitaTotalMes?: number;
  /** Base do crédito de custos fixos do mês, já reduzida pelos dias corridos se em andamento. */
  custosFixosBaseMes?: number;
}): DetalhamentoTributario {
  const { transacao, config, icmsRates, cbsIbsVigencia, year, incluirNaApuracao } =
    input;

  if (!incluirNaApuracao) {
    return {
      transacao,
      pisCofins: null,
      icmsDifal: null,
      icmsCreditoCompra: null,
      creditoOutrasDespesas: null,
      cbsIbs: null,
      impostoTotal: 0,
      margemOperacionalEstimada: 0,
      incluidoNaApuracao: false,
      memoriaCalculo: [
        transacao.dadosFiscaisIndisponiveis
          ? "Dados fiscais indisponíveis — venda excluída da apuração."
          : "Venda excluída da apuração.",
      ],
    };
  }

  const icmsDifal = calcularIcmsDifal({
    transacao,
    ufOrigem: config.originUf,
    rates: icmsRates,
  });
  const icmsDestacado = icmsDestacadoParaBase(icmsDifal);
  const pisCofins = calcularPisCofins({
    transacao,
    config,
    icmsDestacado,
    isOperacaoInterna: icmsDifal?.isOperacaoInterna ?? true,
  });
  const icmsCreditoCompra = calcularIcmsCreditoCompra(
    transacao,
    icmsDifal?.isOperacaoInterna ?? true,
    config.considerIcmsStRecuperavel,
  );
  const creditoOutrasDespesas = calcularCreditoOutrasDespesas({
    saleFee: transacao.saleFee,
    receitaBrutaVenda: transacao.receitaBruta,
    receitaTotalItemMes: input.receitaTotalByItem?.get(transacao.itemId) ?? 0,
    gastoAdsTotalItemMes:
      input.adsMetricsByItem?.get(transacao.itemId)?.cost ?? 0,
    freightCost: transacao.freightCost,
    receitaTotalMes: input.receitaTotalMes ?? 0,
    custosFixosBaseMes: input.custosFixosBaseMes ?? 0,
  });
  const cmvTotal =
    (transacao.custoAquisicaoUnitario ?? 0) * transacao.quantidade +
    transacao.extraCostsUnitario * transacao.quantidade;
  const icmsLiquido =
    (icmsDifal?.icmsTotal ?? 0) - (icmsCreditoCompra?.creditoTotal ?? 0);
  const impostosOperacionais =
    (pisCofins?.liquido ?? 0) + icmsLiquido - creditoOutrasDespesas.creditoTotal;
  const cbsIbs = calcularCbsIbsInformativo(
    transacao.receitaBruta,
    year,
    cbsIbsVigencia,
  );

  const impostoTotal = roundMoney(impostosOperacionais);
  const margemOperacionalEstimada = roundMoney(
    transacao.receitaBruta - cmvTotal - impostosOperacionais,
  );

  const memoriaCalculo = [
    `Receita bruta: R$ ${transacao.receitaBruta.toFixed(2)}`,
    ...(icmsDifal ? buildIcmsMemoria(icmsDifal) : []),
    ...buildIcmsCreditoMemoria(icmsCreditoCompra),
    ...(pisCofins ? buildPisCofinsMemoria(pisCofins, config) : []),
    ...buildCreditoOutrasDespesasMemoria(creditoOutrasDespesas),
    `Margem operacional: R$ ${margemOperacionalEstimada.toFixed(2)}`,
  ];

  return {
    transacao,
    pisCofins,
    icmsDifal,
    icmsCreditoCompra,
    creditoOutrasDespesas,
    cbsIbs,
    impostoTotal,
    margemOperacionalEstimada,
    incluidoNaApuracao: true,
    memoriaCalculo,
  };
}

export function calcularRelatorioFromTransacoes(input: {
  transacoes: TransacaoVenda[];
  config: TaxCompanyConfig;
  icmsRates: Map<string, IcmsRateRow>;
  cbsIbsVigencia: CbsIbsVigenciaRow | null;
  year: number;
  month: number;
  overrides: Record<string, ManualFiscalOverride>;
  meta: TaxReportPayload["meta"];
  onComputeProgress?: (current: number, total: number) => void;
  adsMetricsByItem?: Map<string, ItemAdMetrics>;
  receitaTotalByItem?: Map<string, number>;
  /** Receita total do mês inteiro — denominador do rateio do crédito de custos fixos. */
  receitaTotalMes?: number;
  /** Base do crédito de custos fixos do mês, já reduzida pelos dias corridos se em andamento. */
  custosFixosBaseMes?: number;
  /** Base cadastrada antes do rateio por dias corridos (transparência na UI). */
  creditoCustosFixosBaseRegistrada?: number;
  /** Base creditável depois do rateio por dias corridos (transparência na UI). */
  creditoCustosFixosBaseCreditavel?: number;
}): TaxReportPayload {
  const total = input.transacoes.length;
  const detalhes = input.transacoes.map((transacao, index) => {
    const current = index + 1;
    if (
      input.onComputeProgress &&
      (current % 100 === 0 || current === total)
    ) {
      input.onComputeProgress(current, total);
    }

    const hasOverride = Boolean(input.overrides[transacao.transactionKey]);
    const incluir =
      hasOverride || !transacao.dadosFiscaisIndisponiveis;
    return calcularDetalhamentoTransacao({
      transacao,
      config: input.config,
      icmsRates: input.icmsRates,
      cbsIbsVigencia: input.cbsIbsVigencia,
      year: input.year,
      incluirNaApuracao: incluir,
      adsMetricsByItem: input.adsMetricsByItem,
      receitaTotalByItem: input.receitaTotalByItem,
      receitaTotalMes: input.receitaTotalMes,
      custosFixosBaseMes: input.custosFixosBaseMes,
    });
  });

  const porSku = agregarPorSku(detalhes);
  const consolidado = consolidarRelatorio(detalhes, {
    creditoCustosFixosBaseRegistrada: input.creditoCustosFixosBaseRegistrada,
    creditoCustosFixosBaseCreditavel: input.creditoCustosFixosBaseCreditavel,
  });

  return {
    year: input.year,
    month: input.month,
    consolidado,
    porSku,
    transacoes: detalhes,
    overrides: input.overrides,
    meta: input.meta,
  };
}
