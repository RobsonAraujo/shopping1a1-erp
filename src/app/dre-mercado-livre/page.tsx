import type { Metadata } from "next";
import Link from "next/link";
import { cookies } from "next/headers";
import { getMarketingCtaState } from "@/lib/mercadolibre/session";
import { siteUrl } from "@/lib/infra/site-url";
import { CtaBand } from "@/components/marketing/CtaBand";
import { DefinitionList } from "@/components/marketing/DefinitionList";
import { DemoDre } from "@/components/marketing/DemoDre";
import { DemoDreCharts } from "@/components/marketing/DemoDreCharts";
import { MarketingFooter, MarketingHeader } from "@/components/marketing/MarketingChrome";
import { MarketingSection } from "@/components/marketing/MarketingSection";
import { PageHero } from "@/components/marketing/PageHero";
import { MarketingStickyCta } from "@/components/marketing/StickyCta";

const title = "DRE para vendedor Mercado Livre — resultado mensal automático";
const description =
  "Monte o DRE da sua loja Mercado Livre sem planilha: receita, tarifas, CMV, impostos e ADS fecham sozinhos com a fatura ML. Teste grátis, sem cartão.";

export const metadata: Metadata = {
  title,
  description,
  alternates: { canonical: `${siteUrl()}/dre-mercado-livre` },
  openGraph: {
    type: "website",
    url: `${siteUrl()}/dre-mercado-livre`,
    siteName: "ERP 1a1",
    locale: "pt_BR",
    title,
    description,
  },
};

const SOURCES = [
  {
    term: "Receita e tarifas ML",
    body: (
      <>
        Sincronizadas direto da fatura, sem digitação manual, inclusive
        desconto de tarifa e devolução parcial.
      </>
    ),
  },
  {
    term: "Custo do produto (CMV)",
    body: (
      <>
        A partir do custo cadastrado por SKU em{" "}
        <Link href="/margem-de-contribuicao-mercado-livre">Lucratividade</Link>.
      </>
    ),
  },
  {
    term: "Impostos",
    body: (
      <>
        A apuração de{" "}
        <Link href="/lucro-real-mercado-livre">Lucro Real</Link> ou a alíquota
        efetiva do{" "}
        <Link href="/simples-nacional-mercado-livre">Simples Nacional</Link>{" "}
        configurada na sua empresa.
      </>
    ),
  },
  {
    term: "Investimento em ADS",
    body: <>Descontado do resultado operacional, mês a mês.</>,
  },
] as const;

export default async function DreMercadoLivrePage() {
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
          breadcrumb="DRE"
          eyebrow="DRE · Financeiro"
          title="O DRE da sua loja Mercado Livre, sem exportar planilha"
          lead="Receita, tarifa ML, CMV, impostos e investimento em ADS entram automaticamente a partir da fatura do Mercado Livre. O resultado do mês fecha numa leitura vertical, igual ao número que já apareceu na lucratividade e no tributário."
          highlights={[
            "Fecha com a fatura, não com estimativa",
            "Cada linha abre a auditoria do cálculo",
            "Evolução mensal e cascata do resultado",
          ]}
        />

        <MarketingSection
          surface="base"
          eyebrow="Demonstrativo"
          title="O mês inteiro, linha a linha"
          lead="Cada linha do DRE tem um modal de auditoria mostrando como o número foi calculado: vendas canceladas, devoluções parciais, tarifas especiais, custo do produto e imposto operacional. Sem caixa-preta no resultado do mês."
        >
          <DemoDre />
        </MarketingSection>

        <MarketingSection
          surface="card"
          eyebrow="Tendência"
          eyebrowTone="sky"
          title="Evolução mensal e visão em cascata"
          lead="Faturamento, margem de contribuição e lucro operacional mês a mês, mais o mesmo gráfico de rosca e a cascata do resultado que você vê dentro do painel, não uma versão simplificada."
        >
          <DemoDreCharts />
        </MarketingSection>

        <MarketingSection
          surface="base"
          width="narrow"
          eyebrow="Fontes"
          title="O que alimenta o DRE"
          lead="Quatro entradas, todas já existentes em outro ponto do painel: nada é digitado duas vezes."
        >
          <DefinitionList items={SOURCES} />
          <p className="mt-6 text-sm leading-relaxed text-[var(--muted-foreground)]">
            O DRE não substitui o contador nem emite nota fiscal; ele apoia o
            fechamento mensal com números já reconciliados com a fatura do
            Mercado Livre.
          </p>
        </MarketingSection>

        <CtaBand
          isLoggedIn={isLoggedIn}
          dashboardHref={dashboardHref}
          title="Veja o DRE da sua loja de verdade."
          lead="Conecte sua conta do Mercado Livre e feche o mês em minutos, com cada linha auditável."
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
