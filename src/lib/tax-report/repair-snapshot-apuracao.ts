import { prisma } from "@/lib/db";
import { normalizeProductSku } from "@/lib/product-pricing";
import type { CustoProduto } from "@/lib/tax-report/enrichment/custo-produto";
import { loadCustoBySkuMap } from "@/lib/tax-report/enrichment/obter-custo-por-sku";
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

export function collectDetalhes(payload: TaxReportPayload): DetalhamentoTributario[] {
  const fromPorSku = payload.porSku.flatMap((sku) => sku.transacoes);
  if (fromPorSku.length > 0) return fromPorSku;
  return payload.transacoes ?? [];
}

export function enrichTransacao(
  transacao: TransacaoVenda,
  custoBySku: Map<string, CustoProduto>,
): TransacaoVenda {
  const normalized = normalizeProductSku(transacao.sku);
  const custo = custoBySku.get(normalized);
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
    ipiPercent: custo.ipiPercent,
    saleFee: transacao.saleFee ?? 0,
    freightCost: transacao.freightCost ?? 0,
  };
}

export function needsCostEnrichmentRepair(
  detalhes: DetalhamentoTributario[],
  custoBySku: Map<string, CustoProduto>,
): boolean {
  return detalhes.some((d) => {
    if (!d.incluidoNaApuracao) return false;
    const tx = d.transacao;
    if (tx.unitCostNf != null && tx.unitCostNf > 0) return false;
    const enriched = enrichTransacao(tx, custoBySku);
    return enriched.unitCostNf != null && enriched.unitCostNf > 0;
  });
}

function needsApuracaoRepair(payload: TaxReportPayload): boolean {
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
      d.icmsCreditoCompra.stRecuperavelTotal === undefined ||
      d.pisCofins?.baseCredito === undefined ||
      d.creditoOutrasDespesas?.frete === undefined ||
      d.creditoOutrasDespesas?.custosFixos === undefined ||
      (d.transacao as TransacaoVenda & { saleIcmsPercent?: number })
        .saleIcmsPercent === undefined ||
      (d.transacao as TransacaoVenda & { unitCostNf?: number | null })
        .unitCostNf === undefined,
  );
}

/**
 * `sellerId` (não `organizationId`) porque os snapshots de relatório
 * tributário (`TaxReportMonthSnapshot`) continuam escopados por seller ML,
 * não por organização — resolve a org internamente via `OrganizationMlSeller`
 * pra não propagar `organizationId` explícito por toda a cadeia de leitura
 * de snapshot (loadTaxReportSnapshot e afins, chamadas em muitos lugares).
 */
export async function repairTaxReportPayload(
  sellerId: number,
  payload: TaxReportPayload,
): Promise<TaxReportPayload> {
  const link = await prisma.organizationMlSeller.findUnique({
    where: { mlUserId: sellerId },
    select: { organizationId: true },
  });
  if (!link) return repairTaxReportPayloadSync(payload);
  const organizationId = link.organizationId;

  const synced = repairTaxReportPayloadSync(payload);
  const detalhes = collectDetalhes(synced);
  if (detalhes.length === 0) return synced;

  const skus = [...new Set(detalhes.map((d) => d.transacao.sku).filter(Boolean))];
  const custoBySku = await loadCustoBySkuMap(organizationId, skus);
  const needsCostRepair = needsCostEnrichmentRepair(
    detalhes.filter((d) => d.incluidoNaApuracao),
    custoBySku,
  );

  if (!needsApuracaoRepair(synced) && !needsCostRepair) return synced;

  const [config, icmsRates, cbsIbsVigencia] = await Promise.all([
    loadTaxCompanyConfig(organizationId),
    loadIcmsRatesMap(),
    loadCbsIbsVigencia(synced.year),
  ]);

  const transacoes = detalhes.map((d) => enrichTransacao(d.transacao, custoBySku));

  const recomputed = calcularRelatorioFromTransacoes({
    transacoes,
    config,
    icmsRates,
    cbsIbsVigencia,
    year: synced.year,
    month: synced.month,
    overrides: synced.overrides,
    meta: synced.meta,
  });

  return {
    ...recomputed,
    transacoes: [],
  };
}
