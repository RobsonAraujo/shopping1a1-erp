/**
 * "Sem venda recente": anúncio ativo sem nenhuma venda nos últimos N dias.
 * Puro — a UI e a view só aplicam; a data vem do retrato do Atualizar.
 */

const DAY_MS = 24 * 60 * 60 * 1000;

export const NO_RECENT_SALES_DEFAULT_DAYS = 3;
/** Prazos do filtro (chips). Só aparecem os que cabem nos dias de vendas lidos. */
export const NO_RECENT_SALES_QUICK_DAYS = [2, 3, 7, 14, 30, 60] as const;

function isQuickDays(value: unknown): value is number {
  return NO_RECENT_SALES_QUICK_DAYS.some((option) => option === value);
}

/**
 * Prazos que dá para afirmar com os dias de vendas lidos (`null` = nada lido
 * ainda: todos, o filtro não terá candidatos de qualquer jeito).
 */
export function noRecentSalesDayOptions(windowDays: number | null): number[] {
  return NO_RECENT_SALES_QUICK_DAYS.filter(
    (option) => windowDays === null || option <= windowDays,
  );
}

/**
 * Prazo efetivo a partir do salvo no navegador. Valor que não é chip (prazo
 * digitado no campo antigo, lixo) volta ao padrão; chip acima dos dias lidos
 * cai no maior que cabe — um prazo impossível nunca esvazia o grupo.
 */
export function resolveNoRecentSalesDays(
  stored: unknown,
  windowDays: number | null,
): number {
  const days = isQuickDays(stored) ? stored : NO_RECENT_SALES_DEFAULT_DAYS;
  const options = noRecentSalesDayOptions(windowDays);
  if (options.includes(days)) return days;
  return options.at(-1) ?? NO_RECENT_SALES_QUICK_DAYS[0];
}

export type NoRecentSalesInput = {
  mlStatus: string;
  /** ISO da venda mais recente na janela; `null` = zero vendas na janela. */
  lastSaleAt: string | null;
  /** `null` = vendas não foram lidas nesta rodada (ou retrato antigo). */
  salesWindowDays: number | null;
  listedAt: string | null;
  firstSeenAt: string;
  /** Janela pedida pelo usuário (dias). */
  days: number;
  now: Date;
};

/**
 * Anúncio entra em "Sem venda recente" quando está ativo, a leitura de vendas
 * cobre pelo menos N dias, o anúncio já existe há N dias e não vendeu nesse
 * prazo.
 */
export function isNoRecentSales(input: NoRecentSalesInput): boolean {
  if (input.mlStatus !== "active") return false;
  if (input.salesWindowDays === null || input.salesWindowDays <= 0) return false;
  if (!Number.isFinite(input.days) || input.days < 1) return false;
  if (input.days > input.salesWindowDays) return false;

  const ageMs =
    input.now.getTime() -
    new Date(input.listedAt ?? input.firstSeenAt).getTime();
  if (!Number.isFinite(ageMs) || ageMs < input.days * DAY_MS) return false;

  if (input.lastSaleAt === null) return true;

  const lastSaleMs = new Date(input.lastSaleAt).getTime();
  if (!Number.isFinite(lastSaleMs)) return false;
  return input.now.getTime() - lastSaleMs >= input.days * DAY_MS;
}

/** Dias desde a última venda (só com `lastSaleAt`). */
export function daysSinceLastSale(
  lastSaleAt: string,
  now: Date,
): number {
  const ms = now.getTime() - new Date(lastSaleAt).getTime();
  if (!Number.isFinite(ms) || ms < 0) return 0;
  return Math.floor(ms / DAY_MS);
}

/** Frase do card: há quanto tempo vendeu pela última vez. */
export function noRecentSalesNote(
  input: { lastSaleAt: string | null; salesWindowDays: number },
  now: Date,
): string {
  if (input.lastSaleAt === null) {
    return `Nenhuma venda nos últimos ${input.salesWindowDays} dias`;
  }
  const days = daysSinceLastSale(input.lastSaleAt, now);
  if (days <= 0) return "Última venda hoje";
  if (days === 1) return "Última venda ontem";
  return `Última venda há ${days} dias`;
}
