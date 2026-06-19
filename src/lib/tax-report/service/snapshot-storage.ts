import type { TaxReportPayload } from "@/lib/tax-report/types";

/** Remove transacoes duplicadas na raiz — detalhes ficam em porSku[].transacoes. */
export function slimTaxReportPayloadForStorage(
  payload: TaxReportPayload,
): TaxReportPayload {
  return { ...payload, transacoes: [] };
}
