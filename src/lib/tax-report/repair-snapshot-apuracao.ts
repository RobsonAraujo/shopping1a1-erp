import { resolveCanonicalSku, type SkuAliasMap } from "@/lib/product-sku-alias";
import { loadSkuAliasMap } from "@/lib/product-sku-alias-data";
import type { CustoProduto } from "@/lib/tax-report/enrichment/custo-produto";
import { loadCustoBySkuMap } from "@/lib/tax-report/enrichment/obter-custo-por-sku";
import { findSkuAggregation } from "@/lib/tax-report/aggregation/agregador-por-sku";
import { calcularRelatorioFromTransacoes } from "@/lib/tax-report/service/compute-report";
import {
  loadCbsIbsVigencia,
  loadIcmsRatesMap,
  loadTaxCompanyConfig,
} from "@/lib/tax-report/tax-config-data";
import type {
  DetalhamentoTributario,
  TaxReportPayload,
  TransacaoVenda,
} from "@/lib/tax-report/types";
import { repairTaxReportPayloadSync } from "@/lib/tax-report/repair-snapshot-uf";

function collectDetalhes(payload: TaxReportPayload): DetalhamentoTributario[] {
  const root = payload.transacoes ?? [];
  if (root.length > 0) return root;
  return payload.porSku.flatMap((sku) => sku.transacoes);
}

function enrichTransacao(
  transacao: TransacaoVenda,
  custoBySku: Map<string, CustoProduto>,
): TransacaoVenda {
  const custo = custoBySku.get(transacao.sku);
  if (!custo) return transacao;

  return {
    ...transacao,
    custoAquisicaoUnitario: custo.pricingCost ?? transacao.custoAquisicaoUnitario,
    unitCostNf: custo.unitCostNf ?? transacao.unitCostNf ?? null,
    purchaseIcmsPercent: custo.purchaseIcmsPercent,
    hasIcmsSt: custo.hasIcmsSt,
    saleIcmsPercent: custo.saleIcmsPercent,
    extraCostsUnitario: custo.extraCosts,
    isMonophasic: custo.isMonophasic,
    mercadoriaImportada: custo.isImported,
    conteudoImportacaoPercentual: custo.importContentPercent,
  };
}

function needsSkuAliasRepair(
  payload: TaxReportPayload,
  aliasMap: SkuAliasMap,
): boolean {
  if (aliasMap.size === 0) return false;

  if (
    payload.porSku.some((row) => {
      const canonical = resolveCanonicalSku(row.sku, aliasMap);
      return row.sku !== canonical;
    })
  ) {
    return true;
  }

  for (const row of payload.porSku) {
    const expectedAliases = [...aliasMap.entries()]
      .filter(([, canonical]) => canonical === row.sku)
      .map(([alias]) => alias)
      .sort();
    const currentAliases = [...(row.skuAliases ?? [])].sort();
    if (expectedAliases.join("\0") !== currentAliases.join("\0")) {
      return true;
    }
  }

  for (const det of collectDetalhes(payload).filter((d) => d.incluidoNaApuracao)) {
    const canonical = resolveCanonicalSku(det.transacao.sku, aliasMap);
    const row = findSkuAggregation(payload.porSku, canonical, aliasMap);
    if (!row) return true;
  }

  return false;
}

function needsApuracaoRepair(
  payload: TaxReportPayload,
  aliasMap: SkuAliasMap,
): boolean {
  if (needsSkuAliasRepair(payload, aliasMap)) return true;
  if (!payload.consolidado.apuracao) return true;
  if (
    payload.consolidado.irpjEstimado != null ||
    payload.consolidado.margemOperacional == null
  ) {
    return true;
  }

  const detalhes = collectDetalhes(payload).filter((d) => d.incluidoNaApuracao);
  return detalhes.some(
    (d) =>
      d.irpjCsll != null ||
      d.margemOperacionalEstimada == null ||
      d.icmsCreditoCompra == null ||
      d.pisCofins?.baseCredito === undefined ||
      (d.transacao as TransacaoVenda & { saleIcmsPercent?: number })
        .saleIcmsPercent === undefined ||
      (d.transacao as TransacaoVenda & { unitCostNf?: number | null })
        .unitCostNf === undefined,
  );
}

export async function repairTaxReportPayload(
  payload: TaxReportPayload,
): Promise<TaxReportPayload> {
  const synced = repairTaxReportPayloadSync(payload);
  const aliasMap = await loadSkuAliasMap();
  if (!needsApuracaoRepair(synced, aliasMap)) return synced;

  const detalhes = collectDetalhes(synced);
  if (detalhes.length === 0) return synced;

  const skus = [...new Set(detalhes.map((d) => d.transacao.sku).filter(Boolean))];
  const [custoBySku, config, icmsRates, cbsIbsVigencia] = await Promise.all([
    loadCustoBySkuMap(skus, aliasMap),
    loadTaxCompanyConfig(),
    loadIcmsRatesMap(),
    loadCbsIbsVigencia(synced.year),
  ]);

  const transacoes = detalhes.map((d) =>
    enrichTransacao(d.transacao, custoBySku),
  );

  const recomputed = calcularRelatorioFromTransacoes({
    transacoes,
    config,
    icmsRates,
    cbsIbsVigencia,
    year: synced.year,
    month: synced.month,
    overrides: synced.overrides,
    meta: synced.meta,
    aliasMap,
  });

  return {
    ...recomputed,
    transacoes: [],
  };
}
