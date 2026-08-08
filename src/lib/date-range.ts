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
export function lastDaysYmdRange(days: 7 | 15 | 30): {
  from: string;
  to: string;
} {
  const to = new Date();
  const from = new Date(to);
  from.setDate(from.getDate() - (days - 1));
  return { from: ymdFromLocalDate(from), to: ymdFromLocalDate(to) };
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
