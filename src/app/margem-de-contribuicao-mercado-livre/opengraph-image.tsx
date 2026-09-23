import {
  OG_CONTENT_TYPE,
  OG_SIZE,
  renderOgImage,
} from "@/lib/marketing/og";

export const alt = "ERP 1a1 — margem de contribuição por anúncio no Mercado Livre";
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

export default function Image() {
  return renderOgImage({
    eyebrow: "Lucratividade",
    title: "Margem de contribuição de cada anúncio",
    lead: "Preço, tarifa, custo e Product Ads na mesma conta — verde quando sobra, vermelho quando não.",
  });
}
