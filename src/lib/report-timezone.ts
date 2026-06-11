import { reportsConfig } from "@/config/reports";

export function getZonedParts(date: Date, timeZone: string) {
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

export function zonedLocalToUtc(
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
  const offsetMs = new Date(inTz).getTime() - new Date(inUtc).getTime();
  return new Date(utcGuess - offsetMs);
}

/** Calendar day in report timezone, minus `dayOffset`, at hour:minute. */
export function atReportTime(
  base: Date,
  dayOffset: number,
  hour: number,
  minute: number,
  timeZone: string = reportsConfig.catalogCompetitionTimezone,
): Date {
  const today = getZonedParts(base, timeZone);
  const noonUtc = zonedLocalToUtc(
    today.year,
    today.month,
    today.day,
    12,
    0,
    0,
    0,
    timeZone,
  );
  const targetNoon = new Date(noonUtc.getTime() - dayOffset * 24 * 60 * 60 * 1000);
  const target = getZonedParts(targetNoon, timeZone);
  return zonedLocalToUtc(
    target.year,
    target.month,
    target.day,
    hour,
    minute,
    0,
    0,
    timeZone,
  );
}
