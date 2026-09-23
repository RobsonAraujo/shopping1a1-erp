import {
  OG_CONTENT_TYPE,
  OG_SIZE,
  renderOgImage,
} from "@/lib/marketing/og";

export const alt = "ERP 1a1 — kanban de compras e Full para vendedores do Mercado Livre";
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

export default function Image() {
  return renderOgImage({
    eyebrow: "Operação · Kanban",
    title: "Compras e Full num quadro só, estilo Trello",
    lead: "O card nasce do giro real da loja, antes do estoque zerar — compartilhado com a equipe.",
  });
}
