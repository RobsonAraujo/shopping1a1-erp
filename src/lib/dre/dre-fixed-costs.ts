export function buildExplicitFixedCostMap(
  rows: Array<{
    costItemId: string;
    year: number;
    month: number;
    amount: unknown;
  }>,
): Map<string, number> {
  const map = new Map<string, number>();
  for (const row of rows) {
    const amount = Number(row.amount);
    if (!Number.isFinite(amount)) continue;
    map.set(`${row.year}:${row.month}:${row.costItemId}`, amount);
  }
  return map;
}

/** Valor efetivo por mês: explícito ou herança do último mês com valor (incl. dez do ano anterior). */
export function resolveEffectiveFixedCostsForYear(
  costItemIds: string[],
  year: number,
  explicit: Map<string, number>,
): Record<number, Record<string, number | null>> {
  const byMonth: Record<number, Record<string, number | null>> = {};
  for (let month = 1; month <= 12; month += 1) {
    byMonth[month] = {};
  }

  for (const costItemId of costItemIds) {
    let carrying: number | null = null;

    for (let month = 12; month >= 1; month -= 1) {
      const prevYearKey = `${year - 1}:${month}:${costItemId}`;
      if (explicit.has(prevYearKey)) {
        carrying = explicit.get(prevYearKey)!;
        break;
      }
    }

    for (let month = 1; month <= 12; month += 1) {
      const key = `${year}:${month}:${costItemId}`;
      if (explicit.has(key)) {
        carrying = explicit.get(key)!;
      }
      byMonth[month][costItemId] = carrying;
    }
  }

  return byMonth;
}

export function explicitFixedCostOverride(
  explicit: Map<string, number>,
  year: number,
  month: number,
  costItemId: string,
): number | null {
  const key = `${year}:${month}:${costItemId}`;
  return explicit.has(key) ? explicit.get(key)! : null;
}
