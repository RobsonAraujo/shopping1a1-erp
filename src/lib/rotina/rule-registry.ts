/**
 * Registro das regras da Rotina — só metadado (nada de Prisma, nada de ML):
 * é importado por RSC, route handler, componente client e teste.
 *
 * A ordem de `ROTINA_RULE_KEYS` é a ordem dos grupos na lista do dia, do mais
 * urgente para o mais rotineiro.
 */
export const ROTINA_RULE_KEYS = [
  "catalog_losing",
  "promo_expiring",
  "catalog_takeover",
  "margin_below_min",
  "below_pma",
  "tacos_above",
  "catalog_shared",
  "catalog_raise_price",
  "ads_missing",
  "promo_missing",
] as const;

export type RotinaRuleKey = (typeof ROTINA_RULE_KEYS)[number];

export type RotinaSegment = "own" | "catalog";

/**
 * `condition`: vale enquanto a condição existe e some sozinha quando ela some.
 * `event`: aconteceu uma vez (ex.: catálogo novo ligado ao próprio) — só sai da
 * lista com "Ciente".
 */
export type RotinaRuleKind = "condition" | "event";

/**
 * `refresh`: avaliada sobre o retrato da última rodada (`ListingHealth`).
 * `catalog`: avaliada ao vivo sobre `Listing.catalogStatus`, que o cron de
 * catálogo atualiza — não depende do "Atualizar".
 */
export type RotinaRuleSource = "refresh" | "catalog";

export type RotinaRuleDefinition = {
  key: RotinaRuleKey;
  kind: RotinaRuleKind;
  source: RotinaRuleSource;
  segments: readonly RotinaSegment[];
  /** Título do grupo na lista do dia: a tarefa. */
  taskLabel: string;
  /** Rótulo curto para contagens ("2 perdendo · 1 sem ADS"). */
  shortLabel: string;
  /** Rótulo do interruptor em Metas. */
  settingsLabel: string;
  settingsHint: string;
};

export const ROTINA_RULES: Record<RotinaRuleKey, RotinaRuleDefinition> = {
  catalog_losing: {
    key: "catalog_losing",
    kind: "condition",
    source: "catalog",
    segments: ["catalog"],
    taskLabel: "Brigar no catálogo",
    shortLabel: "perdendo",
    settingsLabel: "Catálogo perdendo",
    settingsHint: "Anúncio de catálogo que não está ganhando a vitrine.",
  },
  promo_expiring: {
    key: "promo_expiring",
    kind: "condition",
    source: "refresh",
    segments: ["own"],
    taskLabel: "Renovar promoção",
    shortLabel: "promoção vencendo",
    settingsLabel: "Promoção vencendo",
    settingsHint:
      "Promoção ativa que termina nos próximos dias (prazo em Configurações > Planejamento).",
  },
  catalog_takeover: {
    key: "catalog_takeover",
    kind: "event",
    source: "refresh",
    segments: ["own"],
    taskLabel: "O ML criou catálogo do seu anúncio",
    shortLabel: "catálogo novo do ML",
    settingsLabel: "Catálogo novo ligado a um próprio",
    settingsHint:
      "Apareceu um anúncio de catálogo ligado a um anúncio próprio seu: as vendas tendem a migrar para ele.",
  },
  margin_below_min: {
    key: "margin_below_min",
    kind: "condition",
    source: "refresh",
    segments: ["own", "catalog"],
    taskLabel: "Ajustar margem",
    shortLabel: "margem baixa",
    settingsLabel: "Margem abaixo do mínimo",
    settingsHint:
      "Margem após ADS, no preço de hoje, abaixo do mínimo do segmento (ou do anúncio).",
  },
  below_pma: {
    key: "below_pma",
    kind: "condition",
    source: "refresh",
    segments: ["own", "catalog"],
    taskLabel: "Subir para o PMA",
    shortLabel: "abaixo do PMA",
    settingsLabel: "Abaixo do PMA",
    settingsHint: "Preço de hoje abaixo do PMA cadastrado em Meus produtos.",
  },
  tacos_above: {
    key: "tacos_above",
    kind: "condition",
    source: "refresh",
    segments: ["own"],
    taskLabel: "Revisar ADS",
    shortLabel: "TACOS alto",
    settingsLabel: "TACOS acima da meta",
    settingsHint:
      "TACOS dos últimos 7 dias acima da meta, ou gasto em ADS sem venda.",
  },
  catalog_shared: {
    key: "catalog_shared",
    kind: "condition",
    source: "catalog",
    segments: ["catalog"],
    taskLabel: "Ganhar sozinho no catálogo",
    shortLabel: "dividindo o 1º lugar",
    settingsLabel: "Catálogo dividindo o 1º lugar",
    settingsHint:
      "Você divide a vitrine com outro vendedor; às vezes uns centavos resolvem.",
  },
  catalog_raise_price: {
    key: "catalog_raise_price",
    kind: "condition",
    source: "catalog",
    segments: ["catalog"],
    taskLabel: "Subir preço no catálogo",
    shortLabel: "pode subir",
    settingsLabel: "Catálogo ganhando com folga para subir",
    settingsHint:
      "Ganhando sozinho e o concorrente mais barato bem acima: estimativa de até onde dá para subir e continuar ganhando (ou dividir).",
  },
  ads_missing: {
    key: "ads_missing",
    kind: "condition",
    source: "refresh",
    segments: ["own"],
    taskLabel: "Ativar ADS",
    shortLabel: "sem ADS",
    settingsLabel: "Sem ADS ativo",
    settingsHint: "Anúncio próprio sem campanha de Product Ads ativa.",
  },
  promo_missing: {
    key: "promo_missing",
    kind: "condition",
    source: "refresh",
    segments: ["own"],
    taskLabel: "Colocar promoção",
    shortLabel: "sem promoção",
    settingsLabel: "Sem promoção",
    settingsHint: "Anúncio próprio ativo sem nenhuma promoção.",
  },
};

export function isRotinaRuleKey(value: string): value is RotinaRuleKey {
  return (ROTINA_RULE_KEYS as readonly string[]).includes(value);
}

/** Regras de condição avaliadas na rodada — as que a reconciliação acompanha. */
export const REFRESH_CONDITION_RULES: readonly RotinaRuleKey[] =
  ROTINA_RULE_KEYS.filter(
    (key) =>
      ROTINA_RULES[key].source === "refresh" &&
      ROTINA_RULES[key].kind === "condition",
  );
