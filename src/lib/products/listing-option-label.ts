/**
 * Rótulos das opções de venda (Clássico, Premium…), puros: servem ao
 * servidor e ao navegador.
 */

/** O mínimo de uma opção de venda para o rótulo (vem de `ListingOption`). */
export type ListingOptionChip = {
  mlItemId: string;
  listingTypeId: string | null;
  catalogListing?: boolean | null;
  registered?: boolean;
  isPrincipal?: boolean;
};

const LISTING_TYPE_LABELS: Record<string, string> = {
  gold_special: "Clássico",
  gold_pro: "Premium",
  free: "Grátis",
};

export function listingTypeName(listingTypeId: string | null | undefined): string {
  return (listingTypeId && LISTING_TYPE_LABELS[listingTypeId]) || listingTypeId || "Anúncio";
}

/** "Clássico", "Premium"… e Catálogo/Próprio só quando as opções diferem nisso. */
export function listingOptionLabel(
  option: ListingOptionChip,
  options: readonly ListingOptionChip[],
): string {
  const type = listingTypeName(option.listingTypeId);
  const catalogValues = new Set(options.map((o) => o.catalogListing ?? null));
  if (catalogValues.size <= 1 || option.catalogListing == null) return type;
  return `${type} · ${option.catalogListing ? "Catálogo" : "Próprio"}`;
}

/** "Clássico + Premium" — resumo das opções de um produto. */
export function listingOptionsSummary(options: readonly ListingOptionChip[]): string {
  return options.map((option) => listingOptionLabel(option, options)).join(" + ");
}
