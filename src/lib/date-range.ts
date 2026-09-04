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

function ymdToLocalDate(ymd: string): Date {
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(y, m - 1, d);
}

/**
 * Meses (mais recente primeiro) cobertos pelos últimos `days` dias corridos
 * terminando hoje, com quantos desses dias caem em cada mês — usado para
 * ponderar dados já agregados por mês (ex.: % de imposto do relatório
 * tributário) por uma janela móvel, sem reagregar por transação/dia. A soma
 * de `weightDays` de todos os meses retornados é sempre `days`.
 */
export function lastDaysMonthWeights(
  days: 30,
): { year: number; month: number; weightDays: number }[] {
  const { from, to } = lastDaysYmdRange(days);
  const fromDate = ymdToLocalDate(from);
  const toDate = ymdToLocalDate(to);

  return monthsInRange(from, to)
    .map(({ year, month }) => {
      const monthStart = new Date(year, month - 1, 1);
      const monthEnd = new Date(year, month, 0);
      const rangeStart = monthStart > fromDate ? monthStart : fromDate;
      const rangeEnd = monthEnd < toDate ? monthEnd : toDate;
      const weightDays =
        Math.round((rangeEnd.getTime() - rangeStart.getTime()) / 86_400_000) + 1;
      return { year, month, weightDays };
    })
    .reverse();
}
