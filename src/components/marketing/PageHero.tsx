import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { CtaReassurance } from "@/components/marketing/CtaBand";
import { OAuthCta } from "@/components/marketing/OauthCta";

/**
 * Hero das páginas de conteúdo (/dre-mercado-livre, /precos, ...). A landing
 * tem hero próprio, com o snapshot ao vivo; aqui o foco é a promessa + CTA.
 */
export function PageHero({
  isLoggedIn,
  dashboardHref,
  eyebrow,
  title,
  lead,
  breadcrumb,
  highlights,
  children,
}: {
  isLoggedIn: boolean;
  dashboardHref: string;
  eyebrow: string;
  title: React.ReactNode;
  lead: React.ReactNode;
  /** Trilha para a home: ajuda navegação e dá contexto ao crawler. */
  breadcrumb?: string;
  /** Até 3 fatos curtos, logo abaixo do CTA. */
  highlights?: readonly string[];
  children?: React.ReactNode;
}) {
  return (
    <section className="marketing-hero relative overflow-hidden bg-gradient-to-br from-[#0a1130] via-[#141f52] to-[#1b2d6f] px-4 pb-20 text-white sm:px-6 sm:pb-28">
      <div
        className="marketing-hero-grid pointer-events-none absolute inset-0"
        aria-hidden
      />
      <div
        className="pointer-events-none absolute -right-20 -top-20 size-80 rounded-full bg-cyan-400/20 blur-3xl"
        aria-hidden
      />
      <div
        className="pointer-events-none absolute -bottom-24 left-1/4 size-72 rounded-full bg-indigo-500/15 blur-3xl"
        aria-hidden
      />

      <div className="relative mx-auto max-w-3xl text-center">
        {breadcrumb ? (
          <nav
            aria-label="Trilha de navegação"
            className="mb-6 flex items-center justify-center gap-1 text-xs text-white/50"
          >
            <Link href="/" className="transition-colors hover:text-white/80">
              Início
            </Link>
            <ChevronRight className="size-3" aria-hidden />
            <span className="text-white/70">{breadcrumb}</span>
          </nav>
        ) : null}

        <p className="inline-flex items-center gap-2 rounded-full border border-cyan-300/25 bg-cyan-400/10 px-3.5 py-1.5 text-[11px] font-semibold uppercase tracking-[0.16em] text-cyan-100">
          {eyebrow}
        </p>

        <h1 className="mt-5 text-balance text-[clamp(2rem,5.2vw,3.4rem)] font-bold leading-[1.08] tracking-tight">
          {title}
        </h1>

        <p className="mx-auto mt-5 max-w-xl text-pretty text-base leading-relaxed text-white/75 sm:text-lg">
          {lead}
        </p>

        <div className="mt-9 flex flex-col items-center gap-5">
          <OAuthCta
            isLoggedIn={isLoggedIn}
            dashboardHref={dashboardHref}
            onDark
          />
          {!isLoggedIn ? <CtaReassurance onDark /> : null}
        </div>

        {highlights?.length ? (
          <ul className="mx-auto mt-12 grid max-w-2xl gap-3 sm:grid-cols-3">
            {highlights.map((item) => (
              <li
                key={item}
                className="rounded-xl border border-white/10 bg-white/[0.06] px-4 py-3 text-sm leading-snug text-white/80 backdrop-blur-sm"
              >
                {item}
              </li>
            ))}
          </ul>
        ) : null}

        {children}
      </div>
    </section>
  );
}
