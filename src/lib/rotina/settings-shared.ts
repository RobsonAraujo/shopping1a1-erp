import { rotinaConfig } from "@/config/rotina";
import {
  ROTINA_RULE_KEYS,
  isRotinaRuleKey,
  type RotinaRuleKey,
} from "@/lib/rotina/rule-registry";

/**
 * Metas da Rotina, já com os defaults aplicados. Sem dependência de servidor —
 * a sheet de Metas (client) usa os mesmos limites e defaults.
 */
export type RotinaSettings = {
  /** Margem mínima após ADS (%) dos próprios — também é a meta do preço mínimo. */
  ownMinMarginPercent: number;
  /** Margem mínima após ADS (%) do catálogo. */
  catalogMinMarginPercent: number;
  /** TACOS meta (%) dos próprios. */
  ownTacosTargetPercent: number;
  /** Folga (%) abaixo do concorrente mais barato no teto de "ganhar sozinho". */
  catalogRaiseCushionPercent: number;
  /** Alta mínima (%) para "Subir preço no catálogo" virar tarefa. */
  catalogRaiseMinPercent: number;
  disabledRules: RotinaRuleKey[];
  /** De Configurações > Planejamento — o mesmo prazo do widget Promoções da Home. */
  promotionExpiringSoonDays: number;
  /**
   * Dias de vendas que o Atualizar lê por anúncio (Metas): limite do "Sem
   * venda em N dias" e base das vendas/dia da Rotina. Solto da janela de
   * Planejamento, que é a de Estoque/Compras/Full.
   */
  salesWindowDays: RotinaSalesWindowDays;
  /** `false` enquanto a organização nunca salvou nenhuma meta da Rotina. */
  configured: boolean;
};

/** Margem mínima pode ser levemente negativa: há quem aceite perder um pouco para segurar a vitrine. */
export const ROTINA_MARGIN_LIMITS = { min: -20, max: 100 } as const;
export const ROTINA_TACOS_LIMITS = { min: 0, max: 100 } as const;
export const ROTINA_RAISE_CUSHION_LIMITS = { min: 0, max: 20 } as const;
export const ROTINA_RAISE_MIN_LIMITS = { min: 0, max: 50 } as const;

/** Opções de dias de vendas lidos no Atualizar. Mais dias = mais pedidos lidos por anúncio. */
export const ROTINA_SALES_WINDOW_OPTIONS = [7, 14, 30, 60] as const;
export type RotinaSalesWindowDays = (typeof ROTINA_SALES_WINDOW_OPTIONS)[number];

export function isRotinaSalesWindowDays(value: unknown): value is RotinaSalesWindowDays {
  return ROTINA_SALES_WINDOW_OPTIONS.some((option) => option === value);
}

export const ROTINA_SETTINGS_DEFAULTS = {
  ownMinMarginPercent: rotinaConfig.ownMinMarginPercent,
  catalogMinMarginPercent: rotinaConfig.catalogMinMarginPercent,
  ownTacosTargetPercent: rotinaConfig.ownTacosTargetPercent,
  catalogRaiseCushionPercent: rotinaConfig.catalogRaiseCushionPercent,
  catalogRaiseMinPercent: rotinaConfig.catalogRaiseMinPercent,
  salesWindowDays: rotinaConfig.salesWindowDays,
} as const;

/** Só chaves conhecidas, sem repetição, na ordem do registro. */
export function normalizeDisabledRules(
  values: readonly string[] | null | undefined,
): RotinaRuleKey[] {
  if (!values || values.length === 0) return [];
  const wanted = new Set(values.filter(isRotinaRuleKey));
  return ROTINA_RULE_KEYS.filter((key) => wanted.has(key));
}

export function isRuleEnabled(
  settings: Pick<RotinaSettings, "disabledRules">,
  rule: RotinaRuleKey,
): boolean {
  return !settings.disabledRules.includes(rule);
}
