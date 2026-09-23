import type { Metadata } from "next";
import Link from "next/link";
import { cookies } from "next/headers";
import { getMarketingCtaState } from "@/lib/mercadolibre/session";
import { siteUrl } from "@/lib/infra/site-url";
import { CtaBand } from "@/components/marketing/CtaBand";
import { DefinitionList } from "@/components/marketing/DefinitionList";
import { DemoSimplesDas } from "@/components/marketing/DemoSimplesDas";
import { DemoTributario } from "@/components/marketing/DemoTributario";
import { MarketingFooter, MarketingHeader } from "@/components/marketing/MarketingChrome";
import { MarketingSection } from "@/components/marketing/MarketingSection";
import { PageHero } from "@/components/marketing/PageHero";
import { MarketingStickyCta } from "@/components/marketing/StickyCta";

const title = "Simples Nacional no Mercado Livre — alíquota efetiva do DAS";
const description =
  "RBT12, faixa do Anexo I e composição do DAS para vendedores do Mercado Livre. Descubra a alíquota efetiva antes de precificar, não depois de fechar o mês.";

export const metadata: Metadata = {
  title,
  description,
  alternates: { canonical: `${siteUrl()}/simples-nacional-mercado-livre` },
  openGraph: {
    type: "website",
    url: `${siteUrl()}/simples-nacional-mercado-livre`,
    siteName: "ERP 1a1",
    locale: "pt_BR",
    title,
    description,
  },
};

const DECISION_ITEMS = [
  {
    term: "RBT12",
    body: "Receita bruta dos últimos 12 meses, atualizada a cada fechamento.",
  },
  {
    term: "Faixa do Anexo I",
    body: "Alíquota nominal e parcela a deduzir, conforme LC 123/2006.",
  },
  {
    term: "Composição do DAS",
    body: "Repartição oficial do imposto sobre o faturamento do período.",
  },
  {
    term: "Simulador",
    body: "Comparação lado a lado com o Lucro Real, por SKU.",
  },
] as const;

export default async function SimplesNacionalPage() {
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
          breadcrumb="Simples Nacional"
          eyebrow="Tributário · Simples Nacional"
          title="Simples Nacional sem surpresa na hora de pagar o DAS"
          lead="RBT12 dos últimos 12 meses, faixa do Anexo I e composição do DAS, para saber a alíquota efetiva antes de precificar, e não só depois de fechar o mês."
          highlights={[
            "Alíquota efetiva já embutida na margem",
            "Distância até a próxima faixa do Anexo I",
            "Comparação com o Lucro Real, por SKU",
          ]}
        />

        <MarketingSection
          surface="base"
          eyebrow="Por SKU"
          title="Peso fiscal por produto, mesmo no Simples"
          lead="No Simples Nacional você informa a alíquota efetiva do DAS em Configurações, e o painel usa esse número para calcular margem e precificação de cada anúncio, sem pedir ICMS, ST ou monofásico, que não se aplicam a esse regime."
        >
          <DemoTributario />
          <p className="mt-6 text-sm leading-relaxed text-[var(--muted-foreground)]">
            A visão detalhada por SKU acima (débitos, créditos, ICMS-DIFAL) é
            específica do{" "}
            <Link
              href="/lucro-real-mercado-livre"
              className="font-medium text-[var(--primary)] underline decoration-[var(--primary)]/30 underline-offset-4"
            >
              Lucro Real
            </Link>
            . No Simples, você acompanha o RBT12 e a faixa do Anexo I
            diretamente na apuração da empresa.
          </p>
        </MarketingSection>

        <MarketingSection
          surface="card"
          eyebrow="Apuração"
          eyebrowTone="emerald"
          title="RBT12 e composição do DAS"
          lead="Faturamento dos últimos 12 meses, distância até a próxima faixa do Anexo I e para onde vai cada real do DAS: ICMS, CPP, PIS/COFINS, IRPJ e CSLL. O mesmo painel do produto, com números de exemplo."
        >
          <DemoSimplesDas />
        </MarketingSection>

        <MarketingSection
          surface="base"
          width="narrow"
          eyebrow="Decisão"
          title="Simples Nacional ou Lucro Real: como decidir"
          lead="A resposta muda com o RBT12, a margem de cada produto e os créditos de ICMS que a empresa consegue aproveitar no Lucro Real. Por isso o simulador compara os dois regimes com os números reais da sua loja, não uma estimativa genérica, antes de você decidir trocar de regime junto com o contador."
        >
          <DefinitionList items={DECISION_ITEMS} />
          <p className="mt-6 text-sm leading-relaxed text-[var(--muted-foreground)]">
            O ERP 1a1 apoia a decisão e a apuração; a responsabilidade fiscal
            permanece com você e o escritório contábil.
          </p>
        </MarketingSection>

        <CtaBand
          isLoggedIn={isLoggedIn}
          dashboardHref={dashboardHref}
          title="Saiba a alíquota efetiva antes de precificar."
          lead="Conecte sua loja, informe o regime e veja o DAS entrando na margem de cada anúncio, não só no fechamento."
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
