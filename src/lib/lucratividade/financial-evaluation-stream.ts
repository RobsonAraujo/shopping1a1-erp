import type {
  FinancialEvaluationMeta,
  FinancialEvaluationProgress,
  FinancialEvaluationRow,
} from "@/lib/lucratividade/financial-evaluation-data";

export type FinancialEvaluationCompletePayload = {
  mode: "current" | "period";
  from?: string;
  to?: string;
  salesCount?: number;
  periodDays?: number;
};

/**
 * Eventos SSE de `GET /api/financial-evaluation?stream=1`, na ordem:
 * - `progress` (só período): pedidos já buscados no ML;
 * - `meta`: fatos da página (quantos anúncios, ADS disponível, vendas descartadas);
 * - `row` (N vezes): linha pronta — no modo ao vivo chega antes uma
 *   pré-visualização `pending` e depois a versão final do mesmo anúncio;
 * - `complete` ou `error`.
 */
export type FinancialEvaluationStreamEvent =
  | ({ type: "progress" } & FinancialEvaluationProgress)
  | ({ type: "meta" } & FinancialEvaluationMeta)
  | { type: "row"; row: FinancialEvaluationRow }
  | ({ type: "complete" } & FinancialEvaluationCompletePayload)
  | { type: "error"; message: string };

export function sseLine(data: FinancialEvaluationStreamEvent): string {
  return `data: ${JSON.stringify(data)}\n\n`;
}
