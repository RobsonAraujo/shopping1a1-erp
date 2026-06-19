import { roundMoney } from "@/lib/financial-margin";
import {
  agregarPorSku,
  consolidarRelatorio,
} from "@/lib/tax-report/aggregation/agregador-por-sku";
import { calcularCbsIbsInformativo } from "@/lib/tax-report/calculators/cbs-ibs";
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
import type { SkuAliasMap } from "@/lib/product-sku-alias";
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
}): DetalhamentoTributario {
  const { transacao, config, icmsRates, cbsIbsVigencia, year, incluirNaApuracao } =
    input;

  if (!incluirNaApuracao) {
    return {
      transacao,
      pisCofins: null,
      icmsDifal: null,
      icmsCreditoCompra: null,
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
  });
  const icmsCreditoCompra = calcularIcmsCreditoCompra(transacao);
  const cmvTotal =
    (transacao.custoAquisicaoUnitario ?? 0) * transacao.quantidade +
    transacao.extraCostsUnitario * transacao.quantidade;
  const impostosOperacionais =
    (pisCofins?.liquido ?? 0) + (icmsDifal?.icmsTotal ?? 0);
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
    `Margem operacional: R$ ${margemOperacionalEstimada.toFixed(2)}`,
  ];

  return {
    transacao,
    pisCofins,
    icmsDifal,
    icmsCreditoCompra,
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
  aliasMap?: SkuAliasMap;
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
    });
  });

  const porSku = agregarPorSku(detalhes, input.aliasMap);
  const consolidado = consolidarRelatorio(detalhes);

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
