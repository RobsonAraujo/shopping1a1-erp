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

function needsApuracaoRepair(payload: TaxReportPayload): boolean {
  if (!payload.consolidado.apuracao) return true;

  const detalhes = collectDetalhes(payload).filter((d) => d.incluidoNaApuracao);
  return detalhes.some(
    (d) =>
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
  if (!needsApuracaoRepair(synced)) return synced;

  const detalhes = collectDetalhes(synced);
  if (detalhes.length === 0) return synced;

  const skus = [...new Set(detalhes.map((d) => d.transacao.sku).filter(Boolean))];
  const [custoBySku, config, icmsRates, cbsIbsVigencia] = await Promise.all([
    loadCustoBySkuMap(skus),
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
  });

  return {
    ...recomputed,
    transacoes: [],
  };
}
