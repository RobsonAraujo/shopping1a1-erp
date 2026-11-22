import Link from "next/link";
import {
  BadgeCheck,
  Check,
  Gift,
  KeyRound,
  MousePointerClick,
  Store,
  X,
} from "lucide-react";
import { BetaMoneyLeak } from "@/components/marketing/BetaMoneyLeak";
import { BetaOfferCard, type BetaCta } from "@/components/marketing/BetaOfferCard";
import { BrandLogo } from "@/components/shared/BrandLogo";
import { CtaBand, CtaReassurance } from "@/components/marketing/CtaBand";
import { DemoCalculator } from "@/components/marketing/DemoCalculator";
import { DemoCentralAnuncios } from "@/components/marketing/DemoCentralAnuncios";
import { DemoLucratividade } from "@/components/marketing/DemoLucratividade";
import { FaqList, type FaqItem } from "@/components/marketing/Faq";
import {
  MarketingHowItStarts,
  type HowItStartsStep,
} from "@/components/marketing/HowItStarts";
import { MarketingSection } from "@/components/marketing/MarketingSection";
import { MarketingStickyCta } from "@/components/marketing/StickyCta";
import { OAuthCta } from "@/components/marketing/OauthCta";
import { OfferCountdown } from "@/components/marketing/OfferCountdown";
import { LEGAL } from "@/lib/marketing/legal";
import { BETA_OFFER } from "@/lib/marketing/campaign-offer";
import { cn } from "@/lib/utils";

/**
 * Página de campanha (`/beta`), montada como página de venda: promessa e
 * oferta na primeira dobra, depois dor, solução, como funciona, oferta de
 * novo, dúvidas e CTA final. Uma ação só (conectar), sem menu nem links de
 * saída. A headline repete a promessa do anúncio (margem e lucro
 * por venda). Depois do prazo, troca o texto sozinha.
 */

/** Loja própria no Mercado Livre: a prova de que a Maipo nasceu de quem vende. */
const SHOP = { name: "shop1a1" } as const;

const HERO_BULLETS = [
  "Margem de cada anúncio depois do Product Ads",
  "Até onde dá para baixar o preço sem perder dinheiro",
  "Todo dia, a lista do que mexer em cada anúncio",
] as const;

/** Prova colada no hero: o que a Maipo é (e não é) antes de pedir a conexão. */
const PROOF = [
  {
    icon: Store,
    title: "Feito por quem vende",
    body: `Nasceu na loja ${SHOP.name}, no Mercado Livre`,
  },
  {
    icon: BadgeCheck,
    title: "API oficial do Mercado Livre",
    body: "Sem robô e sem extensão no navegador",
  },
  {
    icon: KeyRound,
    title: "Sua senha fica no Mercado Livre",
    body: "A Maipo recebe só um token criptografado",
  },
  {
    icon: MousePointerClick,
    title: "Nada muda sem o seu clique",
    body: "Preço e promoção só quando você manda",
  },
] as const;

const PAINS = [
  {
    title: "A planilha só sabe o que você digitou",
    body: "Comissão, frete, desconto de tarifa e ADS chegam depois, na fatura.",
  },
  {
    title: "O anúncio parece lucrativo até o Product Ads entrar",
    body: "O TACOS não aparece na conta de margem que a maioria faz.",
  },
  {
    title: "A margem do produto não é a margem do anúncio",
    body: "O mesmo SKU roda em Clássico e Premium, com preço e frete diferentes.",
  },
] as const;

const STEPS: readonly HowItStartsStep[] = [
  {
    n: "01",
    title: "Entre com a sua conta do Mercado Livre",
    body: "Você autoriza a Maipo na tela do próprio Mercado Livre, sem senha nova. Lá aparece um aviso de aplicativo ainda não certificado: é esperado durante o beta, e a conexão é a API oficial.",
  },
  {
    n: "02",
    title: "Informe o custo e o regime",
    body: "O custo de nota dos produtos e o regime (Simples Nacional ou Lucro Real). É o que o Mercado Livre não sabe.",
  },
  {
    n: "03",
    title: "Veja quanto sobra de cada anúncio",
    body: "Vendas, tarifas, frete e ADS entram sozinhos. Lucratividade, calculadora e Central de anúncios já abrem com a sua loja.",
  },
];

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

function OfferBar({
  cta,
  serverNowMs,
  deadlineLabel,
}: {
  cta: BetaCta;
  serverNowMs: number;
  deadlineLabel: string;
}) {
  return (
    <div className="sticky top-0 z-40 bg-amber-300 pt-[env(safe-area-inset-top)] text-[#0a1130] shadow-[0_1px_0_rgba(10,17,48,0.12)]">
      <div className="mx-auto flex max-w-6xl items-center justify-center gap-4 px-4 py-2 sm:justify-between sm:px-6">
        <p className="flex min-w-0 items-center gap-2 text-xs sm:text-[13px]">
          <Gift className="size-4 shrink-0" aria-hidden />
          <span className="font-semibold">
            {BETA_OFFER.trialDays} dias grátis
          </span>
          <span className="hidden sm:inline">
            garantidos para quem conectar até {deadlineLabel}
          </span>
          <span aria-hidden>·</span>
          <span className="whitespace-nowrap">
            termina em{" "}
            <OfferCountdown
              serverNowMs={serverNowMs}
              variant="text"
              className="font-bold"
            />
          </span>
        </p>
        {!cta.isLoggedIn ? (
          <OAuthCta
            {...cta}
            label="Garantir"
            location="beta_offer_bar"
            size="sm"
            className="hidden h-7 shrink-0 px-3.5 text-xs sm:inline-flex"
          />
        ) : null}
      </div>
    </div>
  );
}

export function BetaLanding({
  isLoggedIn,
  dashboardHref,
  offerActive,
  serverNowMs,
  deadlineLabel,
}: {
  isLoggedIn: boolean;
  dashboardHref: string;
  offerActive: boolean;
  /** Horário do servidor na renderização, para o contador hidratar sem divergência. */
  serverNowMs: number;
  deadlineLabel: string;
}) {
  const connectHref = offerActive
    ? `/conectar?oferta=${BETA_OFFER.id}`
    : "/conectar";
  const ctaLabel = offerActive ? "Garantir meu mês grátis" : "Testar grátis";
  const cta: BetaCta = { isLoggedIn, dashboardHref, connectHref, label: ctaLabel };
  const offer = { offerActive, serverNowMs, deadlineLabel };

  return (
    <div className="marketing-landing flex min-h-full flex-1 flex-col">
      {offerActive ? (
        <OfferBar cta={cta} serverNowMs={serverNowMs} deadlineLabel={deadlineLabel} />
      ) : null}

      <div className="relative flex flex-1 flex-col">
        <header
          className={cn(
            "absolute inset-x-0 top-0 z-20 px-4 sm:px-6",
            offerActive
              ? "pt-5"
              : "pt-[calc(1.25rem+env(safe-area-inset-top))]",
          )}
        >
          <div className="mx-auto flex max-w-6xl items-center gap-3">
            <BrandLogo tone="negative" className="h-7" />
            <span className="rounded-full border border-white/25 bg-white/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white/80">
              Beta
            </span>
          </div>
        </header>

        <main id="conteudo">
          {/* ---------------------------------------------------------- Hero */}
          <section className="marketing-hero relative overflow-hidden bg-gradient-to-br from-[#0a1130] via-[#141f52] to-[#1b2d6f] px-4 pb-16 pt-20 text-white sm:px-6 sm:pb-24 sm:pt-28">
            <div
              className="marketing-hero-grid pointer-events-none absolute inset-0"
              aria-hidden
            />
            <div
              className="pointer-events-none absolute -right-24 -top-24 size-96 rounded-full bg-amber-300/15 blur-3xl"
              aria-hidden
            />
            <div
              className="pointer-events-none absolute -bottom-32 left-1/4 size-72 rounded-full bg-cyan-400/10 blur-3xl"
              aria-hidden
            />

            <div className="relative mx-auto grid max-w-6xl items-center gap-12 lg:grid-cols-[1.15fr_0.85fr] lg:gap-14">
              <div>
                <p className="inline-flex items-center gap-2 rounded-full border border-cyan-300/30 bg-cyan-400/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em] text-cyan-100">
                  Para quem vende no Mercado Livre
                </p>

                <h1 className="mt-5 text-balance text-[clamp(2rem,5.2vw,3.6rem)] font-bold leading-[1.07] tracking-tight">
                  <span className="text-white">
                    Descubra quais anúncios dão lucro{" "}
                  </span>
                  <span className="bg-gradient-to-r from-amber-200 via-amber-300 to-orange-300 bg-clip-text text-transparent">
                    e quais estão te dando prejuízo
                  </span>
                </h1>

                <p className="mt-5 max-w-xl text-pretty text-base leading-relaxed text-white/80 sm:text-lg">
                  A Maipo lê as suas vendas e mostra{" "}
                  <strong className="font-semibold text-white">
                    quanto sobra de cada uma
                  </strong>{" "}
                  depois da tarifa, do frete, do imposto e do Product Ads. Sem
                  planilha, com a sua loja de verdade.
                </p>

                {/* No celular o botão vem antes dos bullets, para ficar na primeira dobra. */}
                <div className="mt-7 flex flex-col items-stretch gap-3 lg:hidden">
                  <OAuthCta {...cta} location="beta_hero_mobile" onDark className="w-full" />
                  {!isLoggedIn ? <CtaReassurance onDark /> : null}
                </div>

                <ul className="mt-8 space-y-3">
                  {HERO_BULLETS.map((line) => (
                    <li
                      key={line}
                      className="flex items-start gap-3 text-[15px] leading-snug text-white/90 sm:text-base"
                    >
                      <span
                        className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-emerald-400/20 text-emerald-300"
                        aria-hidden
                      >
                        <Check className="size-3.5" strokeWidth={3} />
                      </span>
                      {line}
                    </li>
                  ))}
                </ul>

                <p className="mt-8 flex items-center gap-2.5 border-t border-white/10 pt-6 text-sm text-white/60">
                  <Store className="size-4 shrink-0 text-amber-200" aria-hidden />
                  <span>
                    Feito por quem vende: a Maipo nasceu na loja{" "}
                    <strong className="font-semibold text-white/85">{SHOP.name}</strong>
                    , no Mercado Livre.
                  </span>
                </p>
              </div>

              <BetaOfferCard
                {...offer}
                cta={cta}
                location="beta_hero_card"
                className="mx-auto lg:mr-0"
              />
            </div>
          </section>

          {/* ----------------------------------------------------- Faixa de prova */}
          <section
            aria-label="Por que confiar"
            className="border-b border-[var(--border)] bg-white px-4 py-8 sm:px-6"
          >
            <ul className="mx-auto grid max-w-6xl gap-x-6 gap-y-5 sm:grid-cols-2 lg:grid-cols-4">
              {PROOF.map(({ icon: Icon, title, body }) => (
                <li key={title} className="flex items-start gap-3">
                  <span className="inline-flex size-9 shrink-0 items-center justify-center rounded-xl bg-[var(--secondary)] text-[var(--primary)]">
                    <Icon className="size-[18px]" aria-hidden />
                  </span>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-[var(--foreground)]">{title}</p>
                    <p className="mt-0.5 text-xs leading-relaxed text-[var(--muted-foreground)]">
                      {body}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          </section>

          {/* -------------------------------------------------------------- Dor */}
          <MarketingSection
            id="onde-some"
            surface="base"
            eyebrow="Onde o seu dinheiro some"
            eyebrowTone="amber"
            title="Vender bem não é o mesmo que sobrar dinheiro"
            lead="Os custos que comem a margem saem da venda aos poucos e só aparecem juntos na fatura. Veja uma venda de exemplo, real a real."
          >
            <div className="grid items-start gap-10 lg:grid-cols-[0.9fr_1.1fr] lg:gap-14">
              <ol className="order-2 space-y-4 lg:order-1">
                {PAINS.map((pain) => (
                  <li
                    key={pain.title}
                    className="flex gap-3.5 rounded-2xl border border-[var(--border)] bg-white p-5 shadow-sm"
                  >
                    <span
                      className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full bg-rose-100 text-rose-700"
                      aria-hidden
                    >
                      <X className="size-3.5" strokeWidth={3} />
                    </span>
                    <div className="min-w-0">
                      <p className="font-semibold leading-snug text-[var(--foreground)]">
                        {pain.title}
                      </p>
                      <p className="mt-1 text-sm leading-relaxed text-[var(--muted-foreground)]">
                        {pain.body}
                      </p>
                    </div>
                  </li>
                ))}
                <li className="rounded-2xl bg-[#0f1a45] p-5 text-white">
                  <p className="font-semibold leading-snug">
                    A Maipo faz essa conta para cada anúncio, com os números da
                    sua fatura.
                  </p>
                  <p className="mt-1 text-sm leading-relaxed text-white/70">
                    E mostra quais estão sobrando e quais estão te custando
                    dinheiro.
                  </p>
                </li>
              </ol>
              <div className="order-1 lg:order-2">
                <BetaMoneyLeak />
              </div>
            </div>
          </MarketingSection>

          {/* ------------------------------------------------- Solução: 1 de 3 */}
          <MarketingSection
            id="lucratividade"
            surface="card"
            eyebrow="1 · Lucratividade"
            title="Saiba quais anúncios dão lucro, depois do Product Ads"
            lead="Verde quando sobra, vermelho quando o anúncio come a operação. A conta já tira o que o ADS levou de cada venda, que é onde a margem costuma sumir."
          >
            <DemoLucratividade />
          </MarketingSection>

          {/* ------------------------------------------------- Solução: 2 de 3 */}
          <MarketingSection
            id="calculadora"
            surface="tint"
            eyebrow="2 · Calculadora de preço"
            title="Ache o preço certo antes de mexer no anúncio"
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

          {/* ------------------------------------------------- Solução: 3 de 3 */}
          <MarketingSection
            id="central"
            surface="card"
            eyebrow="3 · Central de anúncios"
            eyebrowTone="violet"
            title="Saiba todo dia o que mexer em cada anúncio"
            lead="Catálogo perdendo, preço que dá para subir, promoção vencendo, anúncio parado: a lista do dia já vem pronta. Você resolve e marca como feito."
          >
            <DemoCentralAnuncios />

            <div className="mt-12 flex flex-col items-center gap-5 rounded-2xl border border-[var(--border)] bg-[var(--background)] px-6 py-8 text-center">
              <p className="max-w-2xl text-pretty text-sm leading-relaxed text-[var(--muted-foreground)] sm:text-[15px]">
                <strong className="font-semibold text-[var(--foreground)]">
                  E mais:
                </strong>{" "}
                imposto por SKU (Lucro Real e Simples Nacional), DRE que fecha
                com a fatura e kanban de compras e Full. Tudo incluso{" "}
                {offerActive
                  ? `nos ${BETA_OFFER.trialDays} dias grátis`
                  : "no beta grátis"}
                .
              </p>
              <OAuthCta {...cta} location="beta_solution" />
            </div>
          </MarketingSection>

          {/* ---------------------------------------------------- Como funciona */}
          <MarketingHowItStarts
            id="como-funciona"
            eyebrow="Como funciona"
            title="Do clique à margem de cada anúncio"
            lead="Sem cartão, sem senha nova e sem planilha para importar."
            steps={STEPS}
            isLoggedIn={isLoggedIn}
            dashboardHref={dashboardHref}
            connectHref={connectHref}
            ctaLabel={ctaLabel}
            location="beta_how"
          />

          {/* ------------------------------------------------------------ Oferta */}
          <MarketingSection
            id="oferta"
            surface="tint"
            width="narrow"
            align="center"
            eyebrow={offerActive ? `Até ${deadlineLabel}` : "Oferta encerrada"}
            eyebrowTone={offerActive ? "amber" : "primary"}
            title={
              offerActive
                ? `Garanta seus ${BETA_OFFER.trialDays} dias antes de ${deadlineLabel}`
                : "O beta continua grátis"
            }
            lead={
              offerActive
                ? "Os 30 dias contam a partir do cadastro e ficam gravados na sua conta, mesmo que os planos pagos saiam antes."
                : `A oferta de ${BETA_OFFER.trialDays} dias encerrou em ${deadlineLabel}. Você ainda pode testar a Maipo de graça durante o beta.`
            }
          >
            <BetaOfferCard
              {...offer}
              cta={cta}
              location="beta_offer"
              className="mx-auto"
            />
          </MarketingSection>

          {/* --------------------------------------------------------------- FAQ */}
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
                ? `Seus ${BETA_OFFER.trialDays} dias grátis esperam até ${deadlineLabel}.`
                : "Teste com a sua loja de verdade."
            }
            lead="Conecte a conta do Mercado Livre e veja quanto sobra de cada anúncio."
          >
            {offerActive ? (
              <p className="mt-6 inline-flex items-center gap-2 rounded-full bg-amber-300/15 px-4 py-1.5 text-sm text-amber-100 ring-1 ring-amber-300/30">
                A oferta termina em{" "}
                <OfferCountdown
                  serverNowMs={serverNowMs}
                  variant="text"
                  className="font-bold text-amber-200"
                />
              </p>
            ) : null}
          </CtaBand>
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
      </div>

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
          offerActive ? (
            <>
              Termina em{" "}
              <OfferCountdown serverNowMs={serverNowMs} variant="short" />
              {" "}· sem cartão
            </>
          ) : (
            "Sem cartão · sem senha nova"
          )
        }
      />
    </div>
  );
}
