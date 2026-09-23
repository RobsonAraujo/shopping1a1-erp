import {
  OG_CONTENT_TYPE,
  OG_SIZE,
  renderOgImage,
} from "@/lib/marketing/og";

export const alt = "ERP 1a1 — alíquota efetiva do DAS para vendedores do Mercado Livre no Simples Nacional";
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

export default function Image() {
  return renderOgImage({
    eyebrow: "Simples Nacional",
    title: "O DAS entrando na margem, não só no fechamento",
    lead: "RBT12, faixa do Anexo I e alíquota efetiva usados na precificação de cada anúncio.",
  });
}
