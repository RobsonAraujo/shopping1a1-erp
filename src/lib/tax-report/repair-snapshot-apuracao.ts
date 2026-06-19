import { normalizeProductSku } from "@/lib/product-pricing";
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
  const fromPorSku = payload.porSku.flatMap((sku) => sku.transacoes);
  if (fromPorSku.length > 0) return fromPorSku;
  return payload.transacoes ?? [];
}

export function enrichTransacao(
  transacao: TransacaoVenda,
  custoBySku: Map<string, CustoProduto>,
  aliasMap?: SkuAliasMap,
): TransacaoVenda {
  const normalized = normalizeProductSku(transacao.sku);
  let custo = custoBySku.get(normalized);
  if (!custo && aliasMap) {
    const canonical = resolveCanonicalSku(normalized, aliasMap);
    if (canonical !== normalized) {
      custo = custoBySku.get(canonical);
    }
  }
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

export function needsAliasCostRepair(
  detalhes: DetalhamentoTributario[],
  aliasMap: SkuAliasMap,
): boolean {
  if (aliasMap.size === 0) return false;

  return detalhes.some((d) => {
    if (!d.incluidoNaApuracao) return false;
    const tx = d.transacao;
    if (tx.unitCostNf != null && tx.unitCostNf > 0) return false;
    const normalized = normalizeProductSku(tx.sku);
    const canonical = resolveCanonicalSku(normalized, aliasMap);
    return canonical !== normalized;
  });
}

export function needsCostEnrichmentRepair(
  detalhes: DetalhamentoTributario[],
  custoBySku: Map<string, CustoProduto>,
  aliasMap: SkuAliasMap,
): boolean {
  return detalhes.some((d) => {
    if (!d.incluidoNaApuracao) return false;
    const tx = d.transacao;
    if (tx.unitCostNf != null && tx.unitCostNf > 0) return false;
    const enriched = enrichTransacao(tx, custoBySku, aliasMap);
    return enriched.unitCostNf != null && enriched.unitCostNf > 0;
  });
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
  if (needsAliasCostRepair(detalhes, aliasMap)) return true;

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
  const detalhes = collectDetalhes(synced);
  if (detalhes.length === 0) return synced;

  const skus = [...new Set(detalhes.map((d) => d.transacao.sku).filter(Boolean))];
  const custoBySku = await loadCustoBySkuMap(skus, aliasMap);
  const needsCostRepair = needsCostEnrichmentRepair(
    detalhes.filter((d) => d.incluidoNaApuracao),
    custoBySku,
    aliasMap,
  );

  if (!needsApuracaoRepair(synced, aliasMap) && !needsCostRepair) return synced;

  const [config, icmsRates, cbsIbsVigencia] = await Promise.all([
    loadTaxCompanyConfig(),
    loadIcmsRatesMap(),
    loadCbsIbsVigencia(synced.year),
  ]);

  const transacoes = detalhes.map((d) =>
    enrichTransacao(d.transacao, custoBySku, aliasMap),
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
