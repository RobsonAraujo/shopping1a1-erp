import Link from "next/link";
import { Layers, Lock } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { UserFeedback } from "@/components/ui/user-feedback";
import { CtaBand, CtaReassurance } from "@/components/marketing/CtaBand";
import { DemoCatalog } from "@/components/marketing/DemoCatalog";
import { DemoDre } from "@/components/marketing/DemoDre";
import { DemoHeroSnapshot } from "@/components/marketing/DemoHeroSnapshot";
import { DemoKanban } from "@/components/marketing/DemoKanban";
import { DemoLucratividade } from "@/components/marketing/DemoLucratividade";
import { DemoTributario } from "@/components/marketing/DemoTributario";
import { MarketingFaq } from "@/components/marketing/Faq";
import { MarketingFooter, MarketingHeader } from "@/components/marketing/MarketingChrome";
import { MarketingHowItStarts } from "@/components/marketing/HowItStarts";
import { MarginCalculator } from "@/components/marketing/MarginCalculator";
import { MarketingMoreInPanel } from "@/components/marketing/MoreInPanel";
import { MarketingProblem } from "@/components/marketing/ProblemSection";
import { MarketingSection } from "@/components/marketing/MarketingSection";
import { MarketingStickyCta } from "@/components/marketing/StickyCta";
import { MarketingTrust } from "@/components/marketing/TrustSection";
import { OAuthCta } from "@/components/marketing/OauthCta";

/** O OAuth já aparece na reassurance logo abaixo do CTA — aqui só o que ela não diz. */
const TRUST_ITEMS = [
  { icon: Lock, label: "Tokens criptografados no servidor" },
  { icon: Layers, label: "Dados isolados por loja" },
] as const;

function InlineLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className="font-medium text-[var(--primary)] underline decoration-[var(--primary)]/30 underline-offset-4 transition-colors hover:decoration-[var(--primary)]"
    >
      {children}
    </Link>
  );
}

export function MarketingLanding({
  isLoggedIn,
  dashboardHref,
  error,
}: {
  isLoggedIn: boolean;
  dashboardHref: string;
  error?: string;
}) {
  return (
    <div className="marketing-landing flex min-h-full flex-1 flex-col">
      <MarketingHeader isLoggedIn={isLoggedIn} dashboardHref={dashboardHref} />

      <main id="conteudo">
        {/* ---------------------------------------------------------------- Hero */}
        <section className="marketing-hero relative overflow-hidden bg-gradient-to-br from-[#0a1130] via-[#141f52] to-[#1b2d6f] px-4 pb-20 text-white sm:px-6 sm:pb-28">
          <div
            className="marketing-hero-grid pointer-events-none absolute inset-0"
            aria-hidden
          />
          <div
            className="pointer-events-none absolute -right-24 -top-24 size-80 rounded-full bg-cyan-400/20 blur-3xl"
            aria-hidden
          />
          <div
            className="pointer-events-none absolute bottom-0 left-1/4 size-64 rounded-full bg-sky-400/10 blur-3xl"
            aria-hidden
          />
          <div
            className="pointer-events-none absolute -bottom-32 -right-10 size-72 rounded-full bg-indigo-500/10 blur-3xl"
            aria-hidden
          />

          <div className="relative mx-auto grid max-w-6xl items-center gap-14 lg:grid-cols-[1fr_1.05fr]">
            <div>
              <div className="mb-5 flex flex-wrap gap-2">
                <Badge className="border-cyan-300/30 bg-cyan-400/10 text-cyan-100">
                  Mercado Livre
                </Badge>
                <Badge className="border-emerald-300/40 bg-emerald-400/15 text-emerald-100">
                  Grátis durante o beta
                </Badge>
                <Badge className="border-white/20 bg-white/10 text-white">
                  Lucro Real · Simples Nacional
                </Badge>
              </div>

              <h1 className="text-balance text-[clamp(2.5rem,6vw,4.5rem)] font-bold leading-[1.04] tracking-tight">
                <span className="block text-white">Descubra quanto sobra</span>
                <span className="mt-1 inline-block bg-gradient-to-r from-cyan-200 via-sky-300 to-indigo-200 bg-clip-text text-transparent">
                  de cada venda
                </span>
                <span
                  className="mt-3 block h-1.5 w-[min(100%,12rem)] rounded-full bg-gradient-to-r from-cyan-400 to-indigo-400 sm:h-2 sm:w-[16rem]"
                  aria-hidden
                />
              </h1>

              <p className="mt-6 max-w-xl text-pretty text-base leading-relaxed text-white/80 sm:text-lg">
                O painel de lucratividade, imposto e DRE para quem vende no
                Mercado Livre. Margem por anúncio{" "}
                <strong className="font-semibold text-white">
                  depois do Product Ads
                </strong>
                , apuração fiscal por SKU e o resultado do mês fechando com a
                sua fatura — sem planilha paralela.
              </p>

              {error ? (
                <UserFeedback
                  tone="error"
                  title="Não foi possível concluir o login"
                  className="mt-6"
                >
                  {error}
                </UserFeedback>
              ) : null}

              <div className="mt-9 flex flex-col items-start gap-4">
                <div className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row sm:items-center">
                  <OAuthCta
                    isLoggedIn={isLoggedIn}
                    dashboardHref={dashboardHref}
                    onDark
                    className="w-full sm:w-auto"
                  />
                  <Link
                    href="#calculadora"
                    className="inline-flex h-12 w-full items-center justify-center rounded-full border border-white/25 px-6 text-[15px] font-semibold text-white/90 transition-colors hover:border-white/50 hover:text-white sm:w-auto"
                  >
                    Fazer a conta agora
                  </Link>
                </div>
                {!isLoggedIn ? (
                  <CtaReassurance onDark className="justify-start" />
                ) : null}
              </div>

              <ul className="mt-10 flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-white/10 pt-6">
                {TRUST_ITEMS.map(({ icon: Icon, label }) => (
                  <li
                    key={label}
                    className="inline-flex items-center gap-1.5 text-xs text-white/50"
                  >
                    <Icon className="size-3.5 text-emerald-300" aria-hidden />
                    {label}
                  </li>
                ))}
              </ul>
            </div>

            <DemoHeroSnapshot />
          </div>
        </section>

        {/* ------------------------------------------------------------ Problema */}
        <MarketingProblem />

        {/* --------------------------------------------------------- Calculadora */}
        <MarketingSection
          id="calculadora"
          surface="tint"
          eyebrow="Faça a conta agora"
          title="Coloque um anúncio seu e veja o que sobra"
          lead="Preço, custo, comissão, imposto e ADS numa conta só. Não é uma simulação de marketing: esta calculadora roda exatamente as mesmas funções de margem que o painel usa nas telas de Lucratividade e Precificação."
          align="center"
        >
          <MarginCalculator
            isLoggedIn={isLoggedIn}
            dashboardHref={dashboardHref}
          />
        </MarketingSection>

        {/* ------------------------------------------------------- Lucratividade */}
        <MarketingSection
          id="lucratividade"
          surface="card"
          eyebrow="Lucratividade"
          title="A mesma conta, para o catálogo inteiro"
          lead={
            <>
              Produto, tipo, preço, margem e pós ADS — as colunas do painel.
              Verde quando sobra, vermelho quando o anúncio come a operação,
              inclusive depois do Product Ads.{" "}
              <InlineLink href="/margem-de-contribuicao-mercado-livre">
                Saiba mais sobre margem de contribuição
              </InlineLink>
              .
            </>
          }
        >
          <DemoLucratividade />
        </MarketingSection>

        {/* ----------------------------------------------------------- Tributário */}
        <MarketingSection
          id="tributario"
          surface="base"
          eyebrow="Tributário"
          title="O peso fiscal de cada produto"
          lead={
            <>
              A visão Por SKU do relatório: vendas, unidades, receita, imposto
              operacional médio e % operacional — quanto cada produto leva do
              resultado.{" "}
              <InlineLink href="/lucro-real-mercado-livre">
                Veja a apuração completa de Lucro Real
              </InlineLink>
              .
            </>
          }
          headingExtra={
            <p className="mt-4 text-sm leading-relaxed text-[var(--muted-foreground)]">
              Apoio à apuração — não substitui contador nem emite nota fiscal.
              Empresas do Simples configuram regime e alíquota efetiva do DAS
              em Configurações; margem e precificação já usam esse número.{" "}
              <InlineLink href="/simples-nacional-mercado-livre">
                Como funciona no Simples Nacional
              </InlineLink>
              .
            </p>
          }
        >
          <DemoTributario />
        </MarketingSection>

        {/* ------------------------------------------------------------------ DRE */}
        <MarketingSection
          id="dre"
          surface="card"
          eyebrow="Financeiro"
          title="O DRE fecha sozinho com a fatura"
          lead={
            <>
              Receita, custos e resultado numa leitura vertical. Tarifa, CMV e
              ADS vêm da fatura do Mercado Livre — sem exportar planilha para
              bater o número que já apareceu na lucratividade.{" "}
              <InlineLink href="/dre-mercado-livre">
                Saiba mais sobre o DRE
              </InlineLink>
              .
            </>
          }
        >
          <DemoDre />
        </MarketingSection>

        {/* ------------------------------------------------------------- Catálogo */}
        <MarketingSection
          id="catalogo"
          surface="base"
          eyebrow="Concorrência"
          eyebrowTone="amber"
          title="Lançou um produto novo? Veja se ele vende de verdade"
          lead="Timeline do dia: quando o anúncio estava ganhando, perdendo ou compartilhando o buybox — e quantas vendas saíram em cada trecho. Vender mesmo perdendo é sinal de demanda própria, não só de preço vencedor."
        >
          <DemoCatalog />
        </MarketingSection>

        {/* --------------------------------------------------------------- Kanban */}
        <MarketingSection
          id="kanban"
          surface="card"
          eyebrow="Operação"
          eyebrowTone="sky"
          title="Kanban de compras e Full"
          lead={
            <>
              O card nasce quando o estoque vai faltar. Arraste o fornecedor da
              entrada até a compra — ou o anúncio até a coleta Full. Colunas,
              cores e tela cheia iguais para toda a equipe.{" "}
              <InlineLink href="/kanban-compras-mercado-livre">
                Saiba mais sobre o kanban
              </InlineLink>
              .
            </>
          }
        >
          <DemoKanban />
        </MarketingSection>

        <MarketingMoreInPanel />

        <MarketingTrust />

        <MarketingHowItStarts
          isLoggedIn={isLoggedIn}
          dashboardHref={dashboardHref}
        />

        <MarketingFaq />

        <CtaBand
          isLoggedIn={isLoggedIn}
          dashboardHref={dashboardHref}
          title="Teste com a sua loja de verdade."
          lead="Conecte a conta do Mercado Livre e veja a margem real dos seus anúncios em minutos — lucratividade, tributário, kanban e DRE no mesmo painel."
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
