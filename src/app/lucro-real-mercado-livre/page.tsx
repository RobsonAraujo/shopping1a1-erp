import type { Metadata } from "next";
import Link from "next/link";
import { cookies } from "next/headers";
import { TrendingUp } from "lucide-react";
import { getMarketingCtaState } from "@/lib/mercadolibre/session";
import { siteUrl } from "@/lib/infra/site-url";
import { DemoTaxAudit } from "@/components/marketing/DemoTaxAudit";
import { DemoTributario } from "@/components/marketing/DemoTributario";
import { MarketingFooter, MarketingHeader } from "@/components/marketing/MarketingChrome";
import { OAuthCta } from "@/components/marketing/OauthCta";

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
    images: ["/logo-bg-blue.png"],
  },
};

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

      <main>
        <section className="relative overflow-hidden bg-gradient-to-br from-[#0a1130] via-[#141f52] to-[#1b2d6f] px-4 py-16 text-white sm:px-6 sm:py-24">
          <div className="relative mx-auto max-w-3xl text-center">
            <p className="text-sm font-semibold uppercase tracking-wide text-cyan-200">
              Tributário · Lucro Real
            </p>
            <h1 className="mt-3 text-[clamp(2rem,5vw,3.25rem)] font-bold leading-[1.1] tracking-tight">
              Lucro Real de verdade: débito e crédito, venda a venda
            </h1>
            <p className="mx-auto mt-4 max-w-xl text-base leading-relaxed text-white/80 sm:text-lg">
              A maioria dos painéis de vendedor Mercado Livre para no Simples
              Nacional. O ERP 1a1 apura PIS/COFINS não cumulativo, ICMS e
              DIFAL por SKU — a dinâmica real de quem está no Lucro Real.
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
                A visão por SKU do relatório mensal
              </h2>
              <p className="mt-3 text-[15px] leading-relaxed text-[var(--muted-foreground)]">
                Vendas, unidades, receita, imposto operacional médio e % sobre
                o faturamento — o peso fiscal real de cada produto, não uma
                média genérica da empresa toda.
              </p>
            </div>
            <DemoTributario />
          </div>
        </section>

        <section className="bg-white px-4 py-16 sm:px-6 sm:py-20">
          <div className="mx-auto max-w-3xl space-y-6">
            <h2 className="text-2xl font-bold tracking-tight text-[var(--primary)] sm:text-3xl">
              O que a apuração cobre
            </h2>
            <ul className="space-y-3 text-[15px] leading-relaxed text-[var(--muted-foreground)]">
              <li>
                <strong className="text-[var(--foreground)]">PIS/COFINS não cumulativo</strong>{" "}
                — débito sobre a venda menos o crédito sobre a nota fiscal de
                entrada, por SKU e por mês.
              </li>
              <li>
                <strong className="text-[var(--foreground)]">ICMS e ICMS-ST</strong> — alíquota
                interna e FCP configuráveis por UF de destino, considerando o
                crédito recuperável quando aplicável.
              </li>
              <li>
                <strong className="text-[var(--foreground)]">DIFAL</strong> — diferencial de
                alíquota calculado venda a venda, conforme o estado do
                comprador.
              </li>
              <li>
                <strong className="text-[var(--foreground)]">Auditoria por linha</strong> — cada
                número do relatório abre um modal mostrando exatamente como
                foi calculado, débito e crédito separados. Sem caixa-preta.
              </li>
            </ul>
            <p className="text-[15px] leading-relaxed text-[var(--muted-foreground)]">
              Tudo isso alimenta o{" "}
              <Link href="/dre-mercado-livre" className="text-[var(--primary)] underline underline-offset-2">
                DRE do mês
              </Link>{" "}
              e a{" "}
              <Link href="/margem-de-contribuicao-mercado-livre" className="text-[var(--primary)] underline underline-offset-2">
                margem por anúncio
              </Link>
              , com o mesmo custo cadastrado por SKU. Empresa no Simples
              Nacional?{" "}
              <Link href="/simples-nacional-mercado-livre" className="text-[var(--primary)] underline underline-offset-2">
                Veja como funciona nesse regime
              </Link>
              .
            </p>
            <p className="text-sm text-[var(--muted-foreground)]">
              A apuração apoia o fechamento — não substitui contador nem emite
              nota fiscal. A responsabilidade fiscal permanece com você e o
              escritório contábil.
            </p>
          </div>
        </section>

        <section className="scroll-mt-20 bg-[var(--background)] px-4 py-16 sm:px-6 sm:py-20">
          <div className="mx-auto max-w-3xl space-y-8">
            <div>
              <h2 className="text-2xl font-bold tracking-tight text-[var(--primary)] sm:text-3xl">
                A memória de cálculo, aberta
              </h2>
              <p className="mt-3 text-[15px] leading-relaxed text-[var(--muted-foreground)]">
                Clique em qualquer venda no relatório e veja exatamente de
                onde saiu cada número — débito e crédito de ICMS, DIFAL,
                PIS/COFINS não cumulativo e até os créditos sobre tarifa do
                Mercado Livre, ADS, frete e custos fixos. Este é o mesmo painel
                de auditoria do produto, com uma venda de exemplo.
              </p>
            </div>
            <DemoTaxAudit />
          </div>
        </section>

        <section className="bg-gradient-to-br from-[#1b2d6f] to-[#0f1a45] px-4 py-16 text-center text-white sm:px-6">
          <div className="mx-auto max-w-xl">
            <TrendingUp className="mx-auto size-8 text-cyan-300" aria-hidden />
            <h2 className="mt-4 text-2xl font-bold sm:text-3xl">
              Veja a apuração de Lucro Real da sua loja.
            </h2>
            <p className="mt-3 text-white/75">
              Conecte sua conta do Mercado Livre e veja o débito e crédito por SKU.
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
