/**
 * "Sem venda recente": anúncio ativo sem nenhuma venda nos últimos N dias.
 * Puro — a UI e a view só aplicam; a data vem do retrato do Atualizar.
 */

const DAY_MS = 24 * 60 * 60 * 1000;

export const NO_RECENT_SALES_DEFAULT_DAYS = 3;
export const NO_RECENT_SALES_QUICK_DAYS = [2, 3, 7, 14] as const;

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
