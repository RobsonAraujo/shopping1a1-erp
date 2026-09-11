import type { Metadata } from "next";
import { cookies } from "next/headers";
import { Sparkles, TrendingUp } from "lucide-react";
import { getMarketingCtaState } from "@/lib/mercadolibre/session";
import { siteUrl } from "@/lib/infra/site-url";
import { MarketingFooter, MarketingHeader } from "@/components/marketing/MarketingChrome";
import { OAuthCta } from "@/components/marketing/OauthCta";
import { PricingCards } from "@/components/marketing/PricingCards";

const title = "Preços — grátis durante o beta";
const description =
  "ERP 1a1 está em beta e é gratuito, sem cartão de crédito. Veja o que está incluso hoje e como vai funcionar quando os planos pagos forem lançados.";

export const metadata: Metadata = {
  title,
  description,
  alternates: { canonical: `${siteUrl()}/precos` },
  openGraph: {
    type: "website",
    url: `${siteUrl()}/precos`,
    siteName: "ERP 1a1",
    locale: "pt_BR",
    title,
    description,
    images: ["/logo-bg-blue.png"],
  },
};

const PRICING_FAQ = [
  {
    q: "Preciso cadastrar cartão?",
    a: "Não. Você só conecta sua conta do Mercado Livre — nenhum cartão, nenhum dado de pagamento.",
  },
  {
    q: "Por quanto tempo é gratuito?",
    a: "Enquanto estivermos em beta. Ainda não temos uma data definida para lançar planos pagos, e quando tivermos, avisamos com antecedência — nada muda sem aviso.",
  },
  {
    q: "Vou ser cobrado de surpresa?",
    a: "Não existe cobrança automática hoje, e não vai existir sem um aviso claro antes.",
  },
] as const;

export default async function PrecosPage() {
  const cookieStore = await cookies();
  const { isLoggedIn, dashboardHref } = getMarketingCtaState(cookieStore);

  return (
    <div className="marketing-landing flex min-h-full flex-1 flex-col">
      <MarketingHeader
        isLoggedIn={isLoggedIn}
        dashboardHref={dashboardHref}
        logoHref="/"
      />

      <main>
        <section className="marketing-hero relative overflow-hidden bg-gradient-to-br from-[#0a1130] via-[#141f52] to-[#1b2d6f] px-4 pb-16 text-white sm:px-6 sm:pb-24">
          <div className="relative mx-auto max-w-3xl text-center">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-cyan-300/30 bg-cyan-400/10 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-cyan-100">
              <Sparkles className="size-3.5" aria-hidden />
              Beta aberto
            </span>
            <h1 className="mt-4 text-[clamp(2rem,5vw,3.25rem)] font-bold leading-[1.1] tracking-tight">
              Grátis durante o beta. Sem cartão, sem pegadinha.
            </h1>
            <p className="mx-auto mt-4 max-w-xl text-base leading-relaxed text-white/80 sm:text-lg">
              Estamos em fase beta e liberamos acesso completo ao painel sem
              cobrança. Quando chegar a hora de cobrar, avisamos antes — com
              tempo de sobra para você decidir.
            </p>
            <div className="mt-8 flex justify-center">
              <OAuthCta
                isLoggedIn={isLoggedIn}
                dashboardHref={dashboardHref}
                onDark
              />
            </div>
            {!isLoggedIn ? (
              <p className="mt-3 text-sm text-white/65">
                Entra com sua conta do Mercado Livre · sem cartão · sem senha nova
              </p>
            ) : null}
          </div>
        </section>

        <section className="scroll-mt-20 bg-[var(--background)] px-4 py-16 sm:px-6 sm:py-20">
          <div className="mx-auto max-w-5xl">
            <div className="mx-auto max-w-2xl text-center">
              <h2 className="text-2xl font-bold tracking-tight text-[var(--primary)] sm:text-3xl">
                Planos
              </h2>
              <p className="mt-3 text-[15px] leading-relaxed text-[var(--muted-foreground)]">
                Hoje só existe o beta — gratuito e com o painel inteiro
                liberado. Os próximos planos ainda estão sendo desenhados.
              </p>
            </div>
            <div className="mt-8">
              <PricingCards isLoggedIn={isLoggedIn} dashboardHref={dashboardHref} />
            </div>
          </div>
        </section>

        <section className="bg-white px-4 py-16 sm:px-6 sm:py-20">
          <div className="mx-auto max-w-3xl">
            <h2 className="text-2xl font-bold tracking-tight text-[var(--primary)] sm:text-3xl">
              Como vai funcionar quando tiver preço
            </h2>
            <p className="mt-3 text-[15px] leading-relaxed text-[var(--muted-foreground)]">
              Ainda estamos validando o produto com quem usa de verdade —
              inclusive com quem está entrando agora. Por isso não fixamos um
              preço ainda: queremos ter certeza de que o valor entregue
              justifica o que vamos cobrar, não o contrário.
            </p>
            <p className="mt-3 text-[15px] leading-relaxed text-[var(--muted-foreground)]">
              Quando os planos pagos forem definidos, avisamos por e-mail e
              dentro do próprio painel, com antecedência — nada muda de uma
              hora para outra.
            </p>
          </div>
        </section>

        <section className="bg-[var(--background)] px-4 py-16 sm:px-6 sm:py-20">
          <div className="mx-auto max-w-3xl">
            <h2 className="text-2xl font-bold tracking-tight text-[var(--primary)] sm:text-3xl">
              Dúvidas rápidas
            </h2>
            <div className="mt-6 divide-y divide-[var(--border)] overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--card)] shadow-sm">
              {PRICING_FAQ.map((item) => (
                <div key={item.q} className="px-5 py-4">
                  <p className="font-medium text-[var(--foreground)]">{item.q}</p>
                  <p className="mt-1.5 text-sm leading-relaxed text-[var(--muted-foreground)]">
                    {item.a}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="bg-gradient-to-br from-[#1b2d6f] to-[#0f1a45] px-4 py-16 text-center text-white sm:px-6">
          <div className="mx-auto max-w-xl">
            <TrendingUp className="mx-auto size-8 text-cyan-300" aria-hidden />
            <h2 className="mt-4 text-2xl font-bold sm:text-3xl">
              Teste com a sua loja de verdade, sem custo.
            </h2>
            <p className="mt-3 text-white/75">
              Lucratividade, tributário, catálogo e DRE no mesmo lugar.
            </p>
            <div className="mt-8 flex flex-col items-center gap-3">
              <OAuthCta
                isLoggedIn={isLoggedIn}
                dashboardHref={dashboardHref}
                onDark
              />
              {!isLoggedIn ? (
                <p className="text-sm text-white/60">
                  Sem cartão · sem senha nova
                </p>
              ) : null}
            </div>
          </div>
        </section>
      </main>

      <MarketingFooter />
    </div>
  );
}
