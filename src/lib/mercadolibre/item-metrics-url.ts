import { reportsConfig } from "@/config/reports";
import { getCalendarMonthRanges } from "@/lib/mercadolibre/revenue-periods";

function pad2(value: number): string {
  return String(value).padStart(2, "0");
}

function getLastCalendarMonthParts(
  timeZone: string = reportsConfig.catalogCompetitionTimezone,
): { year: number; month: number; lastDay: number } {
  const { lastMonth } = getCalendarMonthRanges(timeZone);
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
  });
  const parts = formatter.formatToParts(lastMonth.from);
  const year = Number(parts.find((p) => p.type === "year")?.value ?? 0);
  const month = Number(parts.find((p) => p.type === "month")?.value ?? 0);
  const lastDay = new Date(year, month, 0).getDate();
  return { year, month, lastDay };
}

/** Período customizado do painel de métricas do ML (mês calendário anterior completo). */
export function getMercadoLivreLastMonthMetricsPeriod(
  timeZone: string = reportsConfig.catalogCompetitionTimezone,
): { start: string; end: string } {
  const { year, month, lastDay } = getLastCalendarMonthParts(timeZone);
  const mm = pad2(month);
  return {
    start: `${year}-${mm}-01T04:00:00.000Z`,
    end: `${year}-${mm}-${pad2(lastDay)}T04:00:00.000Z`,
  };
}

export function buildMercadoLivreItemMetricsUrl(
  itemId: string,
  timeZone: string = reportsConfig.catalogCompetitionTimezone,
): string {
  const { start, end } = getMercadoLivreLastMonthMetricsPeriod(timeZone);
  const period = `custom|${start}to${end}`;
  return `https://www.mercadolivre.com.br/metricas/${itemId}/performance-item?finish_period_evolutionary=lastPeriod&start_period_evolutionary=${period}`;
}
