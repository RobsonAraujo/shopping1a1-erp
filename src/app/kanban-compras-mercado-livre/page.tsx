import type { Metadata } from "next";
import Link from "next/link";
import { cookies } from "next/headers";
import { Columns3, Share2, Truck } from "lucide-react";
import { getMarketingCtaState } from "@/lib/mercadolibre/session";
import { siteUrl } from "@/lib/infra/site-url";
import { CtaBand } from "@/components/marketing/CtaBand";
import { DefinitionList } from "@/components/marketing/DefinitionList";
import { DemoKanban } from "@/components/marketing/DemoKanban";
import { MarketingFooter, MarketingHeader } from "@/components/marketing/MarketingChrome";
import { MarketingSection } from "@/components/marketing/MarketingSection";
import { PageHero } from "@/components/marketing/PageHero";
import { MarketingStickyCta } from "@/components/marketing/StickyCta";
import { cn } from "@/lib/utils";

const title = "Kanban de compras e Full para Mercado Livre — estilo Trello";
const description =
  "Reposição e coleta Full num quadro arrastável, compartilhado com a equipe. Os cards nascem do giro e da ruptura da sua loja no Mercado Livre.";

export const metadata: Metadata = {
  title,
  description,
  alternates: { canonical: `${siteUrl()}/kanban-compras-mercado-livre` },
  openGraph: {
    type: "website",
    url: `${siteUrl()}/kanban-compras-mercado-livre`,
    siteName: "ERP 1a1",
    locale: "pt_BR",
    title,
    description,
  },
};

const PILLARS = [
  {
    icon: Columns3,
    title: "Etapas do seu jeito",
    body: "Renomeie, acrescente, recolha ou pinte a coluna. O visual colorido deixa óbvio o que está na entrada e o que já foi comprado, sem planilha paralela.",
    wrap: "border-sky-200/80 bg-gradient-to-br from-sky-50 via-white to-white",
    icon_bg: "bg-sky-100 text-sky-700",
  },
  {
    icon: Share2,
    title: "Compartilhado com a loja",
    body: "Fundo, tela cheia e aparência das colunas ficam na organização. Quem entra no painel vê o mesmo quadro: compras e Full alinhados.",
    wrap: "border-amber-200/80 bg-gradient-to-br from-amber-50 via-white to-white",
    icon_bg: "bg-amber-100 text-amber-800",
  },
  {
    icon: Truck,
    title: "Do kanban para o DRE",
    body: null,
    wrap: "border-emerald-200/80 bg-gradient-to-br from-emerald-50 via-white to-white",
    icon_bg: "bg-emerald-100 text-emerald-800",
  },
] as const;

const COVERAGE = [
  {
    term: "Compras",
    body: "Cards agrupados por fornecedor, com SKUs em ruptura e quantidade sugerida. Arraste para avançar a etapa de compra.",
  },
  {
    term: "Operações Full",
    body: "Cada anúncio que precisa de envio: agendar, coletar, sumir do quadro quando o estoque ML sobe.",
  },
  {
    term: "Aparência",
    body: "Padrão, uma cor ou colorida por etapa; faixa, cabeçalho ou coluna inteira. Tela cheia no estilo Trello.",
  },
  {
    term: "Margem no mesmo painel",
    body: (
      <>
        O kanban não substitui a{" "}
        <Link href="/margem-de-contribuicao-mercado-livre">
          lucratividade por anúncio
        </Link>
        : ele faz o pedido sair quando o número já mostrou que vale a pena
        repor.
      </>
    ),
  },
] as const;

export default async function KanbanComprasPage() {
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
          breadcrumb="Kanban"
          eyebrow="Operação · Kanban"
          title="Compras e Full no mesmo estilo Trello, com os números da sua loja"
          lead="O card nasce quando o estoque vai faltar. Você arrasta do fornecedor até a compra, ou do alerta até a coleta Full. Colunas, cores e tela cheia ficam iguais para toda a equipe, e não é um quadro só no seu navegador."
          highlights={[
            "Os cards vêm do giro real, não do seu palpite",
            "Quadro compartilhado com a organização",
            "Custo de coleta Full cai direto no DRE",
          ]}
        />

        <MarketingSection
          surface="base"
          eyebrow="Dois quadros"
          eyebrowTone="sky"
          title="Um quadro para pedir, outro para enviar ao Full"
          lead="Em Compras o card é o fornecedor: SKUs, quantidade sugerida e urgência no mesmo lugar. Em Operações Full o card é o anúncio: estoque ML, galpão e data para agendar a coleta."
        >
          <DemoKanban />
        </MarketingSection>

        <MarketingSection surface="card">
          <div className="grid gap-6 sm:grid-cols-3">
            {PILLARS.map((item) => {
              const Icon = item.icon;
              return (
                <article
                  key={item.title}
                  className={cn(
                    "rounded-2xl border p-6 shadow-sm",
                    item.wrap,
                  )}
                >
                  <span
                    className={cn(
                      "inline-flex size-11 items-center justify-center rounded-xl",
                      item.icon_bg,
                    )}
                  >
                    <Icon className="size-5" aria-hidden />
                  </span>
                  <h3 className="mt-4 text-lg font-semibold text-[var(--primary)]">
                    {item.title}
                  </h3>
                  <p className="mt-2 text-sm leading-relaxed text-[var(--muted-foreground)]">
                    {item.body ?? (
                      <>
                        O custo de coleta Full entra no{" "}
                        <Link
                          href="/dre-mercado-livre"
                          className="font-medium text-[var(--primary)] underline decoration-[var(--primary)]/30 underline-offset-4"
                        >
                          DRE
                        </Link>{" "}
                        sem digitação duplicada. A reposição olha giro, não só
                        o estoque de ontem.
                      </>
                    )}
                  </p>
                </article>
              );
            })}
          </div>
        </MarketingSection>

        <MarketingSection
          surface="base"
          width="narrow"
          eyebrow="Cobertura"
          title="O que o quadro cobre"
        >
          <DefinitionList items={COVERAGE} />
        </MarketingSection>

        <CtaBand
          isLoggedIn={isLoggedIn}
          dashboardHref={dashboardHref}
          title="Pare de descobrir a ruptura pelo gráfico caindo."
          lead="Conecte sua loja e veja os cards de reposição nascerem do giro real, antes do estoque zerar."
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
