import Image from "next/image";
import { Layers, Lock, ShieldCheck, TrendingUp } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { DemoCatalog } from "@/components/marketing/demo-catalog";
import { DemoDre } from "@/components/marketing/demo-dre";
import { DemoHeroSnapshot } from "@/components/marketing/demo-hero-snapshot";
import { DemoLucratividade } from "@/components/marketing/demo-lucratividade";
import { DemoTributario } from "@/components/marketing/demo-tributario";
import { MarketingFaq } from "@/components/marketing/faq";
import { MarketingHowItStarts } from "@/components/marketing/how-it-starts";
import { MarketingMoreInPanel } from "@/components/marketing/more-in-panel";
import { OAuthCta } from "@/components/marketing/oauth-cta";

const TRUST_ITEMS = [
  { icon: ShieldCheck, label: "OAuth oficial Mercado Livre" },
  { icon: Lock, label: "Tokens criptografados no servidor" },
  { icon: Layers, label: "Dados isolados por loja" },
] as const;

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
      <header className="sticky top-0 z-40 border-b border-white/10 bg-[#152456]/95 pt-[env(safe-area-inset-top)] backdrop-blur-md">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <a href="#topo" className="flex items-center gap-2">
            <Image
              src="/logo-bg-blue.png"
              alt=""
              width={36}
              height={36}
              className="h-9 w-9 rounded-lg object-cover shadow-sm"
              priority
            />
            <span className="font-semibold tracking-tight text-white">
              ERP 1a1
            </span>
          </a>
          <OAuthCta
            isLoggedIn={isLoggedIn}
            dashboardHref={dashboardHref}
            size="sm"
            onDark
          />
        </div>
      </header>

      <main id="topo">
        <section className="relative overflow-hidden bg-gradient-to-br from-[#0f1a45] via-[#1b2d6f] to-[#243a8a] px-4 py-16 text-white sm:px-6 sm:py-24">
          <div
            className="marketing-hero-grid pointer-events-none absolute inset-0"
            aria-hidden
          />
          <div
            className="pointer-events-none absolute -right-24 -top-24 size-80 rounded-full bg-amber-400/20 blur-3xl"
            aria-hidden
          />
          <div
            className="pointer-events-none absolute bottom-0 left-1/4 size-64 rounded-full bg-sky-400/10 blur-3xl"
            aria-hidden
          />
          <div className="relative mx-auto grid max-w-6xl items-center gap-12 lg:grid-cols-2">
            <div>
              <div className="mb-4 flex flex-wrap gap-2">
                <Badge className="border-amber-300/40 bg-amber-400/20 text-amber-100">
                  Mercado Livre
                </Badge>
                <Badge className="border-white/20 bg-white/10 text-white">
                  Lucratividade
                </Badge>
                <Badge className="border-emerald-300/40 bg-emerald-400/20 text-emerald-100">
                  Lucro real e Simples
                </Badge>
                <Badge className="border-white/20 bg-white/10 text-white">
                  Catálogo · DRE · Full
                </Badge>
              </div>
              <h1 className="text-[clamp(2.5rem,6vw,4.75rem)] font-bold leading-[1.06] tracking-tight">
                <span className="block text-white">O painel do vendedor</span>
                <span className="mt-1 inline-block bg-gradient-to-r from-amber-200 via-amber-300 to-yellow-200 bg-clip-text text-transparent">
                  Mercado Livre
                </span>
                <span
                  className="mt-1 block h-1.5 w-[min(100%,12rem)] rounded-full bg-gradient-to-r from-amber-400 to-yellow-300 sm:h-2 sm:w-[16rem]"
                  aria-hidden
                />
                <span className="mt-4 block text-[clamp(1.15rem,2.4vw,1.65rem)] font-semibold leading-snug tracking-tight text-white/75">
                  Da margem ao fechamento do mês.
                </span>
              </h1>
              <p className="mt-4 max-w-xl text-base leading-relaxed text-white/80 sm:text-lg">
                Lucratividade por anúncio depois do ADS, apuração de lucro real
                por SKU e DRE que fecha sozinho com a fatura do Mercado Livre —
                Full e compras no mesmo painel. Um login: a conta que você já
                usa na ML.
              </p>
              {error ? (
                <div
                  className="mt-6 rounded-lg border border-red-300/40 bg-red-950/40 px-4 py-3 text-sm text-red-100"
                  role="alert"
                >
                  <p className="font-medium">
                    Não foi possível concluir o login.
                  </p>
                  <p className="mt-1 break-all opacity-90">{error}</p>
                </div>
              ) : null}
              <div className="mt-8 flex flex-col items-start gap-3">
                <OAuthCta
                  isLoggedIn={isLoggedIn}
                  dashboardHref={dashboardHref}
                  onDark
                />
                {!isLoggedIn ? (
                  <p className="text-sm text-white/65">
                    Entra com sua conta do Mercado Livre · sem cartão · sem
                    senha nova
                  </p>
                ) : null}
              </div>
              <div className="mt-6 flex flex-wrap items-center gap-x-5 gap-y-2">
                {TRUST_ITEMS.map(({ icon: Icon, label }) => (
                  <span
                    key={label}
                    className="inline-flex items-center gap-1.5 text-xs text-white/55"
                  >
                    <Icon className="size-3.5 text-emerald-300" aria-hidden />
                    {label}
                  </span>
                ))}
              </div>
            </div>
            <DemoHeroSnapshot />
          </div>
        </section>

        <section
          id="lucratividade"
          className="scroll-mt-20 bg-[var(--background)] px-4 py-16 sm:px-6 sm:py-20"
        >
          <div className="mx-auto max-w-6xl space-y-8">
            <div className="max-w-2xl">
              <h2 className="text-2xl font-bold tracking-tight text-[var(--primary)] sm:text-3xl">
                Lucratividade por anúncio
              </h2>
              <p className="mt-3 text-[15px] leading-relaxed text-[var(--muted-foreground)]">
                As mesmas colunas do painel: produto, tipo, preço, margem e pós
                ADS. Verde quando sobra, vermelho quando o anúncio come a
                operação — inclusive depois do Product Ads.
              </p>
            </div>
            <DemoLucratividade />
          </div>
        </section>

        <section
          id="tributario"
          className="scroll-mt-20 bg-white px-4 py-16 sm:px-6 sm:py-20"
        >
          <div className="mx-auto max-w-6xl space-y-8">
            <div className="max-w-2xl">
              <h2 className="text-2xl font-bold tracking-tight text-[var(--primary)] sm:text-3xl">
                Tributário para lucro real
              </h2>
              <p className="mt-3 text-[15px] leading-relaxed text-[var(--muted-foreground)]">
                A visão Por SKU do relatório: vendas, unidades, receita, imposto
                operacional médio e % operacional — o peso fiscal de cada
                produto no lucro real.
              </p>
              <p className="mt-2 text-sm text-[var(--muted-foreground)]">
                Apoio à apuração: não substitui contador nem emite nota fiscal.
                Empresas do Simples Nacional configuram o regime e a alíquota
                efetiva do DAS em Configurações — a margem e a precificação já
                usam esse número; a apuração por SKU acima é específica do
                Lucro Real.
              </p>
            </div>
            <DemoTributario />
          </div>
        </section>

        <section
          id="dre"
          className="scroll-mt-20 bg-[var(--background)] px-4 py-16 sm:px-6 sm:py-20"
        >
          <div className="mx-auto max-w-6xl space-y-8">
            <div className="max-w-2xl">
              <h2 className="text-2xl font-bold tracking-tight text-[var(--primary)] sm:text-3xl">
                DRE que fecha sozinho
              </h2>
              <p className="mt-3 text-[15px] leading-relaxed text-[var(--muted-foreground)]">
                Demonstrativo do mês: receita, custos e resultado numa leitura
                vertical. Tarifa, CMV e ADS vêm da fatura do Mercado Livre —
                sem exportar planilha para bater o número que já apareceu na
                lucratividade e no tributário.
              </p>
            </div>
            <DemoDre />
          </div>
        </section>

        <section
          id="catalogo"
          className="scroll-mt-20 bg-white px-4 py-16 sm:px-6 sm:py-20"
        >
          <div className="mx-auto max-w-6xl space-y-8">
            <div className="max-w-2xl">
              <p className="text-sm font-semibold uppercase tracking-wide text-amber-700">
                Concorrência
              </p>
              <h2 className="mt-2 text-2xl font-bold tracking-tight text-[var(--primary)] sm:text-3xl">
                Quem ganhou o anúncio, minuto a minuto
              </h2>
              <p className="mt-3 text-[15px] leading-relaxed text-[var(--muted-foreground)]">
                Timeline do dia: quando o anúncio estava ganhando, perdendo ou
                compartilhando — e quantas vendas saíram em cada trecho.
              </p>
            </div>
            <DemoCatalog />
          </div>
        </section>

        <MarketingMoreInPanel />

        <MarketingHowItStarts
          isLoggedIn={isLoggedIn}
          dashboardHref={dashboardHref}
        />

        <MarketingFaq />

        <section className="bg-gradient-to-br from-[#1b2d6f] to-[#0f1a45] px-4 py-16 text-center text-white sm:px-6">
          <div className="mx-auto max-w-xl">
            <TrendingUp className="mx-auto size-8 text-amber-400" aria-hidden />
            <h2 className="mt-4 text-2xl font-bold sm:text-3xl">
              Teste com a sua loja de verdade.
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

      <footer className="border-t border-[var(--border)] bg-[var(--card)] px-4 py-6 text-center text-xs text-[var(--muted-foreground)]">
        ERP 1a1 · painel para vendedores Mercado Livre
      </footer>
    </div>
  );
}
