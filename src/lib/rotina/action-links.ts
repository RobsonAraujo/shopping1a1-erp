import {
  catalogCompetitionUrl,
  productAdsCampaignsUrl,
  sellerListingModifyUrl,
  sellerPromotionsUrl,
} from "@/lib/mercadolibre/seller-listing-url";
import type { RotinaRuleKey } from "@/lib/rotina/rule-registry";

/**
 * Para onde cada tarefa leva: o botão do card abre a tela do ML onde a ação é
 * feita (promoções, editor de preço, Product Ads), não a página pública do
 * anúncio — essa fica no menu ⋯.
 */

export type ActionLink = { label: string; href: string };

export type ActionLinks = { primary: ActionLink; extra: ActionLink[] };

export function buildActionLinks(args: {
  rule: RotinaRuleKey;
  mlItemId: string;
  catalogListing: boolean;
  catalogProductId: string | null;
  /** Catálogo ligado (só no "ML criou catálogo do seu anúncio"). */
  related: { mlItemId: string; catalogProductId: string | null } | null;
}): ActionLinks {
  const competition = (productId: string | null): ActionLink[] =>
    productId ? [{ label: "Ver concorrência", href: catalogCompetitionUrl(productId) }] : [];
  const editPrice: ActionLink = {
    label: "Editar preço",
    href: sellerListingModifyUrl(args.mlItemId),
  };

  switch (args.rule) {
    case "catalog_losing":
    case "catalog_shared":
      return { primary: editPrice, extra: competition(args.catalogProductId) };
    case "margin_below_min":
    case "below_pma":
      return {
        primary: editPrice,
        extra: args.catalogListing ? competition(args.catalogProductId) : [],
      };
    case "promo_missing":
    case "promo_expiring":
      return { primary: { label: "Abrir promoções", href: sellerPromotionsUrl() }, extra: [] };
    case "ads_missing":
    case "tacos_above":
      return {
        primary: { label: "Abrir Product Ads", href: productAdsCampaignsUrl() },
        extra: [],
      };
    case "catalog_takeover":
      if (!args.related) return { primary: editPrice, extra: [] };
      return {
        primary: {
          label: "Editar o catálogo",
          href: sellerListingModifyUrl(args.related.mlItemId),
        },
        extra: competition(args.related.catalogProductId),
      };
  }
}
