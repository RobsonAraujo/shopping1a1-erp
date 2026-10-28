import type { TaxReportPayload } from "@/lib/tax-report/types";

/**
 * Relatório calculado por uma versão antiga do motor: linhas por texto de SKU
 * (sem a identidade do anúncio — o mesmo anúncio podia virar duas linhas com %
 * diferentes) ou sem a apuração consolidada. Recalcular com os dados salvos
 * resolve, sem buscar nada no ML.
 */
export function isLegacyTaxReport(
  payload: Pick<TaxReportPayload, "consolidado" | "porSku">,
): boolean {
  if (!payload.consolidado.apuracao) return true;
  return payload.porSku.some((row) => !row.mlItemId);
}

/** Quando os pedidos do relatório foram buscados no ML. */
export function taxReportOrdersFetchedAt(
  meta: Pick<TaxReportPayload["meta"], "geradoEm" | "pedidosBuscadosEm">,
): string {
  return meta.pedidosBuscadosEm ?? meta.geradoEm;
}
