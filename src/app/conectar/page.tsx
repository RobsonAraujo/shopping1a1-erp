import type { Metadata } from "next";
import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { Gift, KeyRound, RotateCcw, ShieldAlert } from "lucide-react";
import { BrandLogo } from "@/components/shared/BrandLogo";
import { ConnectForm } from "@/components/marketing/ConnectForm";
import { UserFeedback } from "@/components/ui/user-feedback";
import { formatApiErrorMessage } from "@/lib/api/api-client-error";
import { getMarketingCtaState } from "@/lib/mercadolibre/session";
import {
  BETA_OFFER,
  isOfferActive,
  offerDeadlineLabel,
} from "@/lib/marketing/campaign-offer";
import { cn } from "@/lib/utils";

export const metadata: Metadata = {
  title: "Conectar sua conta do Mercado Livre",
  description:
    "O que acontece quando você conecta a sua conta do Mercado Livre à Maipo.",
  robots: { index: false, follow: false },
};

/**
 * Print da tela de consentimento do Mercado Livre com o aviso de app não
 * certificado (ex.: "/marketing/ml-aviso-nao-certificado.png"). Enquanto não
 * houver o print, o passo 2 fica só no texto.
 */
const ML_WARNING_SCREENSHOT: string | null = null;

const STEPS = [
  {
    icon: KeyRound,
    tone: "primary",
    title: "Você entra com a sua conta do Mercado Livre",
    body: "A senha fica no Mercado Livre: a Maipo nunca a vê. Recebemos só uma autorização de acesso, guardada criptografada.",
  },
  {
    icon: ShieldAlert,
    tone: "amber",
    title: "O Mercado Livre vai avisar que o aplicativo ainda não é certificado",
    body: "É esperado. O selo de certificação do Mercado Livre é dado a integradores com grande volume de vendas, e a Maipo está em beta. A conexão usa a API oficial do Mercado Livre, a mesma de qualquer integrador: sem robô, sem extensão, sem a sua senha. Pode continuar.",
  },
  {
    icon: RotateCcw,
    tone: "primary",
    title: "Você pode revogar quando quiser",
    body: "A autorização sai nas configurações de segurança da sua conta do Mercado Livre. E a Maipo só altera preço ou promoção quando você clica para fazer.",
  },
] as const;

type PageProps = {
  searchParams: Promise<{ error?: string; oferta?: string }>;
};

export default async function ConectarPage({ searchParams }: PageProps) {
  const sp = await searchParams;
  const errorCode = sp.error?.trim() || null;

  const { isLoggedIn, dashboardHref } = getMarketingCtaState(await cookies());
  if (isLoggedIn && !errorCode) redirect(dashboardHref);

  const offer =
    sp.oferta === BETA_OFFER.id && isOfferActive() ? BETA_OFFER.id : null;

  return (
    <div className="flex min-h-full flex-1 flex-col bg-[var(--background)]">
      <header className="px-4 pt-[calc(1.25rem+env(safe-area-inset-top))] sm:px-6">
        <div className="mx-auto flex max-w-xl items-center justify-between">
          <Link href={offer ? BETA_OFFER.path : "/"} aria-label="Maipo">
            <BrandLogo className="h-7" />
          </Link>
          <Link
            href={offer ? BETA_OFFER.path : "/"}
            className="text-sm text-[var(--muted-foreground)] hover:text-[var(--primary)]"
          >
            Voltar
          </Link>
        </div>
      </header>

      <main className="flex-1 px-4 pb-16 pt-8 sm:px-6 sm:pt-12">
        <div className="mx-auto max-w-xl">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--primary)]">
            Último passo
          </p>
          <h1 className="mt-3 text-balance text-[clamp(1.75rem,5vw,2.4rem)] font-bold leading-[1.12] tracking-tight text-[var(--primary)]">
            Antes de ir para o Mercado Livre
          </h1>
          <p className="mt-4 text-pretty text-[15px] leading-relaxed text-[var(--muted-foreground)] sm:text-base">
            Você vai autorizar a Maipo na tela do próprio Mercado Livre. Leva
            menos de um minuto, sem cartão e sem senha nova.
          </p>

          {errorCode ? (
            <UserFeedback
              tone="error"
              title="A conexão não foi concluída"
              className="mt-6"
            >
              {formatApiErrorMessage(errorCode)}
              {errorCode === "access_denied"
                ? " Se você parou no aviso de aplicativo não certificado, veja o passo 2 abaixo: ele é esperado durante o beta."
                : null}
            </UserFeedback>
          ) : null}

          {offer ? (
            <div className="mt-6 flex items-start gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-emerald-900">
              <Gift className="mt-0.5 size-4 shrink-0" aria-hidden />
              <p className="text-sm leading-relaxed">
                <strong className="font-semibold">
                  Sua oferta: {BETA_OFFER.trialDays} dias grátis garantidos.
                </strong>{" "}
                Vale para quem conectar até {offerDeadlineLabel()}, contados a
                partir do cadastro.
              </p>
            </div>
          ) : null}

          <ol className="mt-8 space-y-4">
            {STEPS.map((step, i) => {
              const Icon = step.icon;
              return (
                <li
                  key={step.title}
                  className="flex gap-4 rounded-2xl border border-[var(--border)] bg-[var(--card)] p-5 shadow-sm"
                >
                  <span
                    className={cn(
                      "inline-flex size-10 shrink-0 items-center justify-center rounded-xl",
                      step.tone === "amber"
                        ? "bg-amber-50 text-amber-700"
                        : "bg-[var(--secondary)] text-[var(--primary)]",
                    )}
                  >
                    <Icon className="size-5" aria-hidden />
                  </span>
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-[var(--muted-foreground)]">
                      Passo {i + 1}
                    </p>
                    <h2 className="mt-0.5 text-base font-semibold leading-snug text-[var(--foreground)]">
                      {step.title}
                    </h2>
                    <p className="mt-1.5 text-sm leading-relaxed text-[var(--muted-foreground)]">
                      {step.body}
                    </p>
                    {step.tone === "amber" && ML_WARNING_SCREENSHOT ? (
                      // eslint-disable-next-line @next/next/no-img-element -- print estático, sem otimização necessária
                      <img
                        src={ML_WARNING_SCREENSHOT}
                        alt="Tela de autorização do Mercado Livre com o aviso de aplicativo não certificado"
                        className="mt-3 w-full rounded-xl border border-[var(--border)]"
                        loading="lazy"
                      />
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ol>

          <div className="mt-8 rounded-2xl border border-[var(--border)] bg-[var(--card)] p-5 shadow-sm sm:p-6">
            <ConnectForm offer={offer} errorCode={errorCode} />
          </div>

          <p className="mt-6 text-center text-xs text-[var(--muted-foreground)]">
            <Link href="/privacidade" className="hover:text-[var(--primary)]">
              Privacidade
            </Link>
            {" · "}
            <Link href="/termos" className="hover:text-[var(--primary)]">
              Termos de uso
            </Link>
          </p>
        </div>
      </main>
    </div>
  );
}
