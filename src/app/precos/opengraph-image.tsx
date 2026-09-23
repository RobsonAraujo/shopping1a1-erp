import {
  OG_CONTENT_TYPE,
  OG_SIZE,
  renderOgImage,
} from "@/lib/marketing/og";

export const alt = "ERP 1a1 — grátis durante o beta, sem cartão de crédito";
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

export default function Image() {
  return renderOgImage({
    eyebrow: "Preços",
    title: "Grátis durante o beta. Sem cartão, sem pegadinha.",
    lead: "Painel completo liberado. Quando houver plano pago, você é avisado com antecedência.",
  });
}
