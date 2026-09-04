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

/**
 * Mês civil fechado anterior a `reference` (hoje, por padrão) — ex.: em
 * qualquer dia de setembro, retorna agosto. Usado como âncora padrão do
 * imposto "ao vivo" (Produtos/Lucratividade): nunca olha pro mês em
 * andamento, que teria poucos dias de amostra no início do período.
 */
export function lastClosedMonth(
  reference: Date = new Date(),
): { year: number; month: number } {
  const year = reference.getFullYear();
  const currentMonthIndex0 = reference.getMonth(); // 0-11 do mês atual
  if (currentMonthIndex0 === 0) return { year: year - 1, month: 12 };
  return { year, month: currentMonthIndex0 }; // já é (mês atual 1-based - 1)
}
