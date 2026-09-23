import type { Metadata } from "next";
import Link from "next/link";
import { cookies } from "next/headers";
import { getMarketingCtaState } from "@/lib/mercadolibre/session";
import { siteUrl } from "@/lib/infra/site-url";
import { CtaBand } from "@/components/marketing/CtaBand";
import { DemoLucratividade } from "@/components/marketing/DemoLucratividade";
import { DemoLucratividadeSummary } from "@/components/marketing/DemoLucratividadeSummary";
import { MarketingFooter, MarketingHeader } from "@/components/marketing/MarketingChrome";
import { MarketingSection } from "@/components/marketing/MarketingSection";
import { MarginCalculator } from "@/components/marketing/MarginCalculator";
import { PageHero } from "@/components/marketing/PageHero";
import { MarketingStickyCta } from "@/components/marketing/StickyCta";

const title =
  "Margem de contribuição no Mercado Livre — calcule por anúncio";
const description =
  "Calcule a margem de contribuição de cada anúncio do Mercado Livre com tarifa, custo, imposto e Product Ads na mesma conta. Calculadora grátis e painel completo.";

export const metadata: Metadata = {
  title,
  description,
  alternates: {
    canonical: `${siteUrl()}/margem-de-contribuicao-mercado-livre`,
  },
  openGraph: {
    type: "website",
    url: `${siteUrl()}/margem-de-contribuicao-mercado-livre`,
    siteName: "ERP 1a1",
    locale: "pt_BR",
    title,
    description,
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

      <main id="conteudo">
        <PageHero
          isLoggedIn={isLoggedIn}
          dashboardHref={dashboardHref}
          breadcrumb="Lucratividade"
          eyebrow="Lucratividade · Margem"
          title="Calcule a margem de contribuição de cada anúncio do Mercado Livre"
          lead="Preço, tarifa ML, custo do produto e investimento em Product Ads: tudo por SKU, numa tabela só. Verde quando sobra, vermelho quando o anúncio come a operação, mesmo depois do ADS."
          highlights={[
            "Margem por anúncio, não só por SKU",
            "Pós ADS na coluna ao lado da margem",
            "O mesmo custo alimenta DRE e imposto",
          ]}
        />

        <MarketingSection
          id="calculadora"
          surface="tint"
          align="center"
          eyebrow="Calculadora grátis"
          title="Faça a conta de um anúncio agora"
          lead="Sem cadastro. Esta calculadora roda exatamente as mesmas funções de margem que o painel usa nas telas de Lucratividade e Precificação. O resultado aqui é o resultado lá."
        >
          <MarginCalculator
            isLoggedIn={isLoggedIn}
            dashboardHref={dashboardHref}
          />
        </MarketingSection>

        <MarketingSection
          surface="card"
          eyebrow="No painel"
          title="Produto, tipo, preço, margem e pós ADS"
          lead="As mesmas colunas do painel, para o catálogo inteiro. Sem exportar nada do Mercado Livre: a margem já considera a tarifa de venda e, quando o anúncio tem Product Ads ativo, o resultado depois do investimento em publicidade."
        >
          <div className="space-y-8">
            <DemoLucratividadeSummary />
            <DemoLucratividade />
          </div>
        </MarketingSection>

        <MarketingSection
          surface="base"
          width="narrow"
          eyebrow="Por quê"
          title="Por que margem “por anúncio” e não só por SKU"
        >
          <div className="legal-prose space-y-5">
            <p>
              Um mesmo produto pode ter mais de um anúncio ativo, com preços,
              tipo de anúncio (clássico ou premium) e frete diferentes. A
              margem calculada por anúncio mostra exatamente qual publicação
              está sustentando a operação e qual está vendendo no prejuízo,
              mesmo quando o SKU por trás é o mesmo.
            </p>
            <p>
              É também onde o Product Ads muda o jogo: o investimento não é
              distribuído igualmente entre as publicações. Um anúncio premium
              com TACOS alto pode ter margem de contribuição saudável e{" "}
              <strong>resultado negativo depois do ADS</strong>, e a conta por
              SKU esconde exatamente esse caso.
            </p>
            <p>
              O custo cadastrado por SKU aqui também alimenta o{" "}
              <Link href="/dre-mercado-livre">DRE do mês</Link> e a apuração
              fiscal do{" "}
              <Link href="/simples-nacional-mercado-livre">
                seu regime tributário
              </Link>
              . Cadastra uma vez, usa nos três lugares.
            </p>
          </div>
        </MarketingSection>

        <CtaBand
          isLoggedIn={isLoggedIn}
          dashboardHref={dashboardHref}
          title="Descubra quais anúncios realmente sobram."
          lead="Conecte sua loja e veja a margem real, anúncio por anúncio, com a tarifa e o ADS que o Mercado Livre cobrou de fato."
        />
      </main>

      <MarketingFooter />
      <MarketingStickyCta
        isLoggedIn={isLoggedIn}
        dashboardHref={dashboardHref}
      />
    </div>
  );
}
