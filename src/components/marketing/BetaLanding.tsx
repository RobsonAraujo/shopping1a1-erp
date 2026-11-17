import Link from "next/link";
import {
  BadgeCheck,
  CalendarClock,
  Check,
  ExternalLink,
  KeyRound,
  MousePointerClick,
  RotateCcw,
  Store,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { BrandLogo } from "@/components/shared/BrandLogo";
import { CtaBand, CtaReassurance } from "@/components/marketing/CtaBand";
import { DemoCalculator } from "@/components/marketing/DemoCalculator";
import { DemoCentralAnuncios } from "@/components/marketing/DemoCentralAnuncios";
import { DemoHeroSnapshot } from "@/components/marketing/DemoHeroSnapshot";
import { DemoKanban } from "@/components/marketing/DemoKanban";
import { DemoLucratividade } from "@/components/marketing/DemoLucratividade";
import { DemoTributario } from "@/components/marketing/DemoTributario";
import { FaqList, type FaqItem } from "@/components/marketing/Faq";
import { MarketingSection } from "@/components/marketing/MarketingSection";
import { MarketingStickyCta } from "@/components/marketing/StickyCta";
import { OAuthCta } from "@/components/marketing/OauthCta";
import { LEGAL } from "@/lib/marketing/legal";
import { BETA_OFFER, daysLeftLabel } from "@/lib/marketing/campaign-offer";

/**
 * Página de campanha (`/beta`): uma ação só (conectar), sem menu nem links de
 * saída. Vende a oferta de 30 dias garantidos e mostra o principal do painel
 * com as demos da landing. Depois do prazo, troca o texto sozinha.
 */

/** Loja própria no Mercado Livre: a prova de que a Maipo nasceu de quem vende. */
const SHOP = {
  name: "shop1a1",
  url: "https://www.mercadolivre.com.br/pagina/shop1a1",
  /**
   * Números públicos da reputação, mostrados só quando preenchidos (copiar da
   * página da loja; não inventar). Ex.: "MercadoLíder Gold", "+12 mil vendas".
   */
  highlights: [] as string[],
};

const SECURITY = [
  {
    icon: BadgeCheck,
    title: "Só a API oficial do Mercado Livre",
    body: "Tudo passa pela API e pela autorização que o próprio Mercado Livre oferece aos integradores. Sem robô que lê página, sem extensão no navegador.",
  },
  {
    icon: KeyRound,
    title: "Sua senha fica no Mercado Livre",
    body: "Você entra no site deles e autoriza. A Maipo recebe só um token, guardado criptografado, e nunca vê usuário e senha.",
  },
  {
    icon: MousePointerClick,
    title: "Nada muda sem o seu clique",
    body: "Preço, promoção e estoque só são alterados quando você manda. A Maipo não mexe nos seus anúncios por conta própria.",
  },
  {
    icon: RotateCcw,
    title: "Revogue quando quiser",
    body: "A autorização sai nas configurações de segurança da sua conta do Mercado Livre, sem falar com ninguém.",
  },
] as const;

const FAQ: readonly FaqItem[] = [
  {
    q: "É seguro conectar a minha conta?",
    a: "Sim. A conexão é a autorização oficial (OAuth) do Mercado Livre: você entra no site deles e autoriza. A Maipo nunca vê a sua senha, e o token de acesso fica criptografado no servidor.",
  },
  {
    q: "Por que o Mercado Livre avisa que o aplicativo não é certificado?",
    a: "O selo de certificação do Mercado Livre é dado a integradores com grande volume de vendas na base de clientes. A Maipo está em beta, então o aviso aparece. A conexão é a mesma API oficial que qualquer integrador usa.",
  },
  {
    q: "A Maipo vai mexer nos meus anúncios?",
    a: "Só quando você clica para fazer, como subir um preço ou renovar uma promoção pela Central de anúncios. Preço, estoque e anúncio nunca mudam por iniciativa da Maipo.",
  },
  {
    q: "O que acontece depois dos 30 dias?",
    a: "Se o beta ainda estiver aberto, você continua usando de graça. Quando os planos pagos forem lançados, você é avisado com antecedência e nada é cobrado sem você concordar. Os 30 dias valem mesmo que os planos saiam antes.",
  },
  {
    q: "Serve para Simples Nacional e Lucro Real?",
    a: "Sim. Você escolhe o regime em Configurações. No Simples, margem e preço usam a alíquota efetiva do DAS que você informa; a apuração fiscal detalhada por SKU é específica do Lucro Real.",
  },
];

export function BetaLanding({
  isLoggedIn,
  dashboardHref,
  offerActive,
  daysLeft,
  deadlineLabel,
}: {
  isLoggedIn: boolean;
  dashboardHref: string;
  offerActive: boolean;
  daysLeft: number;
  deadlineLabel: string;
}) {
  const connectHref = offerActive
    ? `/conectar?oferta=${BETA_OFFER.id}`
    : "/conectar";
  const ctaLabel = offerActive ? "Garantir meu mês grátis" : "Testar grátis";
  const cta = { isLoggedIn, dashboardHref, connectHref, label: ctaLabel };

  return (
    <div className="marketing-landing flex min-h-full flex-1 flex-col">
      <header className="absolute inset-x-0 top-0 z-20 px-4 pt-[calc(1.25rem+env(safe-area-inset-top))] sm:px-6">
        <div className="mx-auto flex max-w-6xl items-center gap-3">
          <BrandLogo tone="negative" className="h-7" />
          <span className="rounded-full border border-white/25 bg-white/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white/80">
            Beta
          </span>
        </div>
      </header>

      <main id="conteudo">
        {/* ---------------------------------------------------------------- Hero */}
        <section className="marketing-hero relative overflow-hidden bg-gradient-to-br from-[#0a1130] via-[#141f52] to-[#1b2d6f] px-4 pb-20 pt-24 text-white sm:px-6 sm:pb-28 sm:pt-28">
          <div
            className="marketing-hero-grid pointer-events-none absolute inset-0"
            aria-hidden
          />
          <div
            className="pointer-events-none absolute -right-24 -top-24 size-80 rounded-full bg-cyan-400/20 blur-3xl"
            aria-hidden
          />

          <div className="relative mx-auto grid max-w-6xl items-center gap-14 lg:grid-cols-[1fr_1.05fr]">
            <div>
              <div className="mb-5 flex flex-wrap gap-2">
                {offerActive ? (
                  <>
                    <Badge className="border-emerald-300/40 bg-emerald-400/15 text-emerald-100">
                      {BETA_OFFER.trialDays} dias grátis garantidos
                    </Badge>
                    <Badge className="border-amber-300/40 bg-amber-400/15 text-amber-100">
                      <CalendarClock className="size-3.5" aria-hidden />
                      Até {deadlineLabel} · {daysLeftLabel(daysLeft)}
                    </Badge>
                  </>
                ) : (
                  <Badge className="border-white/20 bg-white/10 text-white">
                    Oferta encerrada em {deadlineLabel} · o beta segue grátis
                  </Badge>
                )}
                <Badge className="border-cyan-300/30 bg-cyan-400/10 text-cyan-100">
                  Mercado Livre
                </Badge>
              </div>

              <h1 className="text-balance text-[clamp(2.3rem,5.6vw,4.1rem)] font-bold leading-[1.05] tracking-tight">
                <span className="block text-white">Descubra quanto sobra</span>
                <span className="mt-1 inline-block bg-gradient-to-r from-cyan-200 via-sky-300 to-indigo-200 bg-clip-text text-transparent">
                  de cada venda
                </span>
              </h1>

              <p className="mt-6 max-w-xl text-pretty text-base leading-relaxed text-white/80 sm:text-lg">
                Margem por anúncio depois da tarifa, do frete, do imposto e do{" "}
                <strong className="font-semibold text-white">Product Ads</strong>
                . O painel para quem vende no Mercado Livre, feito por quem
                vende.
              </p>

              <p className="mt-4 max-w-xl text-pretty text-[15px] leading-relaxed text-white/70">
                {offerActive ? (
                  <>
                    Conecte a sua conta até{" "}
                    <strong className="font-semibold text-white">
                      {deadlineLabel}
                    </strong>{" "}
                    e use a Maipo completa por {BETA_OFFER.trialDays} dias,
                    grátis e garantido.
                  </>
                ) : (
                  <>
                    A oferta de {BETA_OFFER.trialDays} dias encerrou em{" "}
                    {deadlineLabel}, mas o beta continua grátis.
                  </>
                )}
              </p>

              <div className="mt-9 flex flex-col items-start gap-4">
                <OAuthCta
                  {...cta}
                  location="beta_hero"
                  onDark
                  className="w-full sm:w-auto"
                />
                {!isLoggedIn ? (
                  <CtaReassurance onDark className="justify-start" />
                ) : null}
              </div>
            </div>

            <DemoHeroSnapshot />
          </div>
        </section>

        {/* ------------------------------------------------- Feito por quem vende */}
        <MarketingSection
          id="quem-vende"
          surface="card"
          eyebrow="Feito por quem vende"
          eyebrowTone="emerald"
          title="A gente também vende no Mercado Livre"
          lead="A Maipo nasceu dentro da nossa loja. Precisávamos saber quanto sobrava de cada venda depois de tarifa, frete, imposto e Product Ads, e nenhuma planilha fechava a conta. Construímos o painel para nós e agora abrimos para outros vendedores."
        >
          <a
            href={SHOP.url}
            target="_blank"
            rel="noopener noreferrer"
            className="group flex max-w-xl flex-col gap-4 rounded-2xl border border-[var(--border)] bg-[var(--card)] p-5 shadow-sm transition-colors hover:border-[var(--primary)]/40 sm:flex-row sm:items-center"
          >
            <span className="inline-flex size-12 shrink-0 items-center justify-center rounded-xl bg-[var(--secondary)] text-[var(--primary)]">
              <Store className="size-6" aria-hidden />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-semibold uppercase tracking-wide text-[var(--muted-foreground)]">
                Nossa loja no Mercado Livre
              </p>
              <p className="mt-0.5 text-lg font-semibold text-[var(--primary)]">
                {SHOP.name}
              </p>
              {SHOP.highlights.length > 0 ? (
                <ul className="mt-2 flex flex-wrap gap-2">
                  {SHOP.highlights.map((h) => (
                    <li
                      key={h}
                      className="rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-semibold text-emerald-800"
                    >
                      {h}
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
            <span className="inline-flex items-center gap-1.5 text-sm font-medium text-[var(--primary)]">
              Ver a loja
              <ExternalLink className="size-4" aria-hidden />
            </span>
          </a>
        </MarketingSection>

        {/* --------------------------------------------------------- Calculadora */}
        <MarketingSection
          id="calculadora"
          surface="tint"
          eyebrow="Calculadora de preço"
          title="Até onde dá para baixar o preço sem perder dinheiro?"
          lead="Escolha um anúncio, digite um preço e veja a margem na hora, já com tarifa, frete, imposto e ADS. Teste aqui mesmo, com anúncios de exemplo."
          align="center"
        >
          <DemoCalculator
            isLoggedIn={isLoggedIn}
            dashboardHref={dashboardHref}
            connectHref={connectHref}
            ctaLabel={ctaLabel}
          />
        </MarketingSection>

        {/* ------------------------------------------------------- Lucratividade */}
        <MarketingSection
          id="lucratividade"
          surface="card"
          eyebrow="Lucratividade"
          title="Margem depois do Product Ads, anúncio por anúncio"
          lead="Verde quando sobra, vermelho quando o anúncio come a operação. A conta inclui o que o ADS levou de cada venda, que é onde a margem costuma sumir."
        >
          <DemoLucratividade />
        </MarketingSection>

        {/* ----------------------------------------------------------- Tributário */}
        <MarketingSection
          id="tributario"
          surface="base"
          eyebrow="Lucro real e imposto"
          title="O imposto de verdade de cada produto"
          lead="Vendas, receita e imposto por SKU: quanto cada produto leva do resultado. Lucro Real com apuração detalhada; Simples Nacional com a alíquota efetiva do DAS. Apoio ao fechamento, não substitui o contador."
        >
          <DemoTributario />
        </MarketingSection>

        {/* ------------------------------------------------- Central de anúncios */}
        <MarketingSection
          id="central"
          surface="card"
          eyebrow="Central de anúncios"
          eyebrowTone="violet"
          title="Todo dia, o que fazer em cada anúncio"
          lead="Catálogo perdendo, preço que dá para subir, promoção vencendo, anúncio parado: a lista do dia já vem pronta. Você resolve, marca como feito e acompanha o progresso."
        >
          <DemoCentralAnuncios />
        </MarketingSection>

        {/* --------------------------------------------------------------- Kanban */}
        <MarketingSection
          id="kanban"
          surface="base"
          eyebrow="Compras e Full"
          eyebrowTone="sky"
          title="Reposição sem planilha"
          lead="O card nasce quando o estoque vai faltar. Arraste do fornecedor até a compra, ou do anúncio até a coleta Full, com a equipe vendo o mesmo quadro."
        >
          <DemoKanban />
        </MarketingSection>

        {/* ------------------------------------------------------------ Segurança */}
        <MarketingSection
          id="seguranca"
          surface="card"
          eyebrow="Segurança"
          eyebrowTone="emerald"
          title="Conexão oficial, do jeito que o Mercado Livre oferece"
          lead="Ao conectar, o Mercado Livre vai avisar que o aplicativo ainda não é certificado: o selo vem com volume, e estamos em beta. O resto é o caminho oficial."
        >
          <div className="grid gap-4 sm:grid-cols-2">
            {SECURITY.map((item) => {
              const Icon = item.icon;
              return (
                <article
                  key={item.title}
                  className="flex flex-col rounded-2xl border border-[var(--border)] bg-[var(--card)] p-6 shadow-sm"
                >
                  <span className="inline-flex size-10 items-center justify-center rounded-xl bg-[var(--secondary)] text-[var(--primary)]">
                    <Icon className="size-5" aria-hidden />
                  </span>
                  <h3 className="mt-4 text-base font-semibold text-[var(--primary)]">
                    {item.title}
                  </h3>
                  <p className="mt-2 text-sm leading-relaxed text-[var(--muted-foreground)]">
                    {item.body}
                  </p>
                </article>
              );
            })}
          </div>
        </MarketingSection>

        {/* --------------------------------------------------------------- Oferta */}
        <MarketingSection
          id="oferta"
          surface="tint"
          width="narrow"
          align="center"
          eyebrow={offerActive ? `Até ${deadlineLabel}` : "Oferta encerrada"}
          eyebrowTone={offerActive ? "amber" : "primary"}
          title={
            offerActive
              ? `${BETA_OFFER.trialDays} dias grátis, garantidos`
              : "O beta continua grátis"
          }
          lead={
            offerActive
              ? `Para quem conectar a conta até ${deadlineLabel} (${daysLeftLabel(daysLeft)}).`
              : `A oferta de ${BETA_OFFER.trialDays} dias encerrou em ${deadlineLabel}. Você ainda pode testar a Maipo de graça durante o beta.`
          }
        >
          <div className="mx-auto max-w-md rounded-2xl border border-[var(--border)] bg-[var(--card)] p-6 text-left shadow-sm">
            <ul className="space-y-3">
              {[
                "Acesso completo: calculadora, lucratividade, tributário, DRE, Central de anúncios e kanban",
                offerActive
                  ? `${BETA_OFFER.trialDays} dias contados a partir do cadastro, mesmo que os planos pagos saiam antes`
                  : "Grátis enquanto durar o beta",
                "Sem cartão de crédito",
                "Nada é cobrado sem aviso e sem você concordar",
              ].map((line) => (
                <li
                  key={line}
                  className="flex items-start gap-2.5 text-sm leading-relaxed text-[var(--foreground)]"
                >
                  <Check
                    className="mt-0.5 size-4 shrink-0 text-emerald-600"
                    aria-hidden
                  />
                  {line}
                </li>
              ))}
            </ul>
            <div className="mt-6 flex justify-center">
              <OAuthCta {...cta} location="beta_offer" className="w-full" />
            </div>
          </div>
        </MarketingSection>

        {/* ------------------------------------------------------------------ FAQ */}
        <MarketingSection
          id="faq"
          surface="card"
          width="narrow"
          align="center"
          eyebrow="Dúvidas"
          title="Antes de conectar"
        >
          <FaqList items={FAQ} />
        </MarketingSection>

        <CtaBand
          isLoggedIn={isLoggedIn}
          dashboardHref={dashboardHref}
          connectHref={connectHref}
          ctaLabel={ctaLabel}
          title={
            offerActive
              ? `Garanta seus ${BETA_OFFER.trialDays} dias até ${deadlineLabel}.`
              : "Teste com a sua loja de verdade."
          }
          lead="Conecte a conta do Mercado Livre e veja a margem real dos seus anúncios em minutos."
        />
      </main>

      <footer className="border-t border-[var(--border)] bg-[var(--card)] px-4 pb-[calc(6rem+env(safe-area-inset-bottom,0px))] pt-10 sm:px-6 lg:pb-10">
        <div className="mx-auto max-w-6xl space-y-3 text-xs leading-relaxed text-[var(--muted-foreground)]">
          <p>
            A {LEGAL.productName} é um aplicativo independente e não possui
            vínculo, patrocínio ou afiliação com o Mercado Livre. O acesso é
            feito pela autorização oficial (OAuth) da sua conta.
          </p>
          <p className="flex flex-wrap gap-x-4 gap-y-1">
            <Link href="/privacidade" className="hover:text-[var(--primary)]">
              Privacidade
            </Link>
            <Link href="/termos" className="hover:text-[var(--primary)]">
              Termos de uso
            </Link>
            <a
              href={`mailto:${LEGAL.supportEmail}`}
              className="hover:text-[var(--primary)]"
            >
              {LEGAL.supportEmail}
            </a>
          </p>
        </div>
      </footer>

      <MarketingStickyCta
        isLoggedIn={isLoggedIn}
        dashboardHref={dashboardHref}
        connectHref={connectHref}
        ctaLabel={offerActive ? "Garantir" : undefined}
        title={
          offerActive
            ? `${BETA_OFFER.trialDays} dias grátis garantidos`
            : "Grátis durante o beta"
        }
        subtitle={
          offerActive
            ? `Conecte até ${deadlineLabel} · sem cartão`
            : "Sem cartão · sem senha nova"
        }
      />
    </div>
  );
}
