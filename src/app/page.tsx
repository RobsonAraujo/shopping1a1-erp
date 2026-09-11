import type { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getMarketingCtaState } from "@/lib/mercadolibre/session";
import { siteUrl } from "@/lib/infra/site-url";
import { MarketingLanding } from "@/components/marketing/Landing";
import { faqStructuredData } from "@/components/marketing/Faq";

const title = "Painel para vendedores Mercado Livre — margem, imposto e DRE";
const description =
  "Lucratividade (margem e pós ADS), apuração de lucro real, catálogo, DRE com sync da fatura e kanban de compras e Full. Teste grátis com sua conta do Mercado Livre.";

export const metadata: Metadata = {
  title,
  description,
  alternates: {
    canonical: siteUrl(),
  },
  openGraph: {
    type: "website",
    url: siteUrl(),
    siteName: "ERP 1a1",
    locale: "pt_BR",
    title: "ERP 1a1 — lucratividade e lucro real no Mercado Livre",
    description:
      "Veja se cada anúncio sobra depois da tarifa ML e do imposto. Apuração pensada para lucro real. Teste grátis, sem cartão.",
    images: ["/logo-bg-blue.png"],
  },
  twitter: {
    card: "summary_large_image",
    title: "ERP 1a1 — lucratividade e lucro real no Mercado Livre",
    description:
      "Veja se cada anúncio sobra depois da tarifa ML e do imposto. Apuração pensada para lucro real. Teste grátis, sem cartão.",
    images: ["/logo-bg-blue.png"],
  },
};

type PageProps = {
  searchParams: Promise<{
    error?: string;
    code?: string;
    state?: string;
  }>;
};

export default async function Home({ searchParams }: PageProps) {
  const sp = await searchParams;

  const code = sp.code;
  const state = sp.state;
  if (code && state && !sp.error) {
    const q = new URLSearchParams({ code, state });
    redirect(`/api/auth/mercadolibre/callback?${q.toString()}`);
  }

  const cookieStore = await cookies();
  const { isLoggedIn, dashboardHref } = getMarketingCtaState(cookieStore);

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqStructuredData()) }}
      />
      <MarketingLanding
        isLoggedIn={isLoggedIn}
        dashboardHref={dashboardHref}
        error={sp.error}
      />
    </>
  );
}
