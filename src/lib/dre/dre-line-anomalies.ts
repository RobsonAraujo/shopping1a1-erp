import { reportsConfig } from "@/config/reports";
import { roundMoney } from "@/lib/pricing/financial-margin";
import { getZonedYearMonthDay } from "@/lib/mercadolibre/revenue-periods";
import type { DreEditableLineKey, DreLineAmounts } from "@/lib/dre/dre-calculations";

/**
 * Linhas que numa operação normal nunca zeram num mês com vendas — zero aqui
 * quase sempre é falha da API do ML no sync, não ausência de lançamento.
 */
export const ZERO_ANOMALY_LINE_KEYS = [
  "cancelledSalesMl",
  "saleFeeMl",
  "sellerShippingMl",
] as const satisfies readonly (keyof DreLineAmounts & DreEditableLineKey)[];

export type DreZeroAnomalyLineKey = (typeof ZERO_ANOMALY_LINE_KEYS)[number];

export type DreZeroLineAnomaly = {
  lineKey: DreZeroAnomalyLineKey;
  /** Mediana do % da linha sobre o faturamento nos outros meses (ex.: 5,3). */
  typicalPercent: number;
  /** O que a mediana daria neste mês. */
  expectedAmount: number;
};

export type DreAnomalyMonthInput = {
  month: number;
  lines: DreLineAmounts | null;
  isCurrentMonth: boolean;
  syncedAt: string | null;
  manuallyEditedLineKeys: readonly DreEditableLineKey[];
};

/** Mediana mínima (1%) e valor esperado mínimo (R$ 100) para acusar o zero. */
const MIN_TYPICAL_RATE = 0.01;
const MIN_EXPECTED_AMOUNT = 100;
/** No mês corrente, cancelamento chega com atraso — só a partir do dia 10. */
const CURRENT_MONTH_MIN_DAY = 10;
const MIN_HISTORY_MONTHS = 2;

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1]! + sorted[mid]!) / 2
    : sorted[mid]!;
}

/**
 * Meses em que uma linha veio zerada fora do padrão dos outros meses do ano.
 * Sem custo: usa só o que a tela já carregou. A mediana inclui os meses com
 * zero — um vendedor que quase nunca tem cancelamento não recebe alerta.
 */
export function detectZeroLineAnomalies(
  months: readonly DreAnomalyMonthInput[],
  options: { now?: Date; timeZone?: string } = {},
): Map<number, DreZeroLineAnomaly[]> {
  const now = options.now ?? new Date();
  const timeZone = options.timeZone ?? reportsConfig.catalogCompetitionTimezone;
  const today = getZonedYearMonthDay(now, timeZone);

  const withSales = months.filter(
    (m): m is DreAnomalyMonthInput & { lines: DreLineAmounts } =>
      m.lines !== null && m.syncedAt !== null && m.lines.revenueMl > 0,
  );
  const result = new Map<number, DreZeroLineAnomaly[]>();

  for (const target of withSales) {
    if (target.isCurrentMonth && today.day < CURRENT_MONTH_MIN_DAY) continue;
    const history = withSales.filter(
      (m) => m.month !== target.month && !m.isCurrentMonth,
    );
    if (history.length < MIN_HISTORY_MONTHS) continue;

    const anomalies: DreZeroLineAnomaly[] = [];
    for (const lineKey of ZERO_ANOMALY_LINE_KEYS) {
      if (target.manuallyEditedLineKeys.includes(lineKey)) continue;
      if (Math.abs(target.lines[lineKey]) >= 0.005) continue;
      const typical = median(
        history.map((m) => Math.abs(m.lines[lineKey]) / m.lines.revenueMl),
      );
      if (typical < MIN_TYPICAL_RATE) continue;
      const expectedAmount = roundMoney(typical * target.lines.revenueMl);
      if (expectedAmount < MIN_EXPECTED_AMOUNT) continue;
      anomalies.push({
        lineKey,
        typicalPercent: Math.round(typical * 1000) / 10,
        expectedAmount,
      });
    }
    if (anomalies.length > 0) result.set(target.month, anomalies);
  }
  return result;
}
