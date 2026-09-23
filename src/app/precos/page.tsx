import type { Metadata } from "next";
import Link from "next/link";
import { cookies } from "next/headers";
import { getMarketingCtaState } from "@/lib/mercadolibre/session";
import { siteUrl } from "@/lib/infra/site-url";
import { CtaBand } from "@/components/marketing/CtaBand";
import { MarketingFooter, MarketingHeader } from "@/components/marketing/MarketingChrome";
import { MarketingSection } from "@/components/marketing/MarketingSection";
import { PageHero } from "@/components/marketing/PageHero";
import { PricingCards } from "@/components/marketing/PricingCards";
import { MarketingStickyCta } from "@/components/marketing/StickyCta";

const title = "Preços — grátis durante o beta";
const description =
  "ERP 1a1 está em beta e é gratuito, sem cartão de crédito. Veja o que está incluso hoje e como vai funcionar quando os planos pagos forem lançados.";

export const metadata: Metadata = {
  title,
  description,
  alternates: { canonical: `${siteUrl()}/precos` },
  openGraph: {
    type: "website",
    url: `${siteUrl()}/precos`,
    siteName: "ERP 1a1",
    locale: "pt_BR",
    title,
    description,
  },
};

const PRICING_FAQ = [
  {
    q: "Preciso cadastrar cartão?",
    a: "Não. Você só conecta sua conta do Mercado Livre — nenhum cartão, nenhum dado de pagamento.",
  },
  {
    q: "Por quanto tempo é gratuito?",
    a: "Enquanto estivermos em beta. Ainda não temos uma data definida para lançar planos pagos, e quando tivermos, avisamos com antecedência — nada muda sem aviso.",
  },
  {
    q: "Vou ser cobrado de surpresa?",
    a: "Não existe cobrança automática hoje, e não vai existir sem um aviso claro antes.",
  },
  {
    q: "O que acontece com meus dados se eu parar de usar?",
    a: "Você revoga a autorização do aplicativo direto na sua conta do Mercado Livre — a partir daí não há mais sincronização. Para apagar o histórico já armazenado, basta pedir a exclusão da organização por e-mail.",
  },
  {
    q: "Existe limite de anúncios ou de vendas no beta?",
    a: "Não impomos limite artificial durante o beta. O painel sincroniza o catálogo e as vendas da conta conectada dentro dos limites da própria API do Mercado Livre.",
  },
] as const;

/** FAQPage desta página — específico de preço, separado do FAQ da home. */
function pricingFaqStructuredData() {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: PRICING_FAQ.map((item) => ({
      "@type": "Question",
      name: item.q,
      acceptedAnswer: { "@type": "Answer", text: item.a },
    })),
  };
}

export default async function PrecosPage() {
  const cookieStore = await cookies();
  const { isLoggedIn, dashboardHref } = getMarketingCtaState(cookieStore);

  return (
    <div className="marketing-landing flex min-h-full flex-1 flex-col">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(pricingFaqStructuredData()),
        }}
      />
      <MarketingHeader
        isLoggedIn={isLoggedIn}
        dashboardHref={dashboardHref}
        logoHref="/"
      />

      <main id="conteudo">
        <PageHero
          isLoggedIn={isLoggedIn}
          dashboardHref={dashboardHref}
          breadcrumb="Preços"
          eyebrow="Beta aberto"
          title="Grátis durante o beta. Sem cartão, sem pegadinha."
          lead="Estamos em fase beta e liberamos acesso completo ao painel sem cobrança. Quando chegar a hora de cobrar, avisamos antes — com tempo de sobra para você decidir."
        />

        <MarketingSection
          surface="base"
          align="center"
          eyebrow="Planos"
          title="O que existe hoje"
          lead="Um plano só: o beta, com o painel inteiro liberado. Os próximos ainda estão sendo desenhados."
        >
          <PricingCards
            isLoggedIn={isLoggedIn}
            dashboardHref={dashboardHref}
          />
        </MarketingSection>

        <MarketingSection
          surface="card"
          width="narrow"
          eyebrow="Transparência"
          eyebrowTone="emerald"
          title="Por que ainda não tem preço"
        >
          <div className="legal-prose space-y-5">
            <p>
              Ainda estamos validando o produto com quem usa de verdade —
              inclusive com quem está entrando agora. Fixar um preço antes
              disso seria chutar o valor entregue, e é justamente esse tipo de
              chute que o painel existe para evitar.
            </p>
            <p>
              Quando os planos pagos forem definidos, avisamos por e-mail e
              dentro do próprio painel, com antecedência. Nada muda de uma hora
              para outra, e nenhuma cobrança acontece sem contratação expressa
              sua — está escrito nos{" "}
              <Link href="/termos">Termos de uso</Link>.
            </p>
          </div>
        </MarketingSection>

        <MarketingSection
          surface="base"
          width="narrow"
          eyebrow="Dúvidas"
          title="Perguntas rápidas sobre cobrança"
        >
          <div className="divide-y divide-[var(--border)] overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--card)] shadow-sm">
            {PRICING_FAQ.map((item) => (
              <div key={item.q} className="px-6 py-5">
                <p className="font-medium text-[var(--foreground)]">{item.q}</p>
                <p className="mt-1.5 text-sm leading-relaxed text-[var(--muted-foreground)]">
                  {item.a}
                </p>
              </div>
            ))}
          </div>
        </MarketingSection>

        <CtaBand
          isLoggedIn={isLoggedIn}
          dashboardHref={dashboardHref}
          title="Teste com a sua loja de verdade, sem custo."
          lead="Lucratividade, tributário, catálogo, kanban e DRE no mesmo lugar — conectando só a conta que você já usa na ML."
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
