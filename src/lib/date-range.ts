export function todayYmdLocal(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function ymdFromLocalDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** Inclusive window ending today (7 = today + 6 previous days). */
export function lastDaysYmdRange(
  days: 7 | 15 | 30 | 60 | 90,
  now: Date = new Date(),
): {
  from: string;
  to: string;
} {
  const to = new Date(now);
  const from = new Date(to);
  from.setDate(from.getDate() - (days - 1));
  return { from: ymdFromLocalDate(from), to: ymdFromLocalDate(to) };
}

/** Só o dia de ontem (calendário local). */
export function yesterdayYmdRange(now: Date = new Date()): {
  from: string;
  to: string;
} {
  const day = new Date(now);
  day.setDate(day.getDate() - 1);
  const ymd = ymdFromLocalDate(day);
  return { from: ymd, to: ymd };
}

/** Do dia 1 do mês corrente até hoje (inclusive). */
export function currentMonthYmdRange(now: Date = new Date()): {
  from: string;
  to: string;
} {
  const from = new Date(now.getFullYear(), now.getMonth(), 1);
  return { from: ymdFromLocalDate(from), to: ymdFromLocalDate(now) };
}

/** Meses civis (inclusive) cobertos por um range de datas YMD (ex.: 2026-07-20 a 2026-08-05 -> [{2026,7},{2026,8}]). */
export function monthsInRange(
  fromYmd: string,
  toYmd: string,
): { year: number; month: number }[] {
  const [fromYear, fromMonth] = fromYmd.split("-").map(Number);
  const [toYear, toMonth] = toYmd.split("-").map(Number);

  const months: { year: number; month: number }[] = [];
  let year = fromYear;
  let month = fromMonth;
  while (year < toYear || (year === toYear && month <= toMonth)) {
    months.push({ year, month });
    month += 1;
    if (month > 12) {
      month = 1;
      year += 1;
    }
  }
  return months;
}
