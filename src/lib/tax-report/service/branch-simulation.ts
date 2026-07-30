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
 * Aplica um crédito presumido (redução %) sobre o ICMS interestadual devido
 * na saída da UF de origem simulada — não afeta o DIFAL (devido ao estado de
 * destino, EC 87/2015) nem operações internas.
 */
export function aplicarCreditoPresumido(
  icms: IcmsDifalBreakdown,
  creditoPresumidoPercent: number,
): IcmsDifalBreakdown {
  if (icms.isOperacaoInterna || creditoPresumidoPercent <= 0) {
    return icms;
  }
  const fator = 1 - Math.min(100, Math.max(0, creditoPresumidoPercent)) / 100;
  const icmsInterestadual = roundMoney(icms.icmsInterestadual * fator);
  return {
    ...icms,
    icmsInterestadual,
    icmsTotal: roundMoney(icmsInterestadual + icms.difal),
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
  creditoPresumidoPercent: number;
  /** Fornecedor (ver `getSkuSupplier`) -> UF, pra refinar o ICMS de entrada no cenário. */
  supplierUfByFornecedor?: Map<string, string>;
};

export type BranchScenarioLine = {
  icmsDifal: IcmsDifalBreakdown | null;
  icmsCreditoCompra: IcmsCreditoCompraBreakdown;
  pisCofins: PisCofinsBreakdown;
  impostoOperacional: number;
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
  const icmsDifal = icmsDifalBase
    ? aplicarCreditoPresumido(icmsDifalBase, creditoPresumidoPercent)
    : null;

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

  return { icmsDifal, icmsCreditoCompra, pisCofins, impostoOperacional };
}

export type BranchSimulationComponent = {
  atual: number;
  cenario: number;
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
  totais: BranchSimulationRow;
  porSku: BranchSimulationRow[];
  porUf: BranchSimulationRow[];
  porSkuUf: BranchSimulationSkuUfRow[];
};

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
}

function toRow(key: string, acc: Accumulator): BranchSimulationRow {
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

  const porSku = [...bySku.entries()]
    .map(([sku, acc]) => ({
      ...toRow(sku, acc),
      entradaInfo: entradaInfoBySku.get(sku) ?? null,
    }))
    .sort((a, b) => b.atual - a.atual);

  const porUf = [...byUf.entries()]
    .map(([uf, acc]) => toRow(uf, acc))
    .sort((a, b) => b.atual - a.atual);

  const porSkuUf = [...bySkuUf.entries()]
    .map(([skuUfKey, acc]) => {
      const separatorIndex = skuUfKey.indexOf(SKU_UF_SEPARATOR);
      const sku = skuUfKey.slice(0, separatorIndex);
      const uf = skuUfKey.slice(separatorIndex + SKU_UF_SEPARATOR.length);
      const meta = skuUfMeta.get(skuUfKey)!;
      return {
        ...toRow(skuUfKey, acc),
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
    totais: toRow("total", total),
    porSku,
    porUf,
    porSkuUf,
  };
}
