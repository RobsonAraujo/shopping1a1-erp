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
