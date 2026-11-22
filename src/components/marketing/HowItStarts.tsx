import { cn } from "@/lib/utils";
import { CtaReassurance } from "@/components/marketing/CtaBand";
import { MarketingSection } from "@/components/marketing/MarketingSection";
import { OAuthCta } from "@/components/marketing/OauthCta";

export type HowItStartsStep = { n: string; title: string; body: string };

const STEPS: readonly HowItStartsStep[] = [
  {
    n: "01",
    title: "Conecte a conta do Mercado Livre",
    body: "Testar grátis abre o OAuth oficial, sem senha nova e sem cartão. A organização da sua loja é criada na hora; os tokens ficam criptografados no servidor.",
  },
  {
    n: "02",
    title: "Cadastre o que a ML não sabe",
    body: "Custo de nota, ST e regime (lucro real ou simples nacional) no cadastro. Lucratividade e tributário passam a usar o mesmo número, sem planilha paralela.",
  },
  {
    n: "03",
    title: "Acompanhe o mês",
    body: "Catálogo, fatura, Full e vendas entram sozinhos. Você lê margem, apuração por SKU, DRE e o kanban de compras no mesmo painel.",
  },
];

export function MarketingHowItStarts({
  isLoggedIn,
  dashboardHref,
  id = "como-comeca",
  eyebrow = "Começar",
  title = "Três passos. Sem onboarding de planilha.",
  lead = "Autoriza a loja, informa custo e regime. O resto o painel calcula.",
  steps = STEPS,
  connectHref,
  ctaLabel,
  location = "how_it_starts",
}: {
  isLoggedIn: boolean;
  dashboardHref: string;
  /** A `/beta` troca textos, passos e destino do botão. */
  id?: string;
  eyebrow?: string;
  title?: string;
  lead?: string;
  steps?: readonly HowItStartsStep[];
  connectHref?: string;
  ctaLabel?: string;
  location?: string;
}) {
  return (
    <MarketingSection
      id={id}
      surface="base"
      width="narrow"
      align="center"
      eyebrow={eyebrow}
      title={title}
      lead={lead}
    >
      <ol className="overflow-hidden rounded-2xl border border-[var(--border)] bg-white shadow-sm">
        {steps.map((step, i) => (
          <li
            key={step.n}
            className={cn(
              "grid gap-4 px-5 py-7 sm:grid-cols-[4.5rem_1fr] sm:gap-6 sm:px-8",
              i < steps.length - 1 && "border-b border-[var(--border)]",
            )}
          >
            <p
              className="font-mono text-3xl font-bold tabular-nums leading-none text-[#1b2d6f]/15 sm:text-4xl"
              aria-hidden
            >
              {step.n}
            </p>
            <div>
              <h3 className="text-lg font-semibold text-[var(--primary)]">
                {step.title}
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-[var(--muted-foreground)] sm:text-[15px]">
                {step.body}
              </p>
            </div>
          </li>
        ))}
      </ol>

      <div className="mt-9 flex flex-col items-center gap-4">
        <OAuthCta
          isLoggedIn={isLoggedIn}
          dashboardHref={dashboardHref}
          connectHref={connectHref}
          label={ctaLabel}
          location={location}
        />
        {!isLoggedIn ? <CtaReassurance /> : null}
      </div>
    </MarketingSection>
  );
}
