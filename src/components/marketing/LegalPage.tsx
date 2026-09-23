import { MarketingFooter, MarketingHeader } from "@/components/marketing/MarketingChrome";
import { legalUpdatedLabel } from "@/lib/marketing/legal";

/**
 * Casca das páginas de texto corrido (privacidade, termos). Sem CTA no meio:
 * quem chega aqui está checando um detalhe, não sendo convencido.
 */
export function LegalPage({
  isLoggedIn,
  dashboardHref,
  title,
  intro,
  children,
}: {
  isLoggedIn: boolean;
  dashboardHref: string;
  title: string;
  intro: string;
  children: React.ReactNode;
}) {
  return (
    <div className="marketing-landing flex min-h-full flex-1 flex-col">
      <MarketingHeader
        isLoggedIn={isLoggedIn}
        dashboardHref={dashboardHref}
        logoHref="/"
      />

      <main id="conteudo">
        <section className="marketing-hero relative overflow-hidden bg-gradient-to-br from-[#0a1130] to-[#1b2d6f] px-4 pb-14 text-white sm:px-6 sm:pb-16">
          <div
            className="marketing-hero-grid pointer-events-none absolute inset-0"
            aria-hidden
          />
          <div className="relative mx-auto max-w-3xl">
            <h1 className="text-balance text-[clamp(1.9rem,4.5vw,2.75rem)] font-bold leading-tight tracking-tight">
              {title}
            </h1>
            <p className="mt-4 max-w-2xl text-pretty leading-relaxed text-white/75">
              {intro}
            </p>
            <p className="mt-6 text-xs uppercase tracking-[0.14em] text-white/45">
              {legalUpdatedLabel()}
            </p>
          </div>
        </section>

        <section className="bg-white px-4 py-16 sm:px-6 sm:py-20">
          <div className="legal-prose mx-auto max-w-3xl">{children}</div>
        </section>
      </main>

      <MarketingFooter />
    </div>
  );
}

/** Um bloco numerado do documento. */
export function LegalSection({
  n,
  title,
  children,
}: {
  n: number;
  title: string;
  children: React.ReactNode;
}) {
  const id = `secao-${n}`;
  return (
    <section id={id} className="scroll-mt-28 border-t border-[var(--border)] py-8 first:border-t-0 first:pt-0">
      <h2 className="flex gap-3 text-lg font-semibold tracking-tight text-[var(--primary)]">
        <span className="font-mono text-sm tabular-nums text-[var(--muted-foreground)]">
          {String(n).padStart(2, "0")}
        </span>
        {title}
      </h2>
      <div className="mt-4 space-y-4">{children}</div>
    </section>
  );
}
