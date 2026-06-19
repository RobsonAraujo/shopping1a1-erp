import { roundMoney } from "@/lib/financial-margin";
import {
  agregarPorSku,
  consolidarRelatorio,
} from "@/lib/tax-report/aggregation/agregador-por-sku";
import { calcularCbsIbsInformativo } from "@/lib/tax-report/calculators/cbs-ibs";
import {
  buildIcmsMemoria,
  calcularIcmsDifal,
  icmsDestacadoParaBase,
} from "@/lib/tax-report/calculators/icms-difal";
import {
  buildIrpjMemoria,
  consolidarIrpjCslMensal,
  estimarIrpjCslPorTransacao,
} from "@/lib/tax-report/calculators/irpj-csll";
import {
  buildPisCofinsMemoria,
  calcularPisCofins,
} from "@/lib/tax-report/calculators/pis-cofins";
import type { CbsIbsVigenciaRow } from "@/lib/tax-report/calculators/cbs-ibs";
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
      irpjCsll: null,
      cbsIbs: null,
      impostoTotal: 0,
      margemLiquidaEstimada: 0,
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
  const cmvTotal =
    (transacao.custoAquisicaoUnitario ?? 0) * transacao.quantidade +
    transacao.extraCostsUnitario * transacao.quantidade;
  const impostosOperacionais =
    (pisCofins?.liquido ?? 0) + (icmsDifal?.icmsTotal ?? 0);
  const irpjCsll = estimarIrpjCslPorTransacao({
    receitaBruta: transacao.receitaBruta,
    cmvTotal,
    impostosOperacionais,
  });
  const cbsIbs = calcularCbsIbsInformativo(
    transacao.receitaBruta,
    year,
    cbsIbsVigencia,
  );

  const impostoTotal = roundMoney(
    (pisCofins?.liquido ?? 0) +
      (icmsDifal?.icmsTotal ?? 0) +
      irpjCsll.irpjTotal +
      irpjCsll.csll,
  );
  const margemLiquidaEstimada = roundMoney(
    transacao.receitaBruta - cmvTotal - impostoTotal,
  );

  const memoriaCalculo = [
    `Receita bruta: R$ ${transacao.receitaBruta.toFixed(2)}`,
    ...(icmsDifal ? buildIcmsMemoria(icmsDifal) : []),
    ...(pisCofins ? buildPisCofinsMemoria(pisCofins, config) : []),
    ...buildIrpjMemoria(irpjCsll),
  ];

  return {
    transacao,
    pisCofins,
    icmsDifal,
    irpjCsll,
    cbsIbs,
    impostoTotal,
    margemLiquidaEstimada,
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

  const basesLucro = detalhes
    .filter((d) => d.incluidoNaApuracao)
    .map((d) => d.irpjCsll?.baseLucro ?? 0);
  const irpjCsllMensal = consolidarIrpjCslMensal(basesLucro, input.config);

  const detalhesComIrpj = detalhes.map((d) => {
    if (!d.incluidoNaApuracao || !d.irpjCsll) return d;
    return {
      ...d,
      irpjCsll: {
        ...d.irpjCsll,
        irpjAdicional: 0,
        irpjTotal: d.irpjCsll.irpjBase,
      },
      impostoTotal: roundMoney(
        (d.pisCofins?.liquido ?? 0) +
          (d.icmsDifal?.icmsTotal ?? 0) +
          d.irpjCsll.irpjBase +
          d.irpjCsll.csll,
      ),
      margemLiquidaEstimada: roundMoney(
        d.transacao.receitaBruta -
          (d.transacao.custoAquisicaoUnitario ?? 0) * d.transacao.quantidade -
          d.transacao.extraCostsUnitario * d.transacao.quantidade -
          ((d.pisCofins?.liquido ?? 0) +
            (d.icmsDifal?.icmsTotal ?? 0) +
            d.irpjCsll.irpjBase +
            d.irpjCsll.csll),
      ),
    };
  });

  const porSku = agregarPorSku(detalhesComIrpj);
  const consolidado = consolidarRelatorio(
    detalhesComIrpj,
    irpjCsllMensal.irpjTotal,
    irpjCsllMensal.csllTotal,
  );

  return {
    year: input.year,
    month: input.month,
    consolidado,
    porSku,
    transacoes: detalhesComIrpj,
    overrides: input.overrides,
    meta: input.meta,
  };
}
