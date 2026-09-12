/** Editor oficial do anúncio no painel do vendedor (SYI). */
export function sellerListingModifyUrl(mlItemId: string): string {
  const url = new URL("https://www.mercadolivre.com.br/syi/core/modify");
  url.searchParams.set("itemId", mlItemId);
  return url.toString();
}
