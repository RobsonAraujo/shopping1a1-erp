import type { LucideIcon } from "lucide-react";
import {
  Copy,
  Gauge,
  Hourglass,
  Megaphone,
  Percent,
  ShieldAlert,
  Tag,
  TrendingDown,
  Users,
} from "lucide-react";
import type { RotinaRuleKey } from "@/lib/rotina/rule-registry";
import { STATUS_PILL_CLASS, type StatusTone } from "@/lib/ui/tone";

/**
 * Cor só onde ela diz algo: catálogo **perdendo** é vermelho, **dividindo** o
 * 1º lugar é amarelo (o mesmo vermelho/amarelo de estado do produto, de
 * `STATUS_PILL_CLASS`). As outras tarefas ficam neutras — se tudo for colorido,
 * nada chama atenção.
 */
export type RuleVisual = {
  icon: LucideIcon;
  tone: Extract<StatusTone, "danger" | "warning" | "neutral">;
  /** Rótulo da pílula de estado no card (só regras com cor). */
  pill: string | null;
};

export const RULE_VISUALS: Record<RotinaRuleKey, RuleVisual> = {
  catalog_losing: { icon: TrendingDown, tone: "danger", pill: "Perdendo" },
  catalog_shared: { icon: Users, tone: "warning", pill: "Dividindo o 1º lugar" },
  promo_expiring: { icon: Hourglass, tone: "neutral", pill: null },
  catalog_takeover: { icon: Copy, tone: "neutral", pill: null },
  margin_below_min: { icon: Percent, tone: "neutral", pill: null },
  below_pma: { icon: ShieldAlert, tone: "neutral", pill: null },
  tacos_above: { icon: Gauge, tone: "neutral", pill: null },
  ads_missing: { icon: Megaphone, tone: "neutral", pill: null },
  promo_missing: { icon: Tag, tone: "neutral", pill: null },
};

/** Fundo + cor do ícone no cabeçalho do grupo. */
export const RULE_ICON_CLASS: Record<RuleVisual["tone"], string> = {
  danger: "bg-rose-50 text-rose-600",
  warning: "bg-amber-50 text-amber-600",
  neutral: "bg-[var(--muted)] text-[var(--muted-foreground)]",
};

/** Faixa à esquerda do card. */
export const RULE_ACCENT_CLASS: Record<RuleVisual["tone"], string> = {
  danger: "border-l-4 border-l-rose-500",
  warning: "border-l-4 border-l-amber-400",
  neutral: "",
};

/** Cor do número nas contagens do resumo. */
export const RULE_COUNT_CLASS: Record<RuleVisual["tone"], string> = {
  danger: "font-semibold text-rose-700",
  warning: "font-semibold text-amber-700",
  neutral: "",
};

export { STATUS_PILL_CLASS };
