import { prisma } from "@/lib/db/db";
import type { CustoLookup } from "@/lib/tax-report/enrichment/obter-custo-por-sku";
import { loadCustoBySkuMap } from "@/lib/tax-report/enrichment/obter-custo-por-sku";
import {
  collectDetalhes,
  enrichTransacao,
  recomputeTaxReportPayload,
} from "@/lib/tax-report/service/report-inputs";
import type {
  DetalhamentoTributario,
  TaxReportPayload,
  TransacaoVenda,
} from "@/lib/tax-report/types";
import { repairTaxReportPayloadSync } from "@/lib/tax-report/repair-snapshot-uf";

export { collectDetalhes, enrichTransacao };

export function needsCostEnrichmentRepair(
  detalhes: DetalhamentoTributario[],
  custoLookup: CustoLookup,
): boolean {
  return detalhes.some((d) => {
    if (!d.incluidoNaApuracao) return false;
    const tx = d.transacao;
    if (tx.unitCostNf != null && tx.unitCostNf > 0) return false;
    const enriched = enrichTransacao(tx, custoLookup);
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
 * Reparo **só de exibição** de relatórios antigos (campos que o motor de hoje
 * calcula e o antigo não tinha) ou com venda sem custo que hoje tem cadastro.
 * Não grava nada: a tela compara com o que está salvo e oferece "Salvar
 * recálculo" — o salvo é o que o DRE usa.
 *
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
  const itemIds = [
    ...new Set(detalhes.map((d) => d.transacao.itemId).filter(Boolean)),
  ];
  const custoLookup = await loadCustoBySkuMap(organizationId, skus, itemIds);
  const needsCostRepair = needsCostEnrichmentRepair(
    detalhes.filter((d) => d.incluidoNaApuracao),
    custoLookup,
  );

  if (!needsApuracaoRepair(synced) && !needsCostRepair) return synced;

  // Mesmo cálculo do "Salvar recálculo" (nivelamento, Ads e custos fixos
  // inclusos), só que com a meta original — é uma prévia, não uma versão nova.
  return recomputeTaxReportPayload({
    organizationId,
    payload: synced,
    meta: synced.meta,
  });
}
