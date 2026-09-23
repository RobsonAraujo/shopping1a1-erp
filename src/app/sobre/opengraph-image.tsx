import {
  OG_CONTENT_TYPE,
  OG_SIZE,
  renderOgImage,
} from "@/lib/marketing/og";

export const alt = "Sobre o ERP 1a1 — princípios do painel para vendedores do Mercado Livre";
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

export default function Image() {
  return renderOgImage({
    eyebrow: "Sobre",
    title: "O painel que a gente queria ter para fechar o mês",
    lead: "Nenhum número sem origem, o dado vindo da fonte e clareza sobre o que não fazemos.",
  });
}
