import type { Metadata } from "next";
import Link from "next/link";
import { cookies } from "next/headers";
import { TrendingUp } from "lucide-react";
import { getMarketingCtaState } from "@/lib/mercadolibre/session";
import { siteUrl } from "@/lib/infra/site-url";
import { DemoLucratividade } from "@/components/marketing/DemoLucratividade";
import { DemoLucratividadeSummary } from "@/components/marketing/DemoLucratividadeSummary";
import { MarketingFooter, MarketingHeader } from "@/components/marketing/MarketingChrome";
import { OAuthCta } from "@/components/marketing/OauthCta";

const title = "Margem de contribuição por anúncio no Mercado Livre";
const description =
  "Veja se cada anúncio sobra depois da tarifa do Mercado Livre e do Product Ads. Margem por SKU, com custo, imposto e ADS descontados. Teste grátis.";

export const metadata: Metadata = {
  title,
  description,
  alternates: { canonical: `${siteUrl()}/margem-de-contribuicao-mercado-livre` },
  openGraph: {
    type: "website",
    url: `${siteUrl()}/margem-de-contribuicao-mercado-livre`,
    siteName: "ERP 1a1",
    locale: "pt_BR",
    title,
    description,
    images: ["/logo-bg-blue.png"],
  },
};

export default async function MargemContribuicaoPage() {
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
            <p className="text-sm font-semibold uppercase tracking-wide text-cyan-200">
              Lucratividade · Margem
            </p>
            <h1 className="mt-3 text-[clamp(2rem,5vw,3.25rem)] font-bold leading-[1.1] tracking-tight">
              Calcule a margem de contribuição de cada anúncio do Mercado Livre
            </h1>
            <p className="mx-auto mt-4 max-w-xl text-base leading-relaxed text-white/80 sm:text-lg">
              Preço, tarifa ML, custo do produto e investimento em Product Ads
              — tudo por SKU, numa tabela só. Verde quando sobra, vermelho
              quando o anúncio come a operação, mesmo depois do ADS.
            </p>
            <div className="mt-8 flex justify-center">
              <OAuthCta
                isLoggedIn={isLoggedIn}
                dashboardHref={dashboardHref}
                onDark
              />
            </div>
          </div>
        </section>

        <section className="scroll-mt-20 bg-[var(--background)] px-4 py-16 sm:px-6 sm:py-20">
          <div className="mx-auto max-w-6xl space-y-8">
            <div className="max-w-2xl">
              <h2 className="text-2xl font-bold tracking-tight text-[var(--primary)] sm:text-3xl">
                Produto, tipo, preço, margem e pós ADS
              </h2>
              <p className="mt-3 text-[15px] leading-relaxed text-[var(--muted-foreground)]">
                As mesmas colunas do painel. Sem exportar nada do Mercado
                Livre: a margem já considera a tarifa de venda e, quando o
                anúncio tem Product Ads ativo, o resultado depois do
                investimento em publicidade.
              </p>
            </div>
            <DemoLucratividadeSummary />
            <DemoLucratividade />
          </div>
        </section>

        <section className="bg-white px-4 py-16 sm:px-6 sm:py-20">
          <div className="mx-auto max-w-3xl space-y-6">
            <h2 className="text-2xl font-bold tracking-tight text-[var(--primary)] sm:text-3xl">
              Por que margem &ldquo;por anúncio&rdquo; e não só por SKU
            </h2>
            <p className="text-[15px] leading-relaxed text-[var(--muted-foreground)]">
              Um mesmo produto pode ter mais de um anúncio ativo — com preços,
              tipo de anúncio (clássico ou premium) e frete diferentes. A
              margem calculada por anúncio mostra exatamente qual publicação
              está sustentando a operação e qual está vendendo no prejuízo,
              mesmo quando o SKU por trás é o mesmo.
            </p>
            <p className="text-[15px] leading-relaxed text-[var(--muted-foreground)]">
              O custo cadastrado por SKU aqui também alimenta o{" "}
              <Link href="/dre-mercado-livre" className="text-[var(--primary)] underline underline-offset-2">
                DRE do mês
              </Link>{" "}
              e a apuração fiscal do{" "}
              <Link href="/simples-nacional-mercado-livre" className="text-[var(--primary)] underline underline-offset-2">
                seu regime tributário
              </Link>
              — cadastra uma vez, usa nos três lugares.
            </p>
          </div>
        </section>

        <section className="bg-gradient-to-br from-[#1b2d6f] to-[#0f1a45] px-4 py-16 text-center text-white sm:px-6">
          <div className="mx-auto max-w-xl">
            <TrendingUp className="mx-auto size-8 text-cyan-300" aria-hidden />
            <h2 className="mt-4 text-2xl font-bold sm:text-3xl">
              Descubra quais anúncios realmente sobram.
            </h2>
            <p className="mt-3 text-white/75">
              Conecte sua loja e veja a margem real, anúncio por anúncio.
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
