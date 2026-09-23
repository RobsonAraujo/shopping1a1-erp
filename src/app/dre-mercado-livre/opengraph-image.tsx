import {
  OG_CONTENT_TYPE,
  OG_SIZE,
  renderOgImage,
} from "@/lib/marketing/og";

export const alt = "ERP 1a1 — DRE mensal automático para vendedores do Mercado Livre";
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

export default function Image() {
  return renderOgImage({
    eyebrow: "DRE · Financeiro",
    title: "O DRE da sua loja, sem exportar planilha",
    lead: "Receita, tarifa ML, CMV, imposto e ADS fecham sozinhos com a fatura do Mercado Livre.",
  });
}
