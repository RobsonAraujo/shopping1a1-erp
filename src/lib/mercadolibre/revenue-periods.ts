import { reportsConfig } from "@/config/reports";

export type CalendarDateRange = {
  from: Date;
  to: Date;
};

export type CalendarMonthRanges = {
  lastMonth: CalendarDateRange;
  currentMonth: CalendarDateRange;
};

export type CalendarMonthLabels = {
  lastMonth: string;
  currentMonth: string;
};

function getZonedParts(date: Date, timeZone: string) {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const parts = formatter.formatToParts(date);
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((p) => p.type === type)?.value ?? 0);
  return {
    year: get("year"),
    month: get("month"),
    day: get("day"),
  };
}

/** Converte data/hora local no fuso informado para instante UTC. */
function localDateTimeToUtc(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  second: number,
  ms: number,
  timeZone: string,
): Date {
  const utcGuess = Date.UTC(year, month - 1, day, hour, minute, second, ms);
  const guessDate = new Date(utcGuess);
  const inTz = guessDate.toLocaleString("en-US", { timeZone });
  const inUtc = guessDate.toLocaleString("en-US", { timeZone: "UTC" });
  const offsetMs =
    new Date(inTz).getTime() - new Date(inUtc).getTime();
  return new Date(utcGuess - offsetMs);
}

export function getCalendarMonthRanges(
  timeZone: string = reportsConfig.catalogCompetitionTimezone,
): CalendarMonthRanges {
  const now = new Date();
  const zonedNow = getZonedParts(now, timeZone);

  const currentMonthStart = localDateTimeToUtc(
    zonedNow.year,
    zonedNow.month,
    1,
    0,
    0,
    0,
    0,
    timeZone,
  );

  let lastYear = zonedNow.year;
  let lastMonth = zonedNow.month - 1;
  if (lastMonth < 1) {
    lastMonth = 12;
    lastYear -= 1;
  }

  const daysInLastMonth = new Date(lastYear, lastMonth, 0).getDate();
  const lastMonthStart = localDateTimeToUtc(
    lastYear,
    lastMonth,
    1,
    0,
    0,
    0,
    0,
    timeZone,
  );
  const lastMonthEnd = localDateTimeToUtc(
    lastYear,
    lastMonth,
    daysInLastMonth,
    23,
    59,
    59,
    999,
    timeZone,
  );

  return {
    lastMonth: { from: lastMonthStart, to: lastMonthEnd },
    currentMonth: { from: currentMonthStart, to: now },
  };
}

export function getCalendarMonthLabels(
  ranges: CalendarMonthRanges,
  timeZone: string = reportsConfig.catalogCompetitionTimezone,
): CalendarMonthLabels {
  const lastMonth = ranges.lastMonth.from.toLocaleDateString("pt-BR", {
    timeZone,
    month: "short",
    year: "numeric",
  });
  const currentMonth = ranges.currentMonth.from.toLocaleDateString("pt-BR", {
    timeZone,
    month: "short",
    year: "numeric",
  });
  return {
    lastMonth,
    currentMonth: `${currentMonth} até hoje`,
  };
}

export function formatRevenueBRL(value: number): string {
  return value.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

export const REVENUE_TOOLTIP_HINT =
  "Faturamento bruto (preço × quantidade em pedidos pagos, via Mercado Livre). Não desconta taxas ML.";

export function sumRevenueForItems(
  revenueByItem: Record<string, number>,
  itemIds: string[],
): number {
  let total = 0;
  for (const id of itemIds) {
    total += revenueByItem[id] ?? 0;
  }
  return total;
}
