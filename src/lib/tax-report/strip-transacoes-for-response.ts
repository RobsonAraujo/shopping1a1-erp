import { findSkuInReport } from "@/lib/tax-report/find-sku-in-report";
import type { TaxReportPayload } from "@/lib/tax-report/types";

/**
 * Remove `transacoes` (com `memoriaCalculo`/breakdowns por venda) de todos os
 * SKUs antes de devolver o payload pro cliente, mantendo só o SKU pedido
 * (drilldown) quando `keepSku` é passado. A tela de resumo mensal nunca usa
 * `transacoes`; só o drilldown por SKU usa, e busca um SKU por vez — sem essa
 * poda, a resposta HTTP carrega o detalhamento de todas as vendas do mês toda
 * vez que a tela de resumo é aberta.
 */
export function stripTransacoesForResponse(
  payload: TaxReportPayload,
  keepSku?: string,
): TaxReportPayload {
  const keepRow = keepSku ? findSkuInReport(payload.porSku, keepSku) : undefined;

  return {
    ...payload,
    transacoes: [],
    porSku: payload.porSku.map((row) =>
      row === keepRow ? row : { ...row, transacoes: [] },
    ),
  };
}
