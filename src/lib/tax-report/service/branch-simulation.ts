import { roundMoney } from "@/lib/financial-margin";
import { getSkuSupplier } from "@/lib/mercadolibre/item-sku";
import { normalizeProductSku } from "@/lib/product-pricing";
import {
  calcularIcmsCreditoCompra,
} from "@/lib/tax-report/calculators/icms-credito-compra";
import {
  aliquotaInternaTotal,
  calcularIcmsDifal,
  icmsDestacadoParaBase,
  obterAliquotaInterestadual,
} from "@/lib/tax-report/calculators/icms-difal";
import { normalizeUf } from "@/lib/tax-report/config";
import { calcularPisCofins } from "@/lib/tax-report/calculators/pis-cofins";
import { impostoOperacionalLinha } from "@/lib/tax-report/imposto-operacional";
import type {
  DetalhamentoTributario,
  IcmsCreditoCompraBreakdown,
  IcmsDifalBreakdown,
  IcmsRateRow,
  PisCofinsBreakdown,
  TaxCompanyConfig,
  TransacaoVenda,
} from "@/lib/tax-report/types";

/**
 * UFs onde a regra atual de alíquota interestadual (Resolução Senado 13/2012,
 * ver `obterAliquotaInterestadual`) é válida como origem — a regra assume
 * origem no Sul/Sudeste para decidir entre 12%/7% conforme o destino.
 */
export const SOUTH_SOUTHEAST_ORIGIN_UFS = ["SP", "RJ", "MG", "ES", "PR", "SC", "RS"] as const;

export type BranchSimulationOriginUf = (typeof SOUTH_SOUTHEAST_ORIGIN_UFS)[number];

export function isSupportedBranchSimulationUf(
  uf: string,
): uf is BranchSimulationOriginUf {
  return (SOUTH_SOUTHEAST_ORIGIN_UFS as readonly string[]).includes(uf);
}

/**
 * Detalhe auditável do incentivo estadual na simulação.
 *
 * O campo da UI (`creditoPresumidoPercent`) é a **carga efetiva alvo** de ICMS
 * próprio da origem sobre a receita (ex.: ~1,4% no TTD/SC) — NÃO um desconto
 * percentual relativo sobre o ICMS. O DIFAL (EC 87/2015, UF destino) não muda.
 */
export type CreditoPresumidoDetalhe = {
  aplicado: boolean;
  motivoNaoAplicado: string | null;
  receitaBase: number;
  aliquotaInterestadualPercent: number;
  /** Carga efetiva alvo informada (ex.: 1,4). 0 = incentivo desligado. */
  cargaEfetivaAlvoPercent: number;
  /** Alíquota interestadual bruta = carga antes do incentivo. */
  cargaEfetivaBrutaPercent: number;
  icmsInterestadualBruto: number;
  creditoPresumidoValor: number;
  icmsInterestadualLiquido: number;
  difal: number;
  icmsTotalComIncentivo: number;
};

export function buildCreditoPresumidoMemoria(
  detalhe: CreditoPresumidoDetalhe,
): string[] {
  const lines: string[] = [
    "Incentivo / crédito presumido (simulação):",
    `Receita base: R$ ${detalhe.receitaBase.toFixed(2)}`,
  ];

  if (detalhe.motivoNaoAplicado && !detalhe.aplicado) {
    lines.push(`Não aplicado: ${detalhe.motivoNaoAplicado}`);
    return lines;
  }

  lines.push(
    `Alíquota interestadual bruta: ${detalhe.aliquotaInterestadualPercent.toFixed(2)}%`,
    `ICMS interestadual bruto: R$ ${detalhe.icmsInterestadualBruto.toFixed(2)}`,
    `Carga efetiva alvo (informada): ${detalhe.cargaEfetivaAlvoPercent.toFixed(2)}% sobre a receita`,
    `ICMS líquido alvo = receita × carga alvo = R$ ${detalhe.icmsInterestadualLiquido.toFixed(2)}`,
    `(−) Crédito presumido = bruto − líquido alvo = R$ ${detalhe.creditoPresumidoValor.toFixed(2)}`,
    `ICMS interestadual líquido: R$ ${detalhe.icmsInterestadualLiquido.toFixed(2)}`,
    `DIFAL (não afetado pelo incentivo): R$ ${detalhe.difal.toFixed(2)}`,
    `ICMS total cenário = líquido + DIFAL = R$ ${detalhe.icmsTotalComIncentivo.toFixed(2)}`,
  );
  return lines;
}

/**
 * Aplica incentivo como **carga efetiva alvo** (%) sobre a receita, apenas no
 * ICMS interestadual próprio da origem. Não reduz DIFAL nem operações internas.
 * `cargaEfetivaAlvoPercent <= 0` desliga o incentivo (sem crédito).
 */
export function aplicarCreditoPresumido(
  icms: IcmsDifalBreakdown,
  cargaEfetivaAlvoPercent: number,
  receitaBruta: number,
): { icms: IcmsDifalBreakdown; detalhe: CreditoPresumidoDetalhe } {
  const alvoClamped = Math.min(100, Math.max(0, cargaEfetivaAlvoPercent));
  const aliquotaInterestadualPercent = roundMoney(icms.aliquotaInterestadual * 100);
  const receitaBase = roundMoney(receitaBruta);

  const base = {
    receitaBase,
    aliquotaInterestadualPercent,
    cargaEfetivaAlvoPercent: roundMoney(alvoClamped),
    cargaEfetivaBrutaPercent: aliquotaInterestadualPercent,
    icmsInterestadualBruto: icms.icmsInterestadual,
    difal: icms.difal,
  };

  if (icms.isOperacaoInterna) {
    return {
      icms,
      detalhe: {
        ...base,
        aplicado: false,
        motivoNaoAplicado:
          "Operação interna — incentivo interestadual (crédito presumido) não se aplica",
        creditoPresumidoValor: 0,
        icmsInterestadualLiquido: icms.icmsInterestadual,
        icmsTotalComIncentivo: icms.icmsTotal,
      },
    };
  }

  if (alvoClamped <= 0) {
    return {
      icms,
      detalhe: {
        ...base,
        aplicado: false,
        motivoNaoAplicado:
          "Carga efetiva alvo = 0% — incentivo desligado (informe a carga efetiva do regime, ex. 1,4 para SC/TTD)",
        creditoPresumidoValor: 0,
        icmsInterestadualLiquido: icms.icmsInterestadual,
        icmsTotalComIncentivo: icms.icmsTotal,
      },
    };
  }

  const liquidoAlvo = roundMoney(receitaBruta * (alvoClamped / 100));
  const bruto = icms.icmsInterestadual;

  if (liquidoAlvo >= bruto) {
    return {
      icms,
      detalhe: {
        ...base,
        aplicado: false,
        motivoNaoAplicado: `Carga alvo (${roundMoney(alvoClamped)}%) ≥ alíquota interestadual (${aliquotaInterestadualPercent}%) — nenhum crédito presumido`,
        creditoPresumidoValor: 0,
        icmsInterestadualLiquido: bruto,
        icmsTotalComIncentivo: icms.icmsTotal,
      },
    };
  }

  const creditoPresumidoValor = roundMoney(bruto - liquidoAlvo);
  const icmsInterestadualLiquido = roundMoney(bruto - creditoPresumidoValor);
  const novoIcms: IcmsDifalBreakdown = {
    ...icms,
    icmsInterestadual: icmsInterestadualLiquido,
    icmsTotal: roundMoney(icmsInterestadualLiquido + icms.difal),
  };

  return {
    icms: novoIcms,
    detalhe: {
      ...base,
      aplicado: true,
      motivoNaoAplicado: null,
      creditoPresumidoValor,
      icmsInterestadualLiquido,
      icmsTotalComIncentivo: novoIcms.icmsTotal,
    },
  };
}

/**
 * Estima a alíquota de ICMS de entrada (%) numa compra do fornecedor direto
 * para a UF alvo da filial — mesma regra usada na venda (Resolução 13/2012),
 * só invertendo o sentido; se fornecedor e filial estiverem na mesma UF, a
 * compra passa a ser interna (alíquota interna da tabela, não a interestadual).
 */
export function estimarIcmsEntradaPercent(input: {
  ufFornecedor: string;
  ufDestino: string;
  mercadoriaImportada: boolean;
  conteudoImportacaoPercentual: number;
  icmsRates: Map<string, IcmsRateRow>;
}): number {
  const origem = normalizeUf(input.ufFornecedor);
  const destino = normalizeUf(input.ufDestino);
  if (!origem || !destino) return 0;

  if (origem === destino) {
    return roundMoney(aliquotaInternaTotal(destino, input.icmsRates) * 100);
  }

  return roundMoney(
    obterAliquotaInterestadual({
      ufOrigem: origem,
      ufDestino: destino,
      mercadoriaImportada: input.mercadoriaImportada,
      conteudoImportacaoPercentual: input.conteudoImportacaoPercentual,
    }) * 100,
  );
}

export type BranchScenarioParams = {
  config: TaxCompanyConfig;
  icmsRates: Map<string, IcmsRateRow>;
  /**
   * Carga efetiva alvo de ICMS próprio da origem (% sobre a receita),
   * ex.: 1,4 para SC/TTD. 0 desliga o incentivo. Nome histórico da API.
   */
  creditoPresumidoPercent: number;
  /** Fornecedor (ver `getSkuSupplier`) -> UF, pra refinar o ICMS de entrada no cenário. */
  supplierUfByFornecedor?: Map<string, string>;
};

export type BranchScenarioLine = {
  icmsDifal: IcmsDifalBreakdown | null;
  icmsCreditoCompra: IcmsCreditoCompraBreakdown;
  pisCofins: PisCofinsBreakdown;
  impostoOperacional: number;
  creditoPresumido: CreditoPresumidoDetalhe | null;
};

/** Info da UF do fornecedor pra exibição na memória de cálculo (mesma lógica de `applySupplierUf`). */
export type EntradaInfo = {
  fornecedor: string;
  ufFornecedor: string;
  isOperacaoInterna: boolean;
  purchaseIcmsPercentEstimado: number;
};

export function buildEntradaInfo(
  transacao: TransacaoVenda,
  params: BranchScenarioParams,
): EntradaInfo | null {
  if (transacao.hasIcmsSt || !params.supplierUfByFornecedor) return null;

  const fornecedor = getSkuSupplier(transacao.sku);
  const ufFornecedor = params.supplierUfByFornecedor.get(fornecedor);
  if (!ufFornecedor) return null;

  const destino = normalizeUf(params.config.originUf);
  const origem = normalizeUf(ufFornecedor);

  return {
    fornecedor,
    ufFornecedor,
    isOperacaoInterna: !!origem && !!destino && origem === destino,
    purchaseIcmsPercentEstimado: estimarIcmsEntradaPercent({
      ufFornecedor,
      ufDestino: params.config.originUf,
      mercadoriaImportada: transacao.mercadoriaImportada,
      conteudoImportacaoPercentual: transacao.conteudoImportacaoPercentual,
      icmsRates: params.icmsRates,
    }),
  };
}

/**
 * Ajusta `purchaseIcmsPercent` da transação quando sabemos a UF do fornecedor
 * daquele SKU — só se aplica a produtos sem ICMS-ST (é o único caso em que
 * `purchaseIcmsPercent` entra no crédito de entrada; ver
 * `purchaseIcmsCreditUnit`/`purchasePisCofinsCreditBaseUnit`).
 */
function applySupplierUf(
  transacao: TransacaoVenda,
  params: BranchScenarioParams,
): TransacaoVenda {
  const entradaInfo = buildEntradaInfo(transacao, params);
  if (!entradaInfo) return transacao;
  return { ...transacao, purchaseIcmsPercent: entradaInfo.purchaseIcmsPercentEstimado };
}

/** Recalcula o imposto operacional de uma venda com uma UF de origem alternativa. */
export function computeScenarioForTransacao(
  transacao: TransacaoVenda,
  params: BranchScenarioParams,
): BranchScenarioLine {
  const { config, icmsRates, creditoPresumidoPercent } = params;

  const icmsDifalBase = calcularIcmsDifal({
    transacao,
    ufOrigem: config.originUf,
    rates: icmsRates,
  });

  let icmsDifal: IcmsDifalBreakdown | null = null;
  let creditoPresumido: CreditoPresumidoDetalhe | null = null;
  if (icmsDifalBase) {
    const aplicado = aplicarCreditoPresumido(
      icmsDifalBase,
      creditoPresumidoPercent,
      transacao.receitaBruta,
    );
    icmsDifal = aplicado.icms;
    creditoPresumido = aplicado.detalhe;
  }

  const transacaoCompra = applySupplierUf(transacao, params);
  const icmsDestacado = icmsDestacadoParaBase(icmsDifal);
  const pisCofins = calcularPisCofins({
    transacao: transacaoCompra,
    config,
    icmsDestacado,
  });
  const icmsCreditoCompra = calcularIcmsCreditoCompra(
    transacaoCompra,
    icmsDifal?.isOperacaoInterna ?? true,
    config.considerIcmsStRecuperavel,
  );

  const impostoOperacional = roundMoney(
    (pisCofins?.liquido ?? 0) +
      (icmsDifal?.icmsTotal ?? 0) -
      (icmsCreditoCompra?.creditoTotal ?? 0),
  );

  return {
    icmsDifal,
    icmsCreditoCompra,
    pisCofins,
    impostoOperacional,
    creditoPresumido,
  };
}

export type BranchSimulationComponent = {
  atual: number;
  cenario: number;
};

/** Agregado do incentivo no cenário — para memória de cálculo / auditoria. */
export type IncentivoCenarioAgg = {
  /** Carga efetiva alvo usada neste cenário (%). */
  cargaEfetivaAlvoPercent: number;
  /** Receita das vendas interestaduais (onde o incentivo pode incidir). */
  receitaInterestadual: number;
  icmsInterestadualBruto: number;
  creditoPresumidoValor: number;
  icmsInterestadualLiquido: number;
  difal: number;
  /** ICMS total cenário (líquido + DIFAL) só das linhas interestaduais. */
  icmsTotalInterestadual: number;
  linhasComIncentivo: number;
  linhasInterestaduaisSemIncentivo: number;
  linhasInternas: number;
};

export type BranchSimulationRow = {
  key: string;
  receitaTotal: number;
  atual: number;
  cenario: number;
  economia: number;
  economiaPercent: number;
  /** Imposto médio (% sobre a receita) — o mesmo indicador usado em Meus produtos/Lucratividade. */
  atualPercent: number;
  cenarioPercent: number;
  /** Componentes do cálculo, pra explicar de onde vem a diferença (memória de cálculo). */
  icmsDebito: BranchSimulationComponent;
  icmsCreditoEntrada: BranchSimulationComponent;
  icmsStRecuperavel: BranchSimulationComponent;
  pisCofinsLiquido: BranchSimulationComponent;
  /** Detalhamento do incentivo estadual no cenário. */
  incentivoCenario: IncentivoCenarioAgg;
  /** Info da UF do fornecedor usada no cenário (só presente na linha por SKU). */
  entradaInfo?: EntradaInfo | null;
};

export type BranchSimulationSkuUfRow = BranchSimulationRow & {
  sku: string;
  uf: string;
  /** Alíquotas do cenário (determinísticas por par de UF + import) — vêm da 1ª transação do grupo. */
  aliquotaInterestadual: number;
  aliquotaInternaDestino: number;
  isOperacaoInterna: boolean;
  /** true quando o grupo mistura vendas a comprador contribuinte e não-contribuinte (DIFAL não é uniforme). */
  contribuinteMisto: boolean;
};

export type BranchSimulationResult = {
  transacoesConsideradas: number;
  /** Texto fixo da regra de incentivo, para auditoria na UI. */
  incentivoInterpretacao: string;
  cargaEfetivaAlvoPercent: number;
  totais: BranchSimulationRow;
  porSku: BranchSimulationRow[];
  porUf: BranchSimulationRow[];
  porSkuUf: BranchSimulationSkuUfRow[];
};

export const INCENTIVO_INTERPRETACAO =
  "O % informado é a carga efetiva alvo de ICMS próprio da origem sobre a receita " +
  "(ex.: 1,4% no TTD/SC), não um desconto relativo sobre o ICMS. " +
  "Fórmula: crédito presumido = ICMS interestadual bruto − (receita × carga alvo). " +
  "O DIFAL (UF destino, EC 87/2015) não é reduzido. Operações internas não recebem o incentivo. " +
  "0% desliga a simulação do incentivo.";

type Accumulator = {
  receita: number;
  atual: number;
  cenario: number;
  icmsDebitoAtual: number;
  icmsDebitoCenario: number;
  icmsCreditoEntradaAtual: number;
  icmsCreditoEntradaCenario: number;
  icmsStRecuperavelAtual: number;
  icmsStRecuperavelCenario: number;
  pisCofinsLiquidoAtual: number;
  pisCofinsLiquidoCenario: number;
  receitaInterestadual: number;
  icmsInterestadualBruto: number;
  creditoPresumidoValor: number;
  icmsInterestadualLiquido: number;
  difalCenario: number;
  icmsTotalInterestadual: number;
  linhasComIncentivo: number;
  linhasInterestaduaisSemIncentivo: number;
  linhasInternas: number;
};

function emptyAccumulator(): Accumulator {
  return {
    receita: 0,
    atual: 0,
    cenario: 0,
    icmsDebitoAtual: 0,
    icmsDebitoCenario: 0,
    icmsCreditoEntradaAtual: 0,
    icmsCreditoEntradaCenario: 0,
    icmsStRecuperavelAtual: 0,
    icmsStRecuperavelCenario: 0,
    pisCofinsLiquidoAtual: 0,
    pisCofinsLiquidoCenario: 0,
    receitaInterestadual: 0,
    icmsInterestadualBruto: 0,
    creditoPresumidoValor: 0,
    icmsInterestadualLiquido: 0,
    difalCenario: 0,
    icmsTotalInterestadual: 0,
    linhasComIncentivo: 0,
    linhasInterestaduaisSemIncentivo: 0,
    linhasInternas: 0,
  };
}

function addLine(
  acc: Accumulator,
  input: {
    receita: number;
    atual: number;
    cenario: number;
    det: DetalhamentoTributario;
    scenario: BranchScenarioLine;
  },
) {
  const { receita, atual, cenario, det, scenario } = input;
  const stRecuperavelAtual = det.icmsCreditoCompra?.stRecuperavelTotal ?? 0;
  const stRecuperavelCenario = scenario.icmsCreditoCompra.stRecuperavelTotal ?? 0;

  acc.receita += receita;
  acc.atual += atual;
  acc.cenario += cenario;
  acc.icmsDebitoAtual += det.icmsDifal?.icmsTotal ?? 0;
  acc.icmsDebitoCenario += scenario.icmsDifal?.icmsTotal ?? 0;
  acc.icmsCreditoEntradaAtual +=
    (det.icmsCreditoCompra?.creditoTotal ?? 0) - stRecuperavelAtual;
  acc.icmsCreditoEntradaCenario +=
    scenario.icmsCreditoCompra.creditoTotal - stRecuperavelCenario;
  acc.icmsStRecuperavelAtual += stRecuperavelAtual;
  acc.icmsStRecuperavelCenario += stRecuperavelCenario;
  acc.pisCofinsLiquidoAtual += det.pisCofins?.liquido ?? 0;
  acc.pisCofinsLiquidoCenario += scenario.pisCofins.liquido;

  const cp = scenario.creditoPresumido;
  if (cp) {
    if (scenario.icmsDifal?.isOperacaoInterna) {
      acc.linhasInternas += 1;
    } else {
      acc.receitaInterestadual += cp.receitaBase;
      acc.icmsInterestadualBruto += cp.icmsInterestadualBruto;
      acc.creditoPresumidoValor += cp.creditoPresumidoValor;
      acc.icmsInterestadualLiquido += cp.icmsInterestadualLiquido;
      acc.difalCenario += cp.difal;
      acc.icmsTotalInterestadual += cp.icmsTotalComIncentivo;
      if (cp.aplicado) acc.linhasComIncentivo += 1;
      else acc.linhasInterestaduaisSemIncentivo += 1;
    }
  }
}

function toRow(
  key: string,
  acc: Accumulator,
  cargaEfetivaAlvoPercent: number,
): BranchSimulationRow {
  const { receita, atual, cenario } = acc;
  const economia = roundMoney(atual - cenario);
  const component = (a: number, c: number): BranchSimulationComponent => ({
    atual: roundMoney(a),
    cenario: roundMoney(c),
  });
  return {
    key,
    receitaTotal: roundMoney(receita),
    atual: roundMoney(atual),
    cenario: roundMoney(cenario),
    economia,
    economiaPercent: atual > 0 ? roundMoney((economia / atual) * 100) : 0,
    atualPercent: receita > 0 ? roundMoney((atual / receita) * 100) : 0,
    cenarioPercent: receita > 0 ? roundMoney((cenario / receita) * 100) : 0,
    icmsDebito: component(acc.icmsDebitoAtual, acc.icmsDebitoCenario),
    icmsCreditoEntrada: component(
      acc.icmsCreditoEntradaAtual,
      acc.icmsCreditoEntradaCenario,
    ),
    icmsStRecuperavel: component(
      acc.icmsStRecuperavelAtual,
      acc.icmsStRecuperavelCenario,
    ),
    pisCofinsLiquido: component(
      acc.pisCofinsLiquidoAtual,
      acc.pisCofinsLiquidoCenario,
    ),
    incentivoCenario: {
      cargaEfetivaAlvoPercent: roundMoney(cargaEfetivaAlvoPercent),
      receitaInterestadual: roundMoney(acc.receitaInterestadual),
      icmsInterestadualBruto: roundMoney(acc.icmsInterestadualBruto),
      creditoPresumidoValor: roundMoney(acc.creditoPresumidoValor),
      icmsInterestadualLiquido: roundMoney(acc.icmsInterestadualLiquido),
      difal: roundMoney(acc.difalCenario),
      icmsTotalInterestadual: roundMoney(acc.icmsTotalInterestadual),
      linhasComIncentivo: acc.linhasComIncentivo,
      linhasInterestaduaisSemIncentivo: acc.linhasInterestaduaisSemIncentivo,
      linhasInternas: acc.linhasInternas,
    },
  };
}

const SKU_UF_SEPARATOR = " ";

export function buildBranchSimulationResult(
  detalhes: DetalhamentoTributario[],
  params: BranchScenarioParams,
): BranchSimulationResult {
  const incluidos = detalhes.filter((d) => d.incluidoNaApuracao);

  const total: Accumulator = emptyAccumulator();
  const bySku = new Map<string, Accumulator>();
  const byUf = new Map<string, Accumulator>();
  const bySkuUf = new Map<string, Accumulator>();
  const skuUfMeta = new Map<
    string,
    { aliquotaInterestadual: number; aliquotaInternaDestino: number; isOperacaoInterna: boolean; contribuintes: Set<boolean> }
  >();
  const entradaInfoBySku = new Map<string, EntradaInfo | null>();

  for (const det of incluidos) {
    const receita = det.transacao.receitaBruta;
    const atual = impostoOperacionalLinha(det) ?? 0;
    const scenario = computeScenarioForTransacao(det.transacao, params);
    const line = { receita, atual, cenario: scenario.impostoOperacional, det, scenario };

    addLine(total, line);

    const skuKey = normalizeProductSku(det.transacao.sku || "(sem SKU)");
    const skuAgg = bySku.get(skuKey) ?? emptyAccumulator();
    addLine(skuAgg, line);
    bySku.set(skuKey, skuAgg);
    if (!entradaInfoBySku.has(skuKey)) {
      entradaInfoBySku.set(skuKey, buildEntradaInfo(det.transacao, params));
    }

    const ufKey = det.transacao.ufDestino || "Sem UF";
    const ufAgg = byUf.get(ufKey) ?? emptyAccumulator();
    addLine(ufAgg, line);
    byUf.set(ufKey, ufAgg);

    const skuUfKey = `${skuKey}${SKU_UF_SEPARATOR}${ufKey}`;
    const skuUfAgg = bySkuUf.get(skuUfKey) ?? emptyAccumulator();
    addLine(skuUfAgg, line);
    bySkuUf.set(skuUfKey, skuUfAgg);

    const meta = skuUfMeta.get(skuUfKey) ?? {
      aliquotaInterestadual: scenario.icmsDifal?.aliquotaInterestadual ?? 0,
      aliquotaInternaDestino: scenario.icmsDifal?.aliquotaInternaTotal ?? 0,
      isOperacaoInterna: scenario.icmsDifal?.isOperacaoInterna ?? false,
      contribuintes: new Set<boolean>(),
    };
    meta.contribuintes.add(scenario.icmsDifal?.isContribuinte ?? false);
    skuUfMeta.set(skuUfKey, meta);
  }

  const cargaAlvo = params.creditoPresumidoPercent;

  const porSku = [...bySku.entries()]
    .map(([sku, acc]) => ({
      ...toRow(sku, acc, cargaAlvo),
      entradaInfo: entradaInfoBySku.get(sku) ?? null,
    }))
    .sort((a, b) => b.atual - a.atual);

  const porUf = [...byUf.entries()]
    .map(([uf, acc]) => toRow(uf, acc, cargaAlvo))
    .sort((a, b) => b.atual - a.atual);

  const porSkuUf = [...bySkuUf.entries()]
    .map(([skuUfKey, acc]) => {
      const separatorIndex = skuUfKey.indexOf(SKU_UF_SEPARATOR);
      const sku = skuUfKey.slice(0, separatorIndex);
      const uf = skuUfKey.slice(separatorIndex + SKU_UF_SEPARATOR.length);
      const meta = skuUfMeta.get(skuUfKey)!;
      return {
        ...toRow(skuUfKey, acc, cargaAlvo),
        sku,
        uf,
        aliquotaInterestadual: roundMoney(meta.aliquotaInterestadual * 100),
        aliquotaInternaDestino: roundMoney(meta.aliquotaInternaDestino * 100),
        isOperacaoInterna: meta.isOperacaoInterna,
        contribuinteMisto: meta.contribuintes.size > 1,
      };
    })
    .sort((a, b) => b.atual - a.atual);

  return {
    transacoesConsideradas: incluidos.length,
    incentivoInterpretacao: INCENTIVO_INTERPRETACAO,
    cargaEfetivaAlvoPercent: roundMoney(cargaAlvo),
    totais: toRow("total", total, cargaAlvo),
    porSku,
    porUf,
    porSkuUf,
  };
}
