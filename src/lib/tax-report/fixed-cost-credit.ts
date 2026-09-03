import { roundMoney } from "@/lib/pricing/financial-margin";
import { isCurrentCalendarMonth } from "@/lib/mercadolibre/revenue-periods";
import { getZonedParts } from "@/lib/report-timezone";
import { reportsConfig } from "@/config/reports";

/** Alíquota de crédito PIS/COFINS não-cumulativo sobre custos fixos cadastrados (ex.: aluguel). */
export const FIXED_COST_CREDIT_RATE = 0.0925;

export function buildExplicitFixedCostMap(
  rows: Array<{ costItemId: string; year: number; month: number; amount: unknown }>,
): Map<string, number> {
  const map = new Map<string, number>();
  for (const row of rows) {
    const amount = Number(row.amount);
    if (!Number.isFinite(amount)) continue;
    map.set(`${row.year}:${row.month}:${row.costItemId}`, amount);
  }
  return map;
}

export function buildExcludedMonthsSet(
  rows: Array<{ costItemId: string; year: number; month: number }>,
): Set<string> {
  return new Set(
    rows.map((row) => `${row.year}:${row.month}:${row.costItemId}`),
  );
}

function isAtOrAfterCutoff(
  year: number,
  month: number,
  endYear: number | null | undefined,
  endMonth: number | null | undefined,
): boolean {
  if (endYear == null || endMonth == null) return false;
  if (year > endYear) return true;
  if (year < endYear) return false;
  return month >= endMonth;
}

/**
 * Valor efetivo de um item num mês.
 * 1. Se o item tem `endYear`/`endMonth` ("Encerrar gasto fixo") e o mês
 *    pedido é igual ou posterior ao corte, retorna `null` — ignora tudo mais.
 * 2. Se o mês exato pedido está em `excludedMonths` ("Remover valor deste
 *    mês"), retorna `null` só para esse mês — não afeta a herança de outros
 *    meses (o valor excluído nunca entra no `explicit` Map usado no walk-back).
 * 3. `recurring=true`: explícito ou herdado do último mês com valor cadastrado
 *    (incl. dez do ano anterior) — repete até ser alterado ou removido.
 *    `recurring=false`: só conta se houver um valor explícito exatamente para
 *    esse `(year, month)` — não herda de meses anteriores.
 */
export function resolveEffectiveFixedCostForMonth(
  costItemId: string,
  year: number,
  month: number,
  explicit: Map<string, number>,
  recurring = true,
  excludedMonths?: Set<string>,
  endYear?: number | null,
  endMonth?: number | null,
): number | null {
  if (isAtOrAfterCutoff(year, month, endYear, endMonth)) return null;
  if (excludedMonths?.has(`${year}:${month}:${costItemId}`)) return null;

  if (!recurring) {
    const key = `${year}:${month}:${costItemId}`;
    return explicit.has(key) ? explicit.get(key)! : null;
  }
  for (let y = year, m = month; y >= year - 1; ) {
    const key = `${y}:${m}:${costItemId}`;
    if (explicit.has(key)) return explicit.get(key)!;
    if (y === year - 1 && m === 1) break;
    m -= 1;
    if (m < 1) {
      m = 12;
      y -= 1;
    }
  }
  return null;
}

export type FixedCostCreditResolution = {
  totalRegistrado: number;
  totalCreditavel: number;
  diasCorridos: number;
  diasNoMes: number;
  mesEmAndamento: boolean;
};

export function resolveFixedCostCreditForMonth(input: {
  items: Array<{
    id: string;
    active: boolean;
    recurring: boolean;
    endYear?: number | null;
    endMonth?: number | null;
  }>;
  explicitValues: Map<string, number>;
  excludedMonths?: Set<string>;
  year: number;
  month: number;
  now?: Date;
  timeZone?: string;
}): FixedCostCreditResolution {
  const timeZone = input.timeZone ?? reportsConfig.catalogCompetitionTimezone;
  const totalRegistrado = roundMoney(
    input.items
      .filter((item) => item.active)
      .reduce((sum, item) => {
        const value = resolveEffectiveFixedCostForMonth(
          item.id,
          input.year,
          input.month,
          input.explicitValues,
          item.recurring,
          input.excludedMonths,
          item.endYear,
          item.endMonth,
        );
        return sum + (value ?? 0);
      }, 0),
  );

  const diasNoMes = new Date(input.year, input.month, 0).getDate();
  const mesEmAndamento = isCurrentCalendarMonth(input.year, input.month, timeZone);

  if (!mesEmAndamento) {
    return {
      totalRegistrado,
      totalCreditavel: totalRegistrado,
      diasCorridos: diasNoMes,
      diasNoMes,
      mesEmAndamento: false,
    };
  }

  const diasCorridos = getZonedParts(input.now ?? new Date(), timeZone).day;
  const totalCreditavel = roundMoney(
    (totalRegistrado * diasCorridos) / diasNoMes,
  );

  return { totalRegistrado, totalCreditavel, diasCorridos, diasNoMes, mesEmAndamento: true };
}
