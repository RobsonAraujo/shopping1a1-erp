/** Editor oficial do anúncio no painel do vendedor (SYI). */
export function sellerListingModifyUrl(mlItemId: string): string {
  const url = new URL("https://www.mercadolivre.com.br/syi/core/modify");
  url.searchParams.set("itemId", mlItemId);
  return url.toString();
}

/** Lista de promoções dos anúncios no painel do vendedor. */
export function sellerPromotionsUrl(): string {
  return "https://vendedores.mercadolivre.com.br/anuncios/lista/promos#from=seller-menu";
}

/**
 * Campanhas de Product Ads no painel do vendedor. Sem `advertiser_id` /
 * `account_id`: são da conta de cada organização, e a sessão do ML já sabe
 * qual é a de quem está logado.
 */
export function productAdsCampaignsUrl(): string {
  const url = new URL(
    "https://vendedores.mercadolivre.com.br/publicidade/product-ads/admin/campaigns",
  );
  url.searchParams.set("navigate_to", "seller_central");
  return url.toString();
}

/** Página de concorrência ("outras opções de compra") de um produto de catálogo. */
export function catalogCompetitionUrl(catalogProductId: string): string {
  return `https://www.mercadolivre.com.br/p/${encodeURIComponent(catalogProductId)}/s`;
}
