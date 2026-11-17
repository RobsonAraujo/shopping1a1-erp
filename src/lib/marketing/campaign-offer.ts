/**
 * Oferta da página de campanha `/beta`: 30 dias grátis garantidos para quem
 * conectar a conta até o prazo. O resto do site segue com "grátis no beta";
 * a diferença é a garantia por escrito, gravada na organização
 * (`Organization.signupOffer` + `trialEndsAt`) para ser honrada quando houver
 * cobrança. Nada é bloqueado no fim do prazo por enquanto.
 *
 * O prazo é real: depois dele a página troca o texto e o callback deixa de
 * conceder a oferta. Nunca usar contador que reinicia.
 */
export const BETA_OFFER = {
  id: "beta-30d-2026-11",
  /** Fim do dia 30/11/2026 em Brasília. */
  deadline: new Date("2026-11-30T23:59:59-03:00"),
  trialDays: 30,
  path: "/beta",
} as const;

export function isOfferActive(now: Date = new Date()): boolean {
  return now.getTime() <= BETA_OFFER.deadline.getTime();
}

const OFFER_TIME_ZONE = "America/Sao_Paulo";

/** Dia do calendário em Brasília, como número de dias desde a época. */
function calendarDay(date: Date): number {
  const [y, m, d] = date
    .toLocaleDateString("en-CA", { timeZone: OFFER_TIME_ZONE })
    .split("-")
    .map(Number);
  return Date.UTC(y, m - 1, d) / 86_400_000;
}

/**
 * Dias do calendário (Brasília) que ainda restam, contando hoje: 1 no próprio
 * dia 30/11, 0 depois do prazo.
 */
export function daysLeftInOffer(now: Date = new Date()): number {
  if (!isOfferActive(now)) return 0;
  return calendarDay(BETA_OFFER.deadline) - calendarDay(now) + 1;
}

/** "faltam 15 dias" / "último dia", para o selo e a seção da oferta. */
export function daysLeftLabel(daysLeft: number): string {
  return daysLeft <= 1 ? "último dia" : `faltam ${daysLeft} dias`;
}

/** Data de fim do teste para uma conta criada em `createdAt` com a oferta. */
export function offerTrialEndsAt(createdAt: Date): Date {
  return new Date(createdAt.getTime() + BETA_OFFER.trialDays * 86_400_000);
}

/** "30/11", para o texto do selo e do hero. */
export function offerDeadlineLabel(): string {
  return BETA_OFFER.deadline.toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    timeZone: OFFER_TIME_ZONE,
  });
}
