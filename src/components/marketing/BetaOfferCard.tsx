import { Check, Gift, PartyPopper } from "lucide-react";
import { CtaReassurance } from "@/components/marketing/CtaBand";
import { OAuthCta } from "@/components/marketing/OauthCta";
import { OfferCountdown } from "@/components/marketing/OfferCountdown";
import { BETA_OFFER } from "@/lib/marketing/campaign-offer";
import { cn } from "@/lib/utils";

export type BetaCta = {
  isLoggedIn: boolean;
  dashboardHref: string;
  connectHref: string;
  label: string;
};

/**
 * O "ingresso" da oferta da `/beta`: o que vem incluso, quanto falta e o botão.
 * O mesmo cartão aparece no hero e na seção de oferta, para a promessa ser
 * idêntica nos dois pontos. Depois do prazo vira o cartão do beta grátis.
 */
export function BetaOfferCard({
  cta,
  location,
  offerActive,
  serverNowMs,
  deadlineLabel,
  className,
}: {
  cta: BetaCta;
  /** Vai no `cta_click` (beta_hero_card, beta_offer…). */
  location: string;
  offerActive: boolean;
  serverNowMs: number;
  deadlineLabel: string;
  className?: string;
}) {
  const included = [
    "Painel completo: lucratividade, calculadora, Central de anúncios, tributário, DRE e kanban",
    offerActive
      ? `${BETA_OFFER.trialDays} dias contados do cadastro, mesmo que os planos pagos saiam antes`
      : "Grátis enquanto durar o beta",
    "Sem cartão de crédito",
    "Nada é cobrado sem aviso e sem você concordar",
  ];

  return (
    <div
      className={cn(
        "w-full max-w-md overflow-hidden rounded-3xl bg-white text-left text-[var(--foreground)] shadow-[0_30px_80px_-30px_rgba(5,10,40,0.65)] ring-1 ring-black/5",
        className,
      )}
    >
      <div className="px-6 pt-6 sm:px-8 sm:pt-8">
        {offerActive ? (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-900">
            <Gift className="size-3.5" aria-hidden />
            Oferta de lançamento do beta
          </span>
        ) : (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-800">
            <PartyPopper className="size-3.5" aria-hidden />
            Beta aberto
          </span>
        )}
        <p className="mt-4 text-[clamp(2.5rem,7vw,3.25rem)] font-bold leading-none tracking-tight text-[#1b2d6f]">
          {offerActive ? `${BETA_OFFER.trialDays} dias grátis` : "Grátis no beta"}
        </p>
        <p className="mt-2.5 text-sm leading-relaxed text-[var(--muted-foreground)]">
          {offerActive ? (
            <>
              Garantidos para quem conectar a conta até{" "}
              <strong className="font-semibold text-[var(--foreground)]">
                {deadlineLabel}
              </strong>
              .
            </>
          ) : (
            <>
              A oferta de {BETA_OFFER.trialDays} dias encerrou em {deadlineLabel},
              mas o beta continua grátis.
            </>
          )}
        </p>
      </div>

      <div
        className="mx-6 my-6 border-t-2 border-dashed border-[var(--border)] sm:mx-8"
        aria-hidden
      />

      <div className="px-6 pb-6 sm:px-8 sm:pb-8">
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--muted-foreground)]">
          O que vem incluso
        </p>
        <ul className="mt-3 space-y-2.5">
          {included.map((line) => (
            <li
              key={line}
              className="flex items-start gap-2.5 text-sm leading-relaxed"
            >
              <span
                className="mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-emerald-700"
                aria-hidden
              >
                <Check className="size-3" strokeWidth={3} />
              </span>
              {line}
            </li>
          ))}
        </ul>

        {offerActive ? (
          <div className="mt-6">
            <p className="text-center text-xs font-semibold uppercase tracking-[0.14em] text-[var(--muted-foreground)]">
              A oferta termina em
            </p>
            <OfferCountdown
              serverNowMs={serverNowMs}
              variant="blocks"
              className="mt-2.5"
            />
          </div>
        ) : null}

        <OAuthCta {...cta} location={location} className="mt-6 w-full" />
        {!cta.isLoggedIn ? <CtaReassurance className="mt-4" /> : null}
      </div>
    </div>
  );
}
