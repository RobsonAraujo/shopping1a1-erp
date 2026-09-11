import type { Metadata } from "next";
import Link from "next/link";
import { cookies } from "next/headers";
import { TrendingUp } from "lucide-react";
import { getMarketingCtaState } from "@/lib/mercadolibre/session";
import { siteUrl } from "@/lib/infra/site-url";
import { DemoSimplesDas } from "@/components/marketing/DemoSimplesDas";
import { DemoTributario } from "@/components/marketing/DemoTributario";
import { MarketingFooter, MarketingHeader } from "@/components/marketing/MarketingChrome";
import { OAuthCta } from "@/components/marketing/OauthCta";

const title = "Simples Nacional para vendedor Mercado Livre — DAS e RBT12";
const description =
  "Acompanhe o RBT12, a faixa do Anexo I e a composição do DAS, e simule Simples Nacional x Lucro Real com os números reais da sua loja Mercado Livre.";

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
    images: ["/logo-bg-blue.png"],
  },
};

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

      <main>
        <section className="marketing-hero relative overflow-hidden bg-gradient-to-br from-[#0a1130] via-[#141f52] to-[#1b2d6f] px-4 pb-16 text-white sm:px-6 sm:pb-24">
          <div className="relative mx-auto max-w-3xl text-center">
            <p className="text-sm font-semibold uppercase tracking-wide text-cyan-200">
              Tributário · Simples Nacional
            </p>
            <h1 className="mt-3 text-[clamp(2rem,5vw,3.25rem)] font-bold leading-[1.1] tracking-tight">
              Simples Nacional sem surpresa na hora de pagar o DAS
            </h1>
            <p className="mx-auto mt-4 max-w-xl text-base leading-relaxed text-white/80 sm:text-lg">
              RBT12 dos últimos 12 meses, faixa do Anexo I e composição do DAS
              — para saber a alíquota efetiva antes de precificar, e não só
              depois de fechar o mês.
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
                Peso fiscal por SKU, mesmo no Simples
              </h2>
              <p className="mt-3 text-[15px] leading-relaxed text-[var(--muted-foreground)]">
                No Simples Nacional você informa a alíquota efetiva do DAS em
                Configurações — o painel usa esse número para calcular margem
                e precificação de cada anúncio, sem pedir ICMS, ST ou
                monofásico, que não se aplicam a esse regime.
              </p>
            </div>
            <DemoTributario />
            <p className="text-sm text-[var(--muted-foreground)]">
              A visão detalhada por SKU acima (débitos, créditos, ICMS-DIFAL)
              é específica do{" "}
              <Link href="/lucro-real-mercado-livre" className="text-[var(--primary)] underline underline-offset-2">
                Lucro Real
              </Link>
              . No Simples, você acompanha o RBT12 e a faixa do Anexo I
              diretamente na apuração da empresa.
            </p>
          </div>
        </section>

        <section className="scroll-mt-20 bg-white px-4 py-16 sm:px-6 sm:py-20">
          <div className="mx-auto max-w-4xl space-y-8">
            <div className="max-w-2xl">
              <h2 className="text-2xl font-bold tracking-tight text-[var(--primary)] sm:text-3xl">
                RBT12 e composição do DAS
              </h2>
              <p className="mt-3 text-[15px] leading-relaxed text-[var(--muted-foreground)]">
                Faturamento dos últimos 12 meses, distância até a próxima
                faixa do Anexo I e para onde vai cada real do DAS — ICMS, CPP,
                PIS/COFINS, IRPJ e CSLL. O mesmo painel do produto, com
                números de exemplo.
              </p>
            </div>
            <DemoSimplesDas />
          </div>
        </section>

        <section className="bg-[var(--background)] px-4 py-16 sm:px-6 sm:py-20">
          <div className="mx-auto max-w-3xl space-y-6">
            <h2 className="text-2xl font-bold tracking-tight text-[var(--primary)] sm:text-3xl">
              Simples Nacional ou Lucro Real: como decidir
            </h2>
            <p className="text-[15px] leading-relaxed text-[var(--muted-foreground)]">
              A resposta muda com o RBT12, a margem de cada produto e os
              créditos de ICMS que a empresa consegue aproveitar no Lucro
              Real. Por isso o simulador compara os dois regimes com os
              números reais da sua loja — não uma estimativa genérica — antes
              de você decidir trocar de regime junto com o contador.
            </p>
            <ul className="space-y-3 text-[15px] leading-relaxed text-[var(--muted-foreground)]">
              <li>
                <strong className="text-[var(--foreground)]">RBT12</strong> — receita bruta
                dos últimos 12 meses, atualizada a cada fechamento.
              </li>
              <li>
                <strong className="text-[var(--foreground)]">Faixa do Anexo I</strong> —
                alíquota nominal e parcela a deduzir, conforme LC 123/2006.
              </li>
              <li>
                <strong className="text-[var(--foreground)]">Composição do DAS</strong> —
                repartição oficial do imposto sobre o faturamento do período.
              </li>
              <li>
                <strong className="text-[var(--foreground)]">Simulador</strong> — comparação
                lado a lado com o Lucro Real, por SKU.
              </li>
            </ul>
            <p className="text-sm text-[var(--muted-foreground)]">
              O ERP 1a1 apoia a decisão e a apuração — a responsabilidade
              fiscal permanece com você e o escritório contábil.
            </p>
          </div>
        </section>

        <section className="bg-gradient-to-br from-[#1b2d6f] to-[#0f1a45] px-4 py-16 text-center text-white sm:px-6">
          <div className="mx-auto max-w-xl">
            <TrendingUp className="mx-auto size-8 text-cyan-300" aria-hidden />
            <h2 className="mt-4 text-2xl font-bold sm:text-3xl">
              Veja o RBT12 e o DAS da sua loja de verdade.
            </h2>
            <p className="mt-3 text-white/75">
              Conecte sua conta do Mercado Livre e acompanhe a faixa do Anexo I.
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
