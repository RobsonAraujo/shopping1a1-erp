import { roundMoney } from "@/lib/pricing/financial-margin";
import { zonedYmd } from "@/lib/report-timezone";
import {
  aggregationKey,
  impostoOperacionalLinhaValor,
} from "@/lib/tax-report/aggregation/agregador-por-sku";
import type { DetalhamentoTributario, TaxReportPayload } from "@/lib/tax-report/types";

/**
 * Receita e imposto operacional de um anúncio num dia — gravado em
 * `TaxReportMonthSnapshot.dailyTotals`. Chaves curtas de propósito: é lido
 * dentro do Postgres (`jsonb_array_elements`) e somado lá, mas ocupa espaço
 * no registro de cada mês.
 */
export type TaxDailyTotal = {
  /** Dia da venda (`YYYY-MM-DD`) no timezone de negócio. */
  d: string;
  /** `mlItemId` do anúncio; null só em venda sem itemId (defensivo). */
  k: string | null;
  /** SKU de exibição da venda. */
  s: string;
  /** Receita bruta. */
  r: number;
  /** Imposto operacional (mesma fórmula do agregado por SKU). */
  i: number;
  /** Quantidade de vendas. */
  n: number;
};

/** Mesmo que `collectDetalhes` (service/report-inputs), sem puxar o módulo de banco. */
function vendasDoPayload(payload: TaxReportPayload): DetalhamentoTributario[] {
  const fromPorSku = payload.porSku.flatMap((sku) => sku.transacoes);
  return fromPorSku.length > 0 ? fromPorSku : (payload.transacoes ?? []);
}

function saleDay(orderDate: string): string {
  const date = new Date(orderDate);
  return Number.isNaN(date.getTime()) ? orderDate.slice(0, 10) : zonedYmd(date);
}

/**
 * Totais por dia × anúncio das vendas incluídas na apuração. Mesma chave e
 * mesma fórmula de `agregarPorSku`: a soma dos dias de um anúncio é o
 * `receitaTotal`/`impostoOperacionalTotal` dele no mês.
 */
export function buildTaxDailyTotals(payload: TaxReportPayload): TaxDailyTotal[] {
  const map = new Map<string, TaxDailyTotal>();

  for (const det of vendasDoPayload(payload)) {
    if (!det.incluidoNaApuracao) continue;
    const d = saleDay(det.transacao.orderDate);
    const key = `${d}|${aggregationKey(det)}`;
    const existing = map.get(key) ?? {
      d,
      k: det.transacao.itemId || null,
      s: det.transacao.sku || "(sem SKU)",
      r: 0,
      i: 0,
      n: 0,
    };
    existing.r += det.transacao.receitaBruta;
    existing.i += impostoOperacionalLinhaValor(det);
    existing.n += 1;
    map.set(key, existing);
  }

  return [...map.values()]
    .map((row) => ({ ...row, r: roundMoney(row.r), i: roundMoney(row.i) }))
    .sort((a, b) => a.d.localeCompare(b.d));
}
