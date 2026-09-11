import type { Metadata } from "next";
import Link from "next/link";
import { cookies } from "next/headers";
import { Columns3, Share2, Truck } from "lucide-react";
import { getMarketingCtaState } from "@/lib/mercadolibre/session";
import { siteUrl } from "@/lib/infra/site-url";
import { DemoKanban } from "@/components/marketing/DemoKanban";
import {
  MarketingFooter,
  MarketingHeader,
} from "@/components/marketing/MarketingChrome";
import { OAuthCta } from "@/components/marketing/OauthCta";

const title = "Kanban de compras e Full para Mercado Livre";
const description =
  "Arraste o pedido do fornecedor da entrada até a compra. O mesmo quadro para agendar envio Full. Colunas, cores e tela cheia compartilhados com a equipe. Teste grátis.";

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
    images: ["/logo-bg-blue.png"],
  },
};

export default async function KanbanComprasMercadoLivrePage() {
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
              Operação · Kanban
            </p>
            <h1 className="mt-3 text-[clamp(2rem,5vw,3.25rem)] font-bold leading-[1.1] tracking-tight">
              Compras e Full no mesmo estilo Trello, com os números da sua loja
            </h1>
            <p className="mx-auto mt-4 max-w-xl text-base leading-relaxed text-white/80 sm:text-lg">
              O card nasce quando o estoque vai faltar. Você arrasta do
              fornecedor até a compra, ou do alerta até a coleta Full. Colunas,
              cores e tela cheia ficam iguais para toda a equipe — não é um
              quadro só no seu navegador.
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
                Um quadro para pedir, outro para enviar ao Full
              </h2>
              <p className="mt-3 text-[15px] leading-relaxed text-[var(--muted-foreground)]">
                Em Compras o card é o fornecedor: SKUs, quantidade sugerida e
                urgência no mesmo lugar. Em Operações Full o card é o anúncio —
                estoque ML, galpão e data para agendar a coleta.
              </p>
            </div>
            <DemoKanban />
          </div>
        </section>

        <section className="scroll-mt-20 bg-white px-4 py-16 sm:px-6 sm:py-20">
          <div className="mx-auto grid max-w-6xl gap-6 sm:grid-cols-3">
            <article className="rounded-2xl border border-sky-200/80 bg-gradient-to-br from-sky-50 via-white to-white p-5 shadow-sm sm:p-6">
              <span className="inline-flex size-11 items-center justify-center rounded-xl bg-sky-100 text-sky-700">
                <Columns3 className="size-5" aria-hidden />
              </span>
              <h3 className="mt-4 text-lg font-semibold text-[var(--primary)]">
                Etapas do seu jeito
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-[var(--muted-foreground)]">
                Renomeie, acrescente, recolha ou pinte a coluna. O visual
                colorido deixa óbvio o que está na entrada e o que já foi
                comprado — sem planilha paralela.
              </p>
            </article>
            <article className="rounded-2xl border border-amber-200/80 bg-gradient-to-br from-amber-50 via-white to-white p-5 shadow-sm sm:p-6">
              <span className="inline-flex size-11 items-center justify-center rounded-xl bg-amber-100 text-amber-800">
                <Share2 className="size-5" aria-hidden />
              </span>
              <h3 className="mt-4 text-lg font-semibold text-[var(--primary)]">
                Compartilhado com a loja
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-[var(--muted-foreground)]">
                Fundo, tela cheia e aparência das colunas ficam na organização.
                Quem entra no painel vê o mesmo quadro — compras e Full
                alinhados.
              </p>
            </article>
            <article className="rounded-2xl border border-emerald-200/80 bg-gradient-to-br from-emerald-50 via-white to-white p-5 shadow-sm sm:p-6">
              <span className="inline-flex size-11 items-center justify-center rounded-xl bg-emerald-100 text-emerald-800">
                <Truck className="size-5" aria-hidden />
              </span>
              <h3 className="mt-4 text-lg font-semibold text-[var(--primary)]">
                Do kanban para o DRE
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-[var(--muted-foreground)]">
                O custo de coleta Full entra no{" "}
                <Link
                  href="/dre-mercado-livre"
                  className="text-[var(--primary)] underline underline-offset-2"
                >
                  DRE
                </Link>{" "}
                sem digitação duplicada. A reposição olha giro — não só o
                estoque de ontem.
              </p>
            </article>
          </div>
        </section>

        <section className="bg-[var(--background)] px-4 py-16 sm:px-6 sm:py-20">
          <div className="mx-auto max-w-3xl space-y-6">
            <h2 className="text-2xl font-bold tracking-tight text-[var(--primary)] sm:text-3xl">
              O que o quadro cobre
            </h2>
            <ul className="space-y-3 text-[15px] leading-relaxed text-[var(--muted-foreground)]">
              <li>
                <strong className="text-[var(--foreground)]">Compras</strong> —
                cards agrupados por fornecedor, com SKUs em ruptura e quantidade
                sugerida. Arraste para avançar a etapa de compra.
              </li>
              <li>
                <strong className="text-[var(--foreground)]">
                  Operações Full
                </strong>{" "}
                — cada anúncio que precisa de envio: agendar, coletar, sumir do
                quadro quando o estoque ML sobe.
              </li>
              <li>
                <strong className="text-[var(--foreground)]">Aparência</strong>{" "}
                — padrão, uma cor ou colorida por etapa; faixa, cabeçalho ou
                coluna inteira. Tela cheia no estilo Trello.
              </li>
              <li>
                <strong className="text-[var(--foreground)]">
                  Margem no mesmo painel
                </strong>{" "}
                — o kanban não substitui a{" "}
                <Link
                  href="/margem-de-contribuicao-mercado-livre"
                  className="text-[var(--primary)] underline underline-offset-2"
                >
                  lucratividade por anúncio
                </Link>
                : ele faz o pedido sair quando o número já mostrou que vale a
                pena repor.
              </li>
            </ul>
          </div>
        </section>

        <section className="bg-gradient-to-br from-[#1b2d6f] to-[#0f1a45] px-4 py-16 text-center text-white sm:px-6">
          <div className="mx-auto max-w-xl">
            <Columns3 className="mx-auto size-8 text-cyan-300" aria-hidden />
            <h2 className="mt-4 text-2xl font-bold sm:text-3xl">
              Veja o kanban da sua loja de verdade.
            </h2>
            <p className="mt-3 text-white/75">
              Conecte a conta do Mercado Livre — os cards nascem do estoque e do
              giro, não de uma planilha colada.
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
