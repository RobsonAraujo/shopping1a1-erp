import { loadLevelingRecordsOverlappingMonth } from "@/lib/dre/dre-product-cost-leveling";
import type { DreProductCostLevelingRecord } from "@/lib/dre/dre-product-cost-leveling-shared";
import type { ItemAdMetrics } from "@/lib/mercadolibre/product-ads-metrics";
import { resolveCustoDaVenda } from "@/lib/tax-report/enrichment/aplicar-nivelamento";
import {
  loadCustoBySkuMap,
  type CustoLookup,
} from "@/lib/tax-report/enrichment/obter-custo-por-sku";
import { resolveFixedCostCreditForMonth } from "@/lib/tax-report/fixed-cost-credit";
import { calcularRelatorioFromTransacoes } from "@/lib/tax-report/service/compute-report";
import {
  loadCbsIbsVigencia,
  loadIcmsRatesMap,
  loadTaxCompanyConfig,
} from "@/lib/tax-report/tax-config-data";
import {
  loadTaxFixedCostExcludedMonths,
  loadTaxFixedCostExplicitValues,
  loadTaxFixedCostItems,
} from "@/lib/tax-report/tax-fixed-cost-data";
import type {
  DetalhamentoTributario,
  TaxReportPayload,
  TransacaoVenda,
} from "@/lib/tax-report/types";

/**
 * Insumos do cálculo do relatório tributário — compartilhados pela geração
 * completa (pedidos do ML), pelo recálculo com as vendas salvas e pelo reparo
 * de relatórios antigos. Antes o reparo recalculava sem eles e zerava os
 * créditos de Ads e de custos fixos.
 */

export function collectDetalhes(
  payload: TaxReportPayload,
): DetalhamentoTributario[] {
  const fromPorSku = payload.porSku.flatMap((sku) => sku.transacoes);
  if (fromPorSku.length > 0) return fromPorSku;
  return payload.transacoes ?? [];
}

/**
 * Atualiza os campos de cadastro de uma venda salva: o nivelamento que cobre
 * o dia da venda ou, sem ele, o cadastro atual. Sem custo nenhum para o
 * produto, a venda fica como estava.
 */
export function enrichTransacao(
  transacao: TransacaoVenda,
  custoLookup: CustoLookup,
  levelings: readonly DreProductCostLevelingRecord[] = [],
  period?: { year: number; month: number },
): TransacaoVenda {
  const orderDate = transacao.orderDate;
  const { custo, fonte } = resolveCustoDaVenda({
    itemId: transacao.itemId,
    sku: transacao.sku,
    orderDate,
    custoLookup,
    levelings,
    year: period?.year ?? new Date(orderDate).getUTCFullYear(),
    month: period?.month ?? new Date(orderDate).getUTCMonth() + 1,
  });
  if (!custo) return transacao;

  return {
    ...transacao,
    custoAquisicaoUnitario: custo.pricingCost ?? transacao.custoAquisicaoUnitario,
    unitCostNf: custo.unitCostNf ?? transacao.unitCostNf ?? null,
    purchaseIcmsPercent: custo.purchaseIcmsPercent,
    hasIcmsSt: custo.hasIcmsSt,
    purchaseCostWithSt:
      custo.purchaseCostWithSt ?? transacao.purchaseCostWithSt ?? null,
    saleIcmsPercent: custo.saleIcmsPercent,
    extraCostsUnitario: custo.extraCosts,
    isMonophasic: custo.isMonophasic,
    mercadoriaImportada: custo.isImported,
    ipiPercent: custo.ipiPercent,
    saleFee: transacao.saleFee ?? 0,
    freightCost: transacao.freightCost ?? 0,
    custoFonte: fonte,
  };
}

/**
 * Receita por anúncio e do mês (denominadores dos rateios de Ads e custos
 * fixos) e, sem métricas novas da API, o gasto de Ads por anúncio que ficou
 * gravado em cada venda.
 */
export function buildReportInputsFromTransactions(
  transacoes: readonly TransacaoVenda[],
  storedDetalhes: readonly DetalhamentoTributario[] = [],
): {
  receitaTotalByItem: Map<string, number>;
  receitaTotalMes: number;
  adsMetricsByItem: Map<string, ItemAdMetrics>;
} {
  const receitaTotalByItem = new Map<string, number>();
  let receitaTotalMes = 0;
  for (const t of transacoes) {
    receitaTotalByItem.set(
      t.itemId,
      (receitaTotalByItem.get(t.itemId) ?? 0) + t.receitaBruta,
    );
    receitaTotalMes += t.receitaBruta;
  }

  const adsMetricsByItem = new Map<string, ItemAdMetrics>();
  for (const det of storedDetalhes) {
    const itemId = det.transacao.itemId;
    const cost = det.creditoOutrasDespesas?.ads?.gastoAdsMesItem ?? 0;
    if (!itemId || !(cost > 0) || adsMetricsByItem.has(itemId)) continue;
    adsMetricsByItem.set(itemId, {
      itemId,
      status: null,
      cost,
      acosPercent: null,
      totalAmount: 0,
      organicAmount: 0,
      unitsQuantity: 0,
      totalRevenue: 0,
      tacosPercent: null,
    });
  }

  return { receitaTotalByItem, receitaTotalMes, adsMetricsByItem };
}

/** Custos fixos com crédito do mês (rateados por dias corridos no mês em andamento). */
export async function loadFixedCostResolutionForMonth(
  organizationId: string,
  year: number,
  month: number,
) {
  const [items, explicitValues, excludedMonths] = await Promise.all([
    loadTaxFixedCostItems(organizationId),
    loadTaxFixedCostExplicitValues(organizationId, year),
    loadTaxFixedCostExcludedMonths(organizationId, year),
  ]);
  return resolveFixedCostCreditForMonth({
    items: items.map((item) => ({
      id: item.id,
      active: true,
      recurring: item.recurring,
      endYear: item.endYear,
      endMonth: item.endMonth,
    })),
    explicitValues,
    excludedMonths,
    year,
    month,
  });
}

/**
 * Recalcula um relatório sobre as vendas já salvas, com cadastro, nivelamento,
 * configuração e custos fixos atuais — sem nenhuma chamada ao ML. `meta`
 * decide se é recálculo de verdade (nova versão) ou só exibição (reparo).
 */
export async function recomputeTaxReportPayload(input: {
  organizationId: string;
  payload: TaxReportPayload;
  meta: TaxReportPayload["meta"];
}): Promise<TaxReportPayload> {
  const { organizationId, payload } = input;
  const detalhes = collectDetalhes(payload);
  const skus = [
    ...new Set(detalhes.map((d) => d.transacao.sku).filter(Boolean)),
  ];
  const itemIds = [
    ...new Set(detalhes.map((d) => d.transacao.itemId).filter(Boolean)),
  ];
  const [custoLookup, levelings, config, icmsRates, cbsIbsVigencia, fixedCosts] =
    await Promise.all([
      loadCustoBySkuMap(organizationId, skus, itemIds),
      loadLevelingRecordsOverlappingMonth(
        organizationId,
        payload.year,
        payload.month,
      ),
      loadTaxCompanyConfig(organizationId),
      loadIcmsRatesMap(),
      loadCbsIbsVigencia(payload.year),
      loadFixedCostResolutionForMonth(organizationId, payload.year, payload.month),
    ]);

  const transacoes = detalhes.map((d) =>
    enrichTransacao(d.transacao, custoLookup, levelings, payload),
  );
  const inputs = buildReportInputsFromTransactions(transacoes, detalhes);

  const recomputed = calcularRelatorioFromTransacoes({
    transacoes,
    config,
    icmsRates,
    cbsIbsVigencia,
    year: payload.year,
    month: payload.month,
    overrides: payload.overrides ?? {},
    meta: input.meta,
    adsMetricsByItem: inputs.adsMetricsByItem,
    receitaTotalByItem: inputs.receitaTotalByItem,
    receitaTotalMes: inputs.receitaTotalMes,
    custosFixosBaseMes: fixedCosts.totalCreditavel,
    creditoCustosFixosBaseRegistrada: fixedCosts.totalRegistrado,
    creditoCustosFixosBaseCreditavel: fixedCosts.totalCreditavel,
  });

  return { ...recomputed, transacoes: [] };
}
