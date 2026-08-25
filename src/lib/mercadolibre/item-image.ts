import type { ItemBody } from "@/lib/mercadolibre/types";

/**
 * URL da melhor imagem disponível no payload do item (API ML).
 * `thumbnail` é miniatura; `pictures[].secure_url` costuma ser a foto principal
 * em resolução maior (HTTPS).
 */
export function bestItemImageUrl(item: ItemBody): string | undefined {
  const first = item.pictures?.[0];
  if (first?.secure_url) return first.secure_url;
  if (first?.url) return first.url;
  if (item.secure_thumbnail) return item.secure_thumbnail;
  return item.thumbnail;
}

/**
 * Troca o sufixo de tamanho da ML (-O/-F/-G/-D/-2X) por -I (~500px).
 * Thumbs de tabela não precisam da original; o optimizer do next/image ainda
 * reduz para o `sizes` da coluna.
 */
export function toMlListingThumbnailUrl(url: string): string {
  try {
    const hostname = new URL(url).hostname;
    if (!hostname.endsWith("mlstatic.com")) return url;
  } catch {
    return url;
  }
  return url.replace(/-(O|F|G|D|2X)(\.(?:jpe?g|webp|png))(?=$|\?)/i, "-I$2");
}
