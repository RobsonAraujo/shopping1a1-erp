import type { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import {
  getSessionAccessState,
  refreshSessionPath,
} from "@/lib/mercadolibre/session";
import { MarketingLanding } from "@/components/marketing/Landing";

export const metadata: Metadata = {
  title: "Painel para vendedores Mercado Livre — margem, imposto e DRE",
  description:
    "Lucratividade (margem e pós ADS), apuração de lucro real, catálogo, DRE com sync da fatura, Full e compras. Teste grátis com sua conta do Mercado Livre.",
  openGraph: {
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
  const session = getSessionAccessState(cookieStore);
  const dashboardHref = session.needsRefresh
    ? refreshSessionPath("/dashboard")
    : "/dashboard";

  return (
    <MarketingLanding
      isLoggedIn={session.isLoggedIn}
      dashboardHref={dashboardHref}
      error={sp.error}
    />
  );
}
