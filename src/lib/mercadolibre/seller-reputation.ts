import type { SellerReputation } from "@/lib/mercadolibre/types";

export type SellerReputationBadge = {
  label: string;
  variant: "success" | "warning" | "destructive";
};

const POWER_SELLER_LABELS: Record<string, string> = {
  platinum: "Platinum",
  gold: "Gold",
  silver: "Silver",
};

const LEVEL_COLOR_BADGES: Record<string, SellerReputationBadge> = {
  "5_green": { label: "Reputação verde", variant: "success" },
  "4_light_green": { label: "Reputação verde", variant: "success" },
  "3_yellow": { label: "Reputação amarela", variant: "warning" },
  "2_orange": { label: "Reputação laranja", variant: "warning" },
  "1_red": { label: "Reputação vermelha", variant: "destructive" },
};

/** Badge de reputação (MercadoLíder Platinum/Gold/Silver, ou cor do termômetro). */
export function buildSellerReputationBadge(
  reputation?: SellerReputation | null,
): SellerReputationBadge | null {
  if (!reputation) return null;

  const status = reputation.power_seller_status;
  if (status) {
    const label = POWER_SELLER_LABELS[status] ?? status;
    return { label: `MercadoLíder ${label}`, variant: "success" };
  }

  const levelId = reputation.level_id;
  if (levelId && LEVEL_COLOR_BADGES[levelId]) {
    return LEVEL_COLOR_BADGES[levelId];
  }

  return null;
}
