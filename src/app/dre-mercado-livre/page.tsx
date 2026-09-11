import type { Metadata } from "next";
import Link from "next/link";
import { cookies } from "next/headers";
import { TrendingUp } from "lucide-react";
import { getMarketingCtaState } from "@/lib/mercadolibre/session";
import { siteUrl } from "@/lib/infra/site-url";
import { DemoDre } from "@/components/marketing/DemoDre";
import { DemoDreCharts } from "@/components/marketing/DemoDreCharts";
import { MarketingFooter, MarketingHeader } from "@/components/marketing/MarketingChrome";
import { OAuthCta } from "@/components/marketing/OauthCta";

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
    images: ["/logo-bg-blue.png"],
  },
};

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

      <main>
        <section className="marketing-hero relative overflow-hidden bg-gradient-to-br from-[#0a1130] via-[#141f52] to-[#1b2d6f] px-4 pb-16 text-white sm:px-6 sm:pb-24">
          <div className="relative mx-auto max-w-3xl text-center">
            <p className="text-sm font-semibold uppercase tracking-wide text-cyan-200">
              DRE · Financeiro
            </p>
            <h1 className="mt-3 text-[clamp(2rem,5vw,3.25rem)] font-bold leading-[1.1] tracking-tight">
              O DRE da sua loja Mercado Livre, sem exportar planilha
            </h1>
            <p className="mx-auto mt-4 max-w-xl text-base leading-relaxed text-white/80 sm:text-lg">
              Receita, tarifa ML, CMV, impostos e investimento em ADS entram
              automaticamente a partir da fatura do Mercado Livre. O resultado
              do mês fecha numa leitura vertical — igual ao número que já
              apareceu na lucratividade e no tributário.
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
                Demonstrativo do mês, linha a linha
              </h2>
              <p className="mt-3 text-[15px] leading-relaxed text-[var(--muted-foreground)]">
                Cada linha do DRE tem um modal de auditoria mostrando como o
                número foi calculado — vendas canceladas, devoluções parciais,
                tarifas especiais, custo do produto e imposto operacional. Sem
                caixa-preta no resultado do mês.
              </p>
            </div>
            <DemoDre />
          </div>
        </section>

        <section className="scroll-mt-20 bg-white px-4 py-16 sm:px-6 sm:py-20">
          <div className="mx-auto max-w-6xl space-y-8">
            <div className="max-w-2xl">
              <h2 className="text-2xl font-bold tracking-tight text-[var(--primary)] sm:text-3xl">
                Evolução mensal e visão em cascata
              </h2>
              <p className="mt-3 text-[15px] leading-relaxed text-[var(--muted-foreground)]">
                Faturamento, margem de contribuição e lucro operacional mês a
                mês, mais o mesmo gráfico de rosca e a cascata do resultado que
                você vê dentro do painel — não uma versão simplificada.
              </p>
            </div>
            <DemoDreCharts />
          </div>
        </section>

        <section className="bg-[var(--background)] px-4 py-16 sm:px-6 sm:py-20">
          <div className="mx-auto max-w-3xl space-y-6">
            <h2 className="text-2xl font-bold tracking-tight text-[var(--primary)] sm:text-3xl">
              O que alimenta o DRE
            </h2>
            <ul className="space-y-3 text-[15px] leading-relaxed text-[var(--muted-foreground)]">
              <li>
                <strong className="text-[var(--foreground)]">Receita e tarifas ML</strong> —
                sincronizados direto da fatura, sem digitação manual.
              </li>
              <li>
                <strong className="text-[var(--foreground)]">Custo do produto (CMV)</strong> —
                a partir do custo cadastrado por SKU em{" "}
                <Link href="/margem-de-contribuicao-mercado-livre" className="text-[var(--primary)] underline underline-offset-2">
                  Lucratividade
                </Link>
                .
              </li>
              <li>
                <strong className="text-[var(--foreground)]">Impostos</strong> — a apuração de{" "}
                <Link href="/lucro-real-mercado-livre" className="text-[var(--primary)] underline underline-offset-2">
                  Lucro Real
                </Link>{" "}
                ou a alíquota efetiva do{" "}
                <Link href="/simples-nacional-mercado-livre" className="text-[var(--primary)] underline underline-offset-2">
                  Simples Nacional
                </Link>{" "}
                configurada na sua empresa.
              </li>
              <li>
                <strong className="text-[var(--foreground)]">Investimento em ADS</strong> —
                descontado do resultado operacional, mês a mês.
              </li>
            </ul>
            <p className="text-sm text-[var(--muted-foreground)]">
              O DRE não substitui o contador nem emite nota fiscal — ele apoia
              o fechamento mensal com números já reconciliados com a fatura do
              Mercado Livre.
            </p>
          </div>
        </section>

        <section className="bg-gradient-to-br from-[#1b2d6f] to-[#0f1a45] px-4 py-16 text-center text-white sm:px-6">
          <div className="mx-auto max-w-xl">
            <TrendingUp className="mx-auto size-8 text-cyan-300" aria-hidden />
            <h2 className="mt-4 text-2xl font-bold sm:text-3xl">
              Veja o DRE da sua loja de verdade.
            </h2>
            <p className="mt-3 text-white/75">
              Conecte sua conta do Mercado Livre e feche o mês em minutos.
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
