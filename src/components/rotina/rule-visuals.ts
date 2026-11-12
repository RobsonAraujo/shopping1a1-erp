import type { LucideIcon } from "lucide-react";
import {
  Copy,
  Gauge,
  Hourglass,
  LayoutList,
  Megaphone,
  Percent,
  ShieldAlert,
  Store,
  Tag,
  TrendingDown,
  Users,
} from "lucide-react";
import type { RotinaRuleKey, RotinaSegment } from "@/lib/rotina/rule-registry";
import {
  CATEGORY_BADGE_CLASS,
  CATEGORY_TEXT_CLASS,
  STATUS_PILL_CLASS,
  type CategoryTone,
  type StatusTone,
} from "@/lib/ui/tone";

/**
 * Duas famílias de cor, que não se misturam (ver `src/lib/ui/tone.ts`):
 *
 * - **Tema** (tom de categoria): a família da tarefa — catálogo, preço,
 *   promoção, ADS. Pinta o ícone do grupo, então todo grupo tem cor e a cor
 *   diz de que assunto ele é. Nunca quer dizer "bom" ou "ruim".
 * - **Estado** (`tone`): urgência, só dentro do card — catálogo **perdendo** é
 *   vermelho, **dividindo** o 1º lugar é amarelo (faixa lateral + pílula).
 */
export type RuleTheme = "catalog" | "price" | "promo" | "ads";

export type RuleVisual = {
  icon: LucideIcon;
  theme: RuleTheme;
  tone: Extract<StatusTone, "danger" | "warning" | "neutral">;
  /** Rótulo da pílula de estado no card (só regras com cor). */
  pill: string | null;
  /**
   * Explicação curta, menor, ao lado do nome do grupo — onde o nome da tarefa
   * sozinho não diz qual é a situação ("Brigar no catálogo" × "Ganhar sozinho").
   */
  taskHint: string | null;
};

/** Catálogo = violeta, a mesma cor da etiqueta "Catálogo" dos cards. */
const THEME_TONE: Record<RuleTheme, CategoryTone> = {
  catalog: "violet",
  price: "rose",
  promo: "amber",
  ads: "emerald",
};

export const RULE_VISUALS: Record<RotinaRuleKey, RuleVisual> = {
  catalog_losing: {
    icon: TrendingDown,
    theme: "catalog",
    tone: "danger",
    pill: "Perdendo",
    taskHint: "anúncios perdendo",
  },
  catalog_shared: {
    icon: Users,
    theme: "catalog",
    tone: "warning",
    pill: "Dividindo o 1º lugar",
    taskHint: "anúncios dividindo o 1º lugar",
  },
  catalog_takeover: { icon: Copy, theme: "catalog", tone: "neutral", pill: null, taskHint: null },
  promo_expiring: { icon: Hourglass, theme: "promo", tone: "neutral", pill: null, taskHint: null },
  promo_missing: { icon: Tag, theme: "promo", tone: "neutral", pill: null, taskHint: null },
  margin_below_min: { icon: Percent, theme: "price", tone: "neutral", pill: null, taskHint: null },
  below_pma: { icon: ShieldAlert, theme: "price", tone: "neutral", pill: null, taskHint: null },
  tacos_above: { icon: Gauge, theme: "ads", tone: "neutral", pill: null, taskHint: null },
  ads_missing: { icon: Megaphone, theme: "ads", tone: "neutral", pill: null, taskHint: null },
};

export const RULE_THEME_LABEL: Record<RuleTheme, string> = {
  catalog: "Catálogo",
  price: "Preço e margem",
  promo: "Promoção",
  ads: "ADS",
};

/** Cor do título do tema na lista do dia. */
export function themeTextClass(theme: RuleTheme): string {
  return CATEGORY_TEXT_CLASS[THEME_TONE[theme]];
}

/** Fundo + cor do ícone da tarefa (cabeçalho do grupo, lista de Metas): o tema. */
export function ruleIconClass(rule: RotinaRuleKey): string {
  return CATEGORY_BADGE_CLASS[THEME_TONE[RULE_VISUALS[rule].theme]];
}

/** Faixa à esquerda do card. */
export const RULE_ACCENT_CLASS: Record<RuleVisual["tone"], string> = {
  danger: "border-l-4 border-l-rose-500",
  warning: "border-l-4 border-l-amber-400",
  neutral: "",
};

/**
 * Próprio × Catálogo é **categoria** (nomeia o tipo de anúncio), não estado:
 * por isso o tom de categoria de `tone.ts`, nunca vermelho/amarelo/verde.
 */
export const SEGMENT_VISUALS: Record<
  RotinaSegment,
  { label: string; icon: LucideIcon; className: string }
> = {
  own: { label: "Próprio", icon: Store, className: CATEGORY_BADGE_CLASS.primary },
  catalog: { label: "Catálogo", icon: LayoutList, className: CATEGORY_BADGE_CLASS.violet },
};

export { STATUS_PILL_CLASS };
