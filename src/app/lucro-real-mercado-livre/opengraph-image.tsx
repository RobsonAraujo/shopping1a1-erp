import {
  OG_CONTENT_TYPE,
  OG_SIZE,
  renderOgImage,
} from "@/lib/marketing/og";

export const alt = "ERP 1a1 — apuração de Lucro Real por SKU para vendedores do Mercado Livre";
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

export default function Image() {
  return renderOgImage({
    eyebrow: "Tributário · Lucro Real",
    title: "Lucro Real de verdade: débito e crédito, venda a venda",
    lead: "PIS/COFINS não cumulativo, ICMS e DIFAL apurados por SKU, com memória de cálculo aberta.",
  });
}
