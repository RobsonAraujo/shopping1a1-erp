/** URL do anúncio para o comprador, sem filtros de PDP. */
export function buyerFacingItemPermalink(
  permalink: string,
  mlItemId: string,
): string {
  try {
    const url = new URL(permalink);
    url.searchParams.delete("pdp_filters");
    return url.toString();
  } catch {
    const site = mlItemId.match(/^([A-Z]{3})/i)?.[1]?.toLowerCase() ?? "mlb";
    return `https://produto.mercadolivre.com.br/${site}-${mlItemId.replace(/^[A-Z]{3}/i, "")}`;
  }
}
