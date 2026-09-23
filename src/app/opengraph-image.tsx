import {
  OG_CONTENT_TYPE,
  OG_SIZE,
  renderOgImage,
} from "@/lib/marketing/og";

export const alt = "ERP 1a1 — painel de lucratividade e DRE para vendedores do Mercado Livre";
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

export default function Image() {
  return renderOgImage({
    eyebrow: "Mercado Livre",
    title: "Descubra quanto sobra de cada venda",
    lead: "Margem por anúncio depois do ADS, apuração fiscal por SKU e DRE que fecha com a fatura.",
  });
}
