import { reportsConfig } from "@/config/reports";
import { zonedLocalToUtc } from "@/lib/report-timezone";

const YMD_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

export function parseFinancialEvaluationYmd(
  value: string,
): { year: number; month: number; day: number } | null {
  const match = YMD_RE.exec(value.trim());
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (
    !Number.isInteger(year) ||
    !Number.isInteger(month) ||
    !Number.isInteger(day) ||
    month < 1 ||
    month > 12 ||
    day < 1 ||
    day > 31
  ) {
    return null;
  }
  const probe = new Date(Date.UTC(year, month - 1, day));
  if (
    probe.getUTCFullYear() !== year ||
    probe.getUTCMonth() + 1 !== month ||
    probe.getUTCDate() !== day
  ) {
    return null;
  }
  return { year, month, day };
}

export function calendarYmdRangeToUtc(
  fromYmd: string,
  toYmd: string,
  timeZone: string = reportsConfig.catalogCompetitionTimezone,
): {
  from: Date;
  to: Date;
  dateFrom: string;
  dateTo: string;
  periodDays: number;
} | null {
  const fromParts = parseFinancialEvaluationYmd(fromYmd);
  const toParts = parseFinancialEvaluationYmd(toYmd);
  if (!fromParts || !toParts) return null;

  const from = zonedLocalToUtc(
    fromParts.year,
    fromParts.month,
    fromParts.day,
    0,
    0,
    0,
    0,
    timeZone,
  );
  const to = zonedLocalToUtc(
    toParts.year,
    toParts.month,
    toParts.day,
    23,
    59,
    59,
    999,
    timeZone,
  );
  if (from.getTime() > to.getTime()) return null;

  const fromNoon = zonedLocalToUtc(
    fromParts.year,
    fromParts.month,
    fromParts.day,
    12,
    0,
    0,
    0,
    timeZone,
  );
  const toNoon = zonedLocalToUtc(
    toParts.year,
    toParts.month,
    toParts.day,
    12,
    0,
    0,
    0,
    timeZone,
  );
  const msPerDay = 24 * 60 * 60 * 1000;
  const periodDays = Math.max(
    1,
    Math.round((toNoon.getTime() - fromNoon.getTime()) / msPerDay) + 1,
  );

  return {
    from,
    to,
    dateFrom: fromYmd.trim(),
    dateTo: toYmd.trim(),
    periodDays,
  };
}
