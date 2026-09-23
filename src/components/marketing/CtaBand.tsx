import { CreditCard, KeyRound, ShieldCheck } from "lucide-react";
import { OAuthCta } from "@/components/marketing/OauthCta";
import { cn } from "@/lib/utils";

/** Reforço de confiança colado no botão — o ponto da página onde a objeção aparece. */
const REASSURANCE = [
  { icon: ShieldCheck, label: "OAuth oficial do Mercado Livre" },
  { icon: CreditCard, label: "Sem cartão de crédito" },
  { icon: KeyRound, label: "Sem senha nova" },
] as const;

export function CtaReassurance({
  className,
  onDark = false,
}: {
  className?: string;
  onDark?: boolean;
}) {
  return (
    <ul
      className={cn(
        "flex flex-wrap items-center justify-center gap-x-5 gap-y-2",
        className,
      )}
    >
      {REASSURANCE.map(({ icon: Icon, label }) => (
        <li
          key={label}
          className={cn(
            "inline-flex items-center gap-1.5 text-xs",
            onDark ? "text-white/60" : "text-[var(--muted-foreground)]",
          )}
        >
          <Icon
            className={cn(
              "size-3.5 shrink-0",
              onDark ? "text-emerald-300" : "text-emerald-600",
            )}
            aria-hidden
          />
          {label}
        </li>
      ))}
    </ul>
  );
}

export function CtaBand({
  isLoggedIn,
  dashboardHref,
  title,
  lead,
}: {
  isLoggedIn: boolean;
  dashboardHref: string;
  title: string;
  lead: string;
}) {
  return (
    <section className="relative overflow-hidden bg-[#0f1a45] px-4 py-20 text-center text-white sm:px-6 sm:py-24">
      <div
        className="marketing-hero-grid pointer-events-none absolute inset-0"
        aria-hidden
      />
      <div
        className="pointer-events-none absolute left-1/2 top-0 size-[32rem] -translate-x-1/2 -translate-y-1/2 rounded-full bg-cyan-400/15 blur-3xl"
        aria-hidden
      />
      <div className="relative mx-auto max-w-2xl">
        <h2 className="text-balance text-[clamp(1.6rem,3.4vw,2.35rem)] font-bold leading-[1.15] tracking-tight">
          {title}
        </h2>
        <p className="mx-auto mt-4 max-w-lg text-pretty leading-relaxed text-white/75">
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
      </div>
    </section>
  );
}
