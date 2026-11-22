import type { Metadata } from "next";
import { cookies } from "next/headers";
import { BetaLanding } from "@/components/marketing/BetaLanding";
import { getMarketingCtaState } from "@/lib/mercadolibre/session";
import {
  BETA_OFFER,
  isOfferActive,
  offerDeadlineLabel,
} from "@/lib/marketing/campaign-offer";

/**
 * Página de campanha do Google Ads. Fora do índice e do sitemap: é destino de
 * anúncio, não conteúdo de busca (e repetiria a landing para o Google).
 */
export const metadata: Metadata = {
  title: `Quais anúncios dão lucro? ${BETA_OFFER.trialDays} dias grátis`,
  description:
    "Descubra quanto sobra de cada venda no Mercado Livre depois da tarifa, do frete, do imposto e do Product Ads. Conecte até 30/11 e use a Maipo por 30 dias grátis, garantido.",
  robots: { index: false, follow: false },
};

/** Renderiza por visita (lê cookies): o prazo e o contador ficam sempre certos. */
export default async function BetaPage() {
  const { isLoggedIn, dashboardHref } = getMarketingCtaState(await cookies());
  const now = new Date();

  return (
    <BetaLanding
      isLoggedIn={isLoggedIn}
      dashboardHref={dashboardHref}
      offerActive={isOfferActive(now)}
      serverNowMs={now.getTime()}
      deadlineLabel={offerDeadlineLabel()}
    />
  );
}
