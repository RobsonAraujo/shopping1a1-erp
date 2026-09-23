import type { Metadata } from "next";
import { cookies } from "next/headers";
import { Mail, Scale, ScanSearch, Split, Workflow } from "lucide-react";
import { getMarketingCtaState } from "@/lib/mercadolibre/session";
import { siteUrl } from "@/lib/infra/site-url";
import { CtaBand } from "@/components/marketing/CtaBand";
import { MarketingFooter, MarketingHeader } from "@/components/marketing/MarketingChrome";
import { MarketingSection } from "@/components/marketing/MarketingSection";
import { PageHero } from "@/components/marketing/PageHero";
import { LEGAL } from "@/lib/marketing/legal";

const title = "Sobre o ERP 1a1";
const description =
  "Por que construímos um painel de lucratividade, imposto e DRE para vendedores do Mercado Livre — e os princípios que guiam cada número que aparece na tela.";

export const metadata: Metadata = {
  title,
  description,
  alternates: { canonical: `${siteUrl()}/sobre` },
  openGraph: {
    type: "website",
    url: `${siteUrl()}/sobre`,
    siteName: "ERP 1a1",
    locale: "pt_BR",
    title,
    description,
  },
};

const PRINCIPLES = [
  {
    icon: ScanSearch,
    title: "Nenhum número sem origem",
    body: "Toda linha de resultado abre a conta que a gerou — venda a venda, tarifa a tarifa. Se o painel não consegue mostrar de onde veio, o número não deveria estar lá.",
  },
  {
    icon: Split,
    title: "O dado vem da fonte, não do chute",
    body: "Tarifa, desconto de tarifa, devolução e ADS são lidos do que o Mercado Livre efetivamente cobrou. Tabela de referência própria envelhece; fatura, não.",
  },
  {
    icon: Workflow,
    title: "Cadastrar uma vez, usar em todo lugar",
    body: "O custo de nota que você informa em Lucratividade é o mesmo que alimenta o DRE e a apuração fiscal. Planilha paralela é sintoma de sistema mal feito.",
  },
  {
    icon: Scale,
    title: "Dizer o que não fazemos",
    body: "O painel não emite nota fiscal e não substitui contador. Deixar isso claro vale mais do que uma página de recursos maior.",
  },
] as const;

const STATUS = [
  {
    label: "Hoje",
    body: "Beta aberto e gratuito, sem cartão. Lucratividade, tributário (Lucro Real e Simples Nacional), DRE, catálogo, estoque, kanban de compras e Full já rodando com dados reais de loja.",
  },
  {
    label: "Em construção",
    body: "Mais profundidade nos insights de giro e ruptura, e refinamento contínuo da conciliação com a fatura do Mercado Livre.",
  },
  {
    label: "Quando houver preço",
    body: "Os planos pagos ainda estão sendo desenhados. Serão anunciados por e-mail e dentro do painel, com antecedência — nunca como cobrança surpresa.",
  },
] as const;

export default async function SobrePage() {
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
          breadcrumb="Sobre"
          eyebrow="Sobre"
          title="O painel que a gente queria ter para fechar o mês"
          lead="Quem vende no Mercado Livre não sofre por falta de dado — sofre por dado espalhado. Faturamento numa tela, tarifa na fatura, ADS em outro relatório, custo numa planilha que alguém esqueceu de atualizar. O ERP 1a1 nasceu para juntar isso numa conta só, que fecha."
        />

        <MarketingSection
          surface="card"
          width="narrow"
          eyebrow="O problema de origem"
          title="Faturamento alto não é o mesmo que negócio saudável"
        >
          <div className="legal-prose space-y-5">
            <p>
              A conta que a maioria dos vendedores faz — preço menos custo do
              produto menos comissão — dá um número bonito e errado. Ela ignora
              o que só aparece depois: o desconto de tarifa que veio ou não
              veio, a devolução parcial, o frete subsidiado, o imposto do
              regime e o Product Ads que consumiu parte da margem daquele
              anúncio específico.
            </p>
            <p>
              O resultado é conhecido: a loja cresce em faturamento, o caixa não
              acompanha, e quando alguém finalmente senta para reconciliar,
              descobre que <strong>alguns anúncios estavam vendendo no
              prejuízo há meses</strong> — geralmente os que mais vendiam,
              porque eram os que mais recebiam investimento em ads.
            </p>
            <p>
              O ERP 1a1 existe para esse número aparecer <strong>antes</strong>,
              por anúncio, com a fatura como fonte. E para que o fechamento do
              mês seja uma leitura, não uma investigação.
            </p>
          </div>
        </MarketingSection>

        <MarketingSection
          surface="base"
          eyebrow="Princípios"
          eyebrowTone="emerald"
          title="Quatro regras que valem mais que a lista de recursos"
          lead="Elas decidem o que entra e o que não entra no produto — inclusive quando entrar seria mais fácil de vender."
        >
          <div className="grid gap-5 sm:grid-cols-2">
            {PRINCIPLES.map((item) => {
              const Icon = item.icon;
              return (
                <article
                  key={item.title}
                  className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-6 shadow-sm"
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

        <MarketingSection
          surface="card"
          width="narrow"
          eyebrow="Em que pé estamos"
          title="Sem enfeite: o estágio real do produto"
          lead="Preferimos que você decida com a informação certa do que descubra depois."
        >
          <ol className="overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--card)] shadow-sm">
            {STATUS.map((item, index) => (
              <li
                key={item.label}
                className={
                  index > 0
                    ? "border-t border-[var(--border)] p-6"
                    : "p-6"
                }
              >
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--primary)]">
                  {item.label}
                </p>
                <p className="mt-2 text-[15px] leading-relaxed text-[var(--muted-foreground)]">
                  {item.body}
                </p>
              </li>
            ))}
          </ol>

          <div className="mt-8 flex flex-col gap-3 rounded-2xl border border-dashed border-[var(--border)] p-6 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h3 className="flex items-center gap-2 text-base font-semibold text-[var(--primary)]">
                <Mail className="size-4" aria-hidden />
                Falar com a gente
              </h3>
              <p className="mt-1.5 text-sm text-[var(--muted-foreground)]">
                Dúvida, bug, sugestão de recurso ou pedido de exclusão de
                dados — a mesma caixa de entrada.
              </p>
            </div>
            <a
              href={`mailto:${LEGAL.supportEmail}`}
              className="shrink-0 whitespace-nowrap rounded-full bg-[var(--primary)] px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[#152456]"
            >
              {LEGAL.supportEmail}
            </a>
          </div>
        </MarketingSection>

        <CtaBand
          isLoggedIn={isLoggedIn}
          dashboardHref={dashboardHref}
          title="A melhor forma de avaliar é com a sua loja."
          lead="Conecte a conta do Mercado Livre e veja a margem real dos seus anúncios — leva alguns minutos e não pede cartão."
        />
      </main>

      <MarketingFooter />
    </div>
  );
}
