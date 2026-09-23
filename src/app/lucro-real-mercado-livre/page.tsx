import type { Metadata } from "next";
import Link from "next/link";
import { cookies } from "next/headers";
import { getMarketingCtaState } from "@/lib/mercadolibre/session";
import { siteUrl } from "@/lib/infra/site-url";
import { CtaBand } from "@/components/marketing/CtaBand";
import { DefinitionList } from "@/components/marketing/DefinitionList";
import { DemoTaxAudit } from "@/components/marketing/DemoTaxAudit";
import { DemoTributario } from "@/components/marketing/DemoTributario";
import { MarketingFooter, MarketingHeader } from "@/components/marketing/MarketingChrome";
import { MarketingSection } from "@/components/marketing/MarketingSection";
import { PageHero } from "@/components/marketing/PageHero";
import { MarketingStickyCta } from "@/components/marketing/StickyCta";

const title = "Lucro Real para vendedor Mercado Livre — apuração por SKU";
const description =
  "PIS/COFINS não cumulativo (débito x crédito), ICMS e DIFAL apurados venda a venda, por SKU. A dinâmica de Lucro Real que quase nenhum painel de vendedor faz.";

export const metadata: Metadata = {
  title,
  description,
  alternates: { canonical: `${siteUrl()}/lucro-real-mercado-livre` },
  openGraph: {
    type: "website",
    url: `${siteUrl()}/lucro-real-mercado-livre`,
    siteName: "ERP 1a1",
    locale: "pt_BR",
    title,
    description,
  },
};

const COVERAGE = [
  {
    term: "PIS/COFINS não cumulativo",
    body: "Débito sobre a venda menos o crédito sobre a nota fiscal de entrada, por SKU e por mês.",
  },
  {
    term: "ICMS e ICMS-ST",
    body: "Alíquota interna e FCP configuráveis por UF de destino, considerando o crédito recuperável quando aplicável.",
  },
  {
    term: "DIFAL",
    body: "Diferencial de alíquota calculado venda a venda, conforme o estado do comprador.",
  },
  {
    term: "Auditoria por linha",
    body: "Cada número do relatório abre um modal mostrando exatamente como foi calculado, débito e crédito separados. Sem caixa-preta.",
  },
] as const;

export default async function LucroRealPage() {
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
          breadcrumb="Lucro Real"
          eyebrow="Tributário · Lucro Real"
          title="Lucro Real de verdade: débito e crédito, venda a venda"
          lead="A maioria dos painéis de vendedor Mercado Livre para no Simples Nacional. O ERP 1a1 apura PIS/COFINS não cumulativo, ICMS e DIFAL por SKU, a dinâmica real de quem está no Lucro Real."
          highlights={[
            "Crédito de entrada, não só débito de saída",
            "DIFAL pela UF do comprador, venda a venda",
            "Memória de cálculo aberta em cada linha",
          ]}
        />

        <MarketingSection
          surface="base"
          eyebrow="Relatório"
          title="A visão por SKU do relatório mensal"
          lead="Vendas, unidades, receita, imposto operacional médio e % sobre o faturamento: o peso fiscal real de cada produto, não uma média genérica da empresa toda."
        >
          <DemoTributario />
        </MarketingSection>

        <MarketingSection
          surface="card"
          width="narrow"
          eyebrow="Cobertura"
          title="O que a apuração cobre"
          lead="Quatro frentes que decidem quanto imposto sobra de verdade no fim do mês."
        >
          <DefinitionList items={COVERAGE} />

          <div className="legal-prose mt-8 space-y-4">
            <p>
              Tudo isso alimenta o{" "}
              <Link href="/dre-mercado-livre">DRE do mês</Link> e a{" "}
              <Link href="/margem-de-contribuicao-mercado-livre">
                margem por anúncio
              </Link>
              , com o mesmo custo cadastrado por SKU. Empresa no Simples
              Nacional?{" "}
              <Link href="/simples-nacional-mercado-livre">
                Veja como funciona nesse regime
              </Link>
              .
            </p>
            <p>
              A apuração apoia o fechamento, mas não substitui contador nem emite
              nota fiscal. A responsabilidade fiscal permanece com você e o
              escritório contábil.
            </p>
          </div>
        </MarketingSection>

        <MarketingSection
          surface="base"
          width="narrow"
          eyebrow="Auditoria"
          eyebrowTone="emerald"
          title="A memória de cálculo, aberta"
          lead="Clique em qualquer venda no relatório e veja exatamente de onde saiu cada número: débito e crédito de ICMS, DIFAL, PIS/COFINS não cumulativo e até os créditos sobre tarifa do Mercado Livre, ADS, frete e custos fixos. Este é o mesmo painel de auditoria do produto, com uma venda de exemplo."
        >
          <DemoTaxAudit />
        </MarketingSection>

        <CtaBand
          isLoggedIn={isLoggedIn}
          dashboardHref={dashboardHref}
          title="Leve a apuração do Lucro Real para o nível do SKU."
          lead="Conecte sua loja e veja débito, crédito e imposto a recolher com a memória de cálculo aberta em cada venda."
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
