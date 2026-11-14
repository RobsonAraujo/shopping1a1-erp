import { rotinaConfig } from "@/config/rotina";
import {
  MARGIN_EXCLUSION_LABEL,
  type MarginExclusionReason,
} from "@/lib/lucratividade/margin-summary";
import { buyerFacingItemPermalink } from "@/lib/mercadolibre/item-permalink";
import { buildActionLinks, type ActionLinks } from "@/lib/rotina/action-links";
import {
  catalogRaiseQualifies,
  type CatalogRaiseEstimate,
} from "@/lib/rotina/catalog-raise";
import { roundMoney } from "@/lib/pricing/financial-margin";
import {
  buildFloorView,
  catalogVerdict,
  type RotinaFloorView,
} from "@/lib/rotina/floor-view";
import {
  formatClock,
  formatDaysUntil,
  formatMoney,
  formatPercent,
  formatShortDate,
  formatSince,
  formatTodayLabel,
  formatUnitsRate,
  formatWhen,
} from "@/lib/rotina/format";
import {
  REFRESH_CONDITION_RULES,
  ROTINA_RULE_KEYS,
  ROTINA_RULES,
  type RotinaRuleKey,
  type RotinaRuleKind,
  type RotinaSegment,
} from "@/lib/rotina/rule-registry";
import {
  catalogRaiseFor,
  effectiveMinMarginPercent,
  effectiveTacosTargetPercent,
  evaluateCatalogRules,
  evaluateRefreshRules,
  listingPromotionCoverage,
  marginForRules,
  promotionDaysLeft,
} from "@/lib/rotina/rules";
import { stateKey } from "@/lib/rotina/reconcile";
import { isRuleEnabled, type RotinaSettings } from "@/lib/rotina/settings-shared";
import { isoIsToday, localDayDiff } from "@/lib/rotina/time";
import type {
  ActionStateSnapshot,
  ListingTargetValues,
  RotinaCatalogLive,
  RotinaFloorBand,
  RotinaListingSnapshot,
  RotinaRunSummary,
  CatalogLiveStatus,
} from "@/lib/rotina/types";
import {
  resolveActionVisibility,
  type ActionBucket,
} from "@/lib/rotina/visibility";

/**
 * Monta a página da Rotina a partir do que já está no banco. Puro: recebe o
 * retrato da última rodada, o catálogo ao vivo, metas e estados, e devolve as
 * ações prontas para exibir (frases, piso, veredito, ordem). Nenhuma chamada ao
 * Mercado Livre — abrir a página é barato.
 */

export type CatalogVerdictView = { tone: "ok" | "bad" | "neutral"; text: string };

/**
 * Meta de um anúncio para o formulário "Meta deste anúncio": a exceção gravada
 * (null = usa o padrão) e o padrão do segmento, que vira o placeholder.
 */
export type RotinaListingTargetView = {
  own: { minMarginPercent: number | null; tacosTargetPercent: number | null };
  defaults: { minMarginPercent: number; tacosTargetPercent: number };
};

function listingTargetView(
  catalogListing: boolean,
  settings: RotinaSettings,
  target: ListingTargetValues | null,
): RotinaListingTargetView {
  return {
    own: {
      minMarginPercent: target?.minMarginPercent ?? null,
      tacosTargetPercent: target?.tacosTargetPercent ?? null,
    },
    defaults: {
      minMarginPercent: effectiveMinMarginPercent(catalogListing, settings, null),
      tacosTargetPercent: effectiveTacosTargetPercent(settings, null),
    },
  };
}

export type RotinaActionListing = {
  mlItemId: string;
  title: string;
  sku: string | null;
  imageUrl: string | null;
  permalink: string;
  catalogListing: boolean;
  /** Clássico/Premium (`null` sem retrato ou em retrato antigo). */
  listingTypeId: string | null;
  salePrice: number | null;
  unitsPerDay: number | null;
  marginPercent: number | null;
  marginAfterAdsPercent: number | null;
  minMarginPercent: number;
  minMarginOverridden: boolean;
  tacosTargetPercent: number;
  tacosOverridden: boolean;
  target: RotinaListingTargetView;
  /** PMA cadastrado em Meus produtos — o limite antes de mexer no preço. */
  pmaPrice: number | null;
  /**
   * TACOS da janela de ADS, só com ADS ativo ou pausado: sem ADS a rodada grava
   * 0, e "TACOS 0%" passaria a ideia errada.
   */
  tacosPercent: number | null;
  adsPeriodDays: number | null;
  catalogProductId: string | null;
  /** Tem retrato da rodada (dá para "recalcular este anúncio"). */
  hasHealth: boolean;
};

export type RotinaRelatedListing = {
  mlItemId: string;
  title: string;
  permalink: string;
  unitsPerDay: number | null;
};

export type RotinaActionView = {
  /** `${rule}:${mlItemId do estado}` — estável entre carregamentos. */
  id: string;
  rule: RotinaRuleKey;
  kind: RotinaRuleKind;
  segment: RotinaSegment;
  /** `mlItemId` da linha de estado (no vínculo de catálogo: o catálogo). */
  stateItemId: string;
  bucket: ActionBucket;
  doneToday: boolean;
  continues: boolean;
  isNew: boolean;
  ageLabel: string | null;
  listing: RotinaActionListing;
  headline: string;
  details: string[];
  floor: RotinaFloorView | null;
  verdict: CatalogVerdictView | null;
  related: RotinaRelatedListing | null;
  /** Estado de catálogo ao vivo, quando o anúncio é de catálogo. */
  catalog: {
    status: CatalogLiveStatus | null;
    priceToWin: number | null;
    sellerPrice: number | null;
    /** Preço sugerido para ganhar sem furar o mínimo (abaixo de uma faixa proibida). */
    suggestedPrice: number | null;
    /** "Subir preço no catálogo": estimativa de até onde dá para subir. */
    raise: CatalogRaiseEstimate | null;
  } | null;
  /** Painel "Até onde dá para subir" do card de subida (só quando há teto). */
  raisePanel: RotinaRaisePanel | null;
  impact: number;
  snoozedUntil: string | null;
  /** Quando o usuário decidiu (feito/ciente/adiado/ignorado); null se a ação está aberta. */
  decidedAt: string | null;
  /** Onde executar a tarefa no ML (promoções, editor, Product Ads, concorrência). */
  links: ActionLinks;
};

/** Os números da subida, para o painel ao lado do card (como o do piso). */
export type RotinaRaisePanel = {
  currentPrice: number;
  winCeiling: number;
  shareCeiling: number;
  gainPerUnit: number;
  gainPercent: number;
  /** ≈ ganho por mês em reais inteiros (alta × vendas/dia × 30); `null` sem vendas. */
  monthlyGain: number | null;
  /** Avisos que mudam a leitura do teto (faixa do frete, entrega melhor, anúncio irmão). */
  warnings: string[];
};

export type RotinaInfoItem = {
  mlItemId: string;
  title: string;
  sku: string | null;
  imageUrl: string | null;
  permalink: string;
  note: string;
  /** Resolvidos: o que o dado de agora mostra ("Agora em promoção a R$ 89,90"). */
  outcome?: string;
  /**
   * Tom do resultado. Sem tom = deu certo (o padrão dos resolvidos). Só a
   * subida de preço no catálogo pode dar errado depois do "feito".
   */
  outcomeTone?: "ok" | "warn" | "bad";
};

export type RotinaLinkedPair = {
  catalog: RotinaRelatedListing & { listedAt: string | null };
  own: RotinaRelatedListing;
};

export type RotinaListingRow = {
  mlItemId: string;
  title: string;
  sku: string | null;
  imageUrl: string | null;
  permalink: string;
  catalogListing: boolean;
  /** Clássico/Premium (`null` em retrato antigo). */
  listingTypeId: string | null;
  mlStatus: string;
  salePrice: number;
  regularPrice: number | null;
  hasPromotion: boolean;
  marginPercent: number | null;
  marginAfterAdsPercent: number | null;
  exclusionLabel: string | null;
  floor: RotinaFloorView;
  adsLabel: string | null;
  tacosPercent: number | null;
  catalogStatus: CatalogLiveStatus | null;
  priceToWin: number | null;
  /** Estimativa do teto para seguir ganhando sozinho (catálogo ganhando com concorrência). */
  raiseCeiling: number | null;
  unitsPerDay: number | null;
  openActions: number;
  target: RotinaListingTargetView;
};

export type RotinaView = {
  generatedAt: string;
  todayLabel: string;
  timeZone: string;
  settings: RotinaSettings;
  lastRun: RotinaRunSummary | null;
  /** Última rodada completa (`ok`). */
  lastCompleteRunAt: string | null;
  lastCompleteRunLabel: string | null;
  dataIsFromToday: boolean;
  hasHealth: boolean;
  actions: RotinaActionView[];
  info: {
    dataMissing: RotinaInfoItem[];
    catalogEligible: RotinaInfoItem[];
    linkedCatalog: RotinaLinkedPair[];
    resolvedToday: RotinaInfoItem[];
  };
  listings: RotinaListingRow[];
  /** Anúncios com meta própria (exceção ao padrão) — lista da sheet de Metas. */
  targetOverrides: RotinaTargetOverride[];
  warnings: string[];
};

export type RotinaTargetOverride = {
  mlItemId: string;
  title: string;
  catalogListing: boolean;
  minMarginPercent: number | null;
  tacosTargetPercent: number | null;
};

export type RotinaViewInput = {
  now: Date;
  timeZone: string;
  settings: RotinaSettings;
  health: readonly RotinaListingSnapshot[];
  catalogLive: readonly RotinaCatalogLive[];
  targets: ReadonlyMap<string, ListingTargetValues>;
  states: readonly ActionStateSnapshot[];
  lastRun: RotinaRunSummary | null;
  lastCompleteRunAt: string | null;
};

const ELIGIBLE_TAG = "catalog_listing_eligible";
const FLOOR_RULES = new Set<RotinaRuleKey>([
  "catalog_losing",
  "catalog_shared",
  "promo_expiring",
  "promo_missing",
  "margin_below_min",
]);
const CATALOG_POLL_STALE_MS = 6 * 60 * 60 * 1000;

function adsLabel(status: string | null): string | null {
  if (status === "active") return "ADS ativo";
  if (status === "paused") return "ADS pausado";
  if (status === "idle") return "Sem campanha";
  return null;
}

function exclusionLabel(reason: string | null): string | null {
  if (!reason) return null;
  return MARGIN_EXCLUSION_LABEL[reason as MarginExclusionReason] ?? reason;
}

function ageLabelFrom(firstSeenAt: string | null, now: Date, timeZone: string) {
  if (!firstSeenAt) return null;
  const days = localDayDiff(new Date(firstSeenAt), now, timeZone);
  if (days <= 0) return "novo hoje";
  if (days === 1) return "desde ontem";
  return `há ${days} dias`;
}

function verdictView(
  floor: RotinaFloorView | null,
  priceToWin: number | null,
  hasHealth: boolean,
): CatalogVerdictView {
  if (priceToWin === null) {
    return { tone: "neutral", text: "O ML não informou o preço para ganhar." };
  }
  if (!hasHealth || !floor) {
    return {
      tone: "neutral",
      text: "Atualize para saber se dá para ganhar mantendo a sua margem mínima.",
    };
  }
  if (floor.effectivePrice === null) {
    return {
      tone: "neutral",
      text:
        floor.reason === "missing_product_cost"
          ? "Cadastre o custo para saber se compensa ganhar."
          : "Sem preço mínimo calculado: atualize este anúncio.",
    };
  }
  const verdict = catalogVerdict(floor, priceToWin);
  if (verdict.kind === "can_win") {
    if (verdict.belowBand) {
      return {
        tone: "ok",
        text: `Dá para ganhar a ${formatMoney(verdict.suggestedPrice)} (logo abaixo da faixa em que o frete passa a ser seu), sobra ${formatMoney(verdict.slack)} sobre o mínimo.`,
      };
    }
    return {
      tone: "ok",
      text: `Dá para ganhar mantendo a margem mínima: sobra ${formatMoney(verdict.slack)} sobre o mínimo.`,
    };
  }
  if (verdict.kind === "cannot_win") {
    return {
      tone: "bad",
      text: `Não compensa: ganhar exige ${formatMoney(verdict.shortfall)} abaixo do seu mínimo.`,
    };
  }
  return { tone: "neutral", text: "Sem dados para comparar com o mínimo." };
}

type Entity = {
  mlItemId: string;
  health: RotinaListingSnapshot | null;
  catalog: RotinaCatalogLive | null;
};

function identity(
  entity: Entity,
  settings: RotinaSettings,
  target: ListingTargetValues | null,
): RotinaActionListing {
  const { health, catalog } = entity;
  const catalogListing = health?.catalogListing ?? catalog !== null;
  return {
    mlItemId: entity.mlItemId,
    title: health?.title ?? catalog?.title ?? entity.mlItemId,
    sku: health?.sku ?? catalog?.sku ?? null,
    imageUrl: health?.imageUrl ?? catalog?.imageUrl ?? null,
    permalink: buyerFacingItemPermalink(health?.permalink ?? "", entity.mlItemId),
    catalogListing,
    listingTypeId: health?.listingTypeId ?? null,
    salePrice: health?.salePrice ?? catalog?.sellerPrice ?? null,
    unitsPerDay: health?.unitsPerDay ?? null,
    marginPercent: health?.marginPercent ?? null,
    marginAfterAdsPercent: health?.marginAfterAdsPercent ?? null,
    minMarginPercent: effectiveMinMarginPercent(catalogListing, settings, target),
    minMarginOverridden:
      target?.minMarginPercent !== null && target?.minMarginPercent !== undefined,
    tacosTargetPercent: effectiveTacosTargetPercent(settings, target),
    tacosOverridden:
      target?.tacosTargetPercent !== null && target?.tacosTargetPercent !== undefined,
    target: listingTargetView(catalogListing, settings, target),
    pmaPrice: health?.pmaPrice ?? null,
    tacosPercent:
      health?.adsAvailable && (health.adsStatus === "active" || health.adsStatus === "paused")
        ? health.tacosPercent
        : null,
    adsPeriodDays: health?.adsPeriodDays ?? null,
    catalogProductId: health?.catalogProductId ?? catalog?.catalogProductId ?? null,
    hasHealth: health !== null,
  };
}

function related(entity: Entity | undefined, fallbackId: string): RotinaRelatedListing {
  return {
    mlItemId: entity?.mlItemId ?? fallbackId,
    title: entity?.health?.title ?? entity?.catalog?.title ?? fallbackId,
    permalink: buyerFacingItemPermalink(entity?.health?.permalink ?? "", fallbackId),
    unitsPerDay: entity?.health?.unitsPerDay ?? null,
  };
}

/**
 * O que mudou numa ação resolvida, lido do retrato de agora — nunca presumido
 * pela regra: ela também some se o anúncio foi pausado, se a regra foi
 * desligada em Metas ou se a meta mudou.
 */
/** ` “Nome”` para emendar numa frase; vazio sem nome. */
function quotedName(name: string | null): string {
  return name ? ` “${name}”` : "";
}

function resolvedOutcome(
  rule: RotinaRuleKey,
  health: RotinaListingSnapshot,
  settings: RotinaSettings,
  target: ListingTargetValues | null,
  timeZone: string,
): string {
  const fallback = "Não aparece mais na última atualização";
  if (!isRuleEnabled(settings, rule)) return "Regra desligada em Metas";
  if (health.mlStatus !== "active") return "Anúncio não está mais ativo no ML";

  switch (rule) {
    case "promo_missing":
      return health.hasPromotion
        ? `Agora em promoção a ${formatMoney(health.salePrice)}`
        : fallback;
    case "promo_expiring": {
      if (!health.hasPromotion) return "A promoção terminou";
      const coverage = listingPromotionCoverage(health, timeZone);
      if (!coverage.endsAt) return "Promoção renovada";
      const until = formatShortDate(coverage.endsAt, timeZone);
      return coverage.last?.status === "pending"
        ? `Promoção programada${quotedName(coverage.last.name)} até ${until}`
        : `Promoção vai até ${until}`;
    }
    case "margin_below_min": {
      const margin = marginForRules(health);
      if (margin.percent === null) return "Sem dados para calcular a margem agora";
      const min = formatPercent(
        effectiveMinMarginPercent(health.catalogListing, settings, target),
      );
      const basis = margin.basis === "afterAds" ? "após ADS " : "";
      return `Margem ${basis}agora ${formatPercent(margin.percent)} (mín. ${min}) a ${formatMoney(health.salePrice)}`;
    }
    case "below_pma":
      return health.pmaPrice === null
        ? "PMA removido em Meus produtos"
        : `Preço agora ${formatMoney(health.salePrice)} (PMA ${formatMoney(health.pmaPrice)})`;
    case "tacos_above":
      if (!health.adsAvailable) return fallback;
      if (health.adsStatus !== "active") return "ADS não está mais ativo";
      return health.tacosPercent !== null
        ? `TACOS agora ${formatPercent(health.tacosPercent)} (meta ${formatPercent(
            effectiveTacosTargetPercent(settings, target),
          )})`
        : fallback;
    case "ads_missing":
      return health.adsStatus === "active" ? "ADS ativo agora" : fallback;
    default:
      return fallback;
  }
}

/**
 * Toda subida lembra que é estimativa e que precisa conferir depois — vai na
 * caixa de veredito do card (neutra), para não sumir entre as linhas cinza.
 */
export const CATALOG_RAISE_CHECK_LINE =
  "É uma estimativa: simule antes e, depois de subir, confira se continua ganhando. A Central confere na próxima leitura do catálogo (~1h).";

/** Uma subida "explica" o status de agora se o episódio começou até 1 dia depois dela. */
const RAISE_EXPLAINS_WITHIN_MS = 24 * 60 * 60 * 1000;

function raiseBeforeEpisode(
  catalog: RotinaCatalogLive | null,
): RotinaCatalogLive["recentRaise"] {
  const raise = catalog?.recentRaise ?? null;
  const since = catalog?.statusSince ?? null;
  if (!raise || !since || catalog?.statusSinceTruncated) return null;
  const gap = new Date(since).getTime() - new Date(raise.at).getTime();
  return gap >= 0 && gap <= RAISE_EXPLAINS_WITHIN_MS ? raise : null;
}

function ownOtherWarning(raise: CatalogRaiseEstimate): string | null {
  if (!raise.ownOther) return null;
  return `Seu outro anúncio neste produto (${raise.ownOther.itemId}) está a ${formatMoney(
    raise.ownOther.price,
  )}: acima disso, a vitrine tende a passar para ele. Para a alta valer, suba os dois.`;
}

function describeRaise(raise: CatalogRaiseEstimate | null): { headline: string; details: string[] } {
  if (!raise) return { headline: "Ganhando no catálogo", details: [] };
  if (raise.alone || raise.cheapest === null || raise.winCeiling === null) {
    const details = [
      `Hoje: ${formatMoney(raise.currentPrice)} · nenhum outro vendedor neste produto`,
      "Sem concorrente, não há teto pela disputa do catálogo. O ML ainda pode rebaixar um preço muito acima do mercado.",
    ];
    const own = ownOtherWarning(raise);
    if (own) details.push(own);
    return { headline: "Ganhando sem concorrente no catálogo", details };
  }
  // Os números (teto, dividir, ganho) vão no painel ao lado; aqui, só o porquê.
  const logistic = raise.cheapestLogisticLabel ? ` (${raise.cheapestLogisticLabel})` : "";
  const price = `${formatMoney(raise.cheapest.price)}${logistic}`;
  return {
    headline: "Ganhando com folga no catálogo",
    details: [
      raise.competitorCount === 1
        ? `Único concorrente: ${price}`
        : `Concorrente mais barato: ${price} · ${raise.competitorCount} outros vendedores no produto`,
    ],
  };
}

/** Painel da subida: `null` sem teto (sozinho no produto) ou sem estimativa. */
export function buildRaisePanel(
  raise: CatalogRaiseEstimate | null,
  unitsPerDay: number | null,
): RotinaRaisePanel | null {
  if (
    !raise ||
    raise.alone ||
    raise.winCeiling === null ||
    raise.shareCeiling === null ||
    raise.gainPerUnit === null ||
    raise.gainPercent === null
  ) {
    return null;
  }
  const warnings: string[] = [];
  if (raise.belowBand) {
    warnings.push("O teto ficou logo abaixo da faixa em que o frete passa a ser seu.");
  }
  if (raise.betterLogistics) {
    warnings.push(
      `Há concorrente com entrega melhor que a sua${
        raise.betterLogistics.label ? ` (${raise.betterLogistics.label})` : ""
      } a ${formatMoney(raise.betterLogistics.price)}: a folga real pode ser menor.`,
    );
  }
  const own = ownOtherWarning(raise);
  if (own) warnings.push(own);
  return {
    currentPrice: raise.currentPrice,
    winCeiling: raise.winCeiling,
    shareCeiling: raise.shareCeiling,
    gainPerUnit: raise.gainPerUnit,
    gainPercent: raise.gainPercent,
    monthlyGain:
      unitsPerDay !== null && unitsPerDay > 0
        ? Math.round(raise.gainPerUnit * unitsPerDay * 30)
        : null,
    warnings,
  };
}

/**
 * Depois do "feito" numa subida, o que a leitura de catálogo mais nova mostra.
 * Diferente das outras regras, aqui o resultado pode ser ruim (passou a
 * dividir ou a perder), e a frase diz o preço para voltar.
 */
function raiseOutcome(
  catalog: RotinaCatalogLive | null,
  settings: RotinaSettings,
): { outcome: string; tone: NonNullable<RotinaInfoItem["outcomeTone"]> } {
  if (!isRuleEnabled(settings, "catalog_raise_price")) {
    return { outcome: "Regra desligada em Metas", tone: "ok" };
  }
  if (!catalog || catalog.mlStatus !== "active") {
    return { outcome: "Anúncio não está mais ativo no ML", tone: "ok" };
  }
  const price = catalog.sellerPrice !== null ? ` a ${formatMoney(catalog.sellerPrice)}` : "";
  if (catalog.status === "winning") {
    return { outcome: `Continua ganhando${price}`, tone: "ok" };
  }
  const toWin =
    catalog.priceToWin !== null ? formatMoney(catalog.priceToWin) : "o preço que o ML indicar";
  if (catalog.status === "shared") {
    return {
      outcome: `Passou a dividir o 1º lugar${price}: para ganhar sozinho, ${toWin}`,
      tone: "warn",
    };
  }
  if (catalog.status === "losing") {
    return { outcome: `Passou a perder${price}: preço p/ ganhar ${toWin}`, tone: "bad" };
  }
  return { outcome: "Sem leitura do catálogo agora", tone: "ok" };
}

/** O teto da tabela, só quando a subida vira tarefa (folga acima do mínimo). */
function raiseCeilingFor(
  catalog: RotinaCatalogLive | null,
  settings: RotinaSettings,
  now: Date,
  bands: readonly RotinaFloorBand[],
): number | null {
  const estimate = catalogRaiseFor(catalog, settings, { now, bands });
  return catalogRaiseQualifies(estimate, settings.catalogRaiseMinPercent)
    ? (estimate?.winCeiling ?? null)
    : null;
}

/** Frase principal + linhas de apoio de cada regra. */
function describe(
  rule: RotinaRuleKey,
  entity: Entity,
  listing: RotinaActionListing,
  floor: RotinaFloorView | null,
  ctx: { now: Date; timeZone: string; raise: CatalogRaiseEstimate | null },
): { headline: string; details: string[] } {
  const { health, catalog } = entity;
  const details: string[] = [];

  switch (rule) {
    case "catalog_raise_price":
      return describeRaise(ctx.raise);

    case "catalog_losing":
    case "catalog_shared": {
      const since = formatSince(
        catalog?.statusSince ?? null,
        ctx.now,
        ctx.timeZone,
        catalog?.statusSinceTruncated ? rotinaConfig.catalogHistoryDays : undefined,
      );
      const verb = rule === "catalog_losing" ? "Perdendo no catálogo" : "Dividindo o 1º lugar";
      if (catalog?.priceToWin !== null && catalog?.priceToWin !== undefined) {
        const label = rule === "catalog_losing" ? "Para ganhar" : "Para ganhar sozinho";
        details.push(
          `${label}: ${formatMoney(catalog.priceToWin)}${
            catalog.sellerPrice !== null ? ` · você: ${formatMoney(catalog.sellerPrice)}` : ""
          }`,
        );
      }
      const raise = raiseBeforeEpisode(catalog);
      if (raise) {
        details.push(
          `Você subiu de ${formatMoney(raise.from)} para ${formatMoney(raise.to)} ${formatWhen(
            raise.at,
            ctx.now,
            ctx.timeZone,
          )}, quando estava ganhando.`,
        );
      }
      return { headline: since ? `${verb} ${since}` : verb, details };
    }

    case "promo_expiring": {
      const coverage = health ? listingPromotionCoverage(health, ctx.timeZone) : null;
      const days = health ? promotionDaysLeft(health, ctx.now, ctx.timeZone) : null;
      // Com programada emendada, o que vence é a última da fila, não a ativa.
      const scheduled = coverage?.last?.status === "pending" ? coverage.last : null;
      const activeName = coverage?.last?.name ?? health?.promotionName ?? null;
      const subject = scheduled
        ? `Promoção programada${quotedName(scheduled.name)}`
        : activeName
          ? `“${activeName}”`
          : "Promoção";
      const endsAt = coverage?.endsAt ?? null;
      const when =
        days === null
          ? "em breve"
          : `${formatDaysUntil(days)}${
              days > 1 && endsAt ? ` (${formatShortDate(endsAt, ctx.timeZone)})` : ""
            }`;
      if (health) {
        details.push(
          `Com promoção: ${formatMoney(health.salePrice)}${
            health.regularPrice !== null
              ? ` · original ${formatMoney(health.regularPrice)}`
              : ""
          }`,
        );
        if (scheduled && health.promotionEndsAt) {
          details.push(
            `Emenda com ${
              health.promotionName ? `“${health.promotionName}”` : "a promoção atual"
            }, que termina ${formatShortDate(health.promotionEndsAt, ctx.timeZone)}`,
          );
        }
        const gap = coverage?.nextAfterGap;
        if (gap?.window.startsAt) {
          details.push(
            `Programada${quotedName(gap.window.name)} só começa ${formatShortDate(
              gap.window.startsAt,
              ctx.timeZone,
            )}: ${gap.daysWithout} dia${gap.daysWithout === 1 ? "" : "s"} sem promoção`,
          );
        }
      }
      return { headline: `${subject} termina ${when}`, details };
    }

    case "promo_missing":
      if (health) details.push(`Preço de hoje: ${formatMoney(health.salePrice)}`);
      return { headline: "Sem promoção ativa", details };

    case "ads_missing": {
      const status = health?.adsStatus ?? null;
      const headline =
        status === "paused"
          ? "ADS pausado"
          : status === "idle"
            ? "Sem campanha de ADS (disponível para anunciar)"
            : "Fora do Product Ads";
      return { headline, details };
    }

    case "tacos_above": {
      const period = health?.adsPeriodDays ?? 7;
      const cost = health?.adsCost ?? 0;
      if (health?.tacosPercent === null || health?.tacosPercent === undefined) {
        return {
          headline: `Gastou ${formatMoney(cost)} em ADS sem vender em ${period} dias`,
          details,
        };
      }
      details.push(`${formatMoney(cost)} em ADS nos últimos ${period} dias`);
      if (health.marginAfterAdsPercent !== null) {
        details.push(`Margem após ADS: ${formatPercent(health.marginAfterAdsPercent)}`);
      }
      return {
        headline: `TACOS ${formatPercent(health.tacosPercent)}, meta ${formatPercent(listing.tacosTargetPercent)}`,
        details,
      };
    }

    case "margin_below_min": {
      if (!health) return { headline: "Margem abaixo do mínimo", details };
      const margin = marginForRules(health);
      const min = formatPercent(listing.minMarginPercent);
      const headline =
        margin.basis === "afterAds"
          ? `Margem após ADS ${formatPercent(margin.percent)}, mínimo ${min}`
          : `Margem ${formatPercent(margin.percent)} (MC), mínimo ${min}`;
      details.push(
        `MC ${formatPercent(health.marginPercent)} · após ADS ${formatPercent(
          margin.fallback ? null : health.marginAfterAdsPercent,
        )} a ${formatMoney(health.salePrice)}`,
      );
      if (margin.fallback === "ads_unavailable") {
        details.push("O Product Ads não respondeu na última leitura: decidindo pela MC.");
      } else if (margin.fallback === "spend_without_sales") {
        details.push("ADS gastando sem vender: a margem após ADS está indefinida.");
      }
      if (!health.catalogListing && health.hasPromotion) {
        details.push("Em promoção: é o preço com desconto que está abaixo do mínimo.");
      }
      if (catalog?.status === "winning") {
        details.push("Está ganhando o catálogo, mas abaixo do mínimo.");
      }
      if (floor?.effectivePrice !== null && floor?.effectivePrice !== undefined) {
        if (floor.effectivePrice > health.salePrice) {
          details.push(`Suba para ${formatMoney(floor.effectivePrice)} para voltar ao mínimo.`);
        }
      }
      return { headline, details };
    }

    case "below_pma": {
      if (!health || health.pmaPrice === null) return { headline: "Abaixo do PMA", details };
      details.push(`Faltam ${formatMoney(roundMoney(health.pmaPrice - health.salePrice))} para o PMA.`);
      return {
        headline: `Preço ${formatMoney(health.salePrice)} abaixo do PMA ${formatMoney(health.pmaPrice)}`,
        details,
      };
    }

    case "catalog_takeover":
      return { headline: "O ML criou um anúncio de catálogo ligado a este", details };
  }
}

function ruleOrder(rule: RotinaRuleKey): number {
  return ROTINA_RULE_KEYS.indexOf(rule);
}

function compareActions(a: RotinaActionView, b: RotinaActionView): number {
  const byRule = ruleOrder(a.rule) - ruleOrder(b.rule);
  if (byRule !== 0) return byRule;
  if (a.isNew !== b.isNew) return a.isNew ? -1 : 1;
  if (a.impact !== b.impact) return b.impact - a.impact;
  return a.listing.title.localeCompare(b.listing.title, "pt-BR");
}

export function buildRotinaView(input: RotinaViewInput): RotinaView {
  const { now, timeZone, settings } = input;
  const nowIso = now.toISOString();

  const entities = new Map<string, Entity>();
  for (const health of input.health) {
    entities.set(health.mlItemId, { mlItemId: health.mlItemId, health, catalog: null });
  }
  for (const catalog of input.catalogLive) {
    const existing = entities.get(catalog.mlItemId);
    if (existing) existing.catalog = catalog;
    else entities.set(catalog.mlItemId, { mlItemId: catalog.mlItemId, health: null, catalog });
  }

  const states = new Map(
    input.states.map((state) => [stateKey(state.mlItemId, state.rule), state]),
  );

  const actions: RotinaActionView[] = [];

  function pushAction(args: {
    rule: RotinaRuleKey;
    entity: Entity;
    stateItemId: string;
    dataAt: string | null;
    episodeStart: string | null;
    isNew: boolean;
    ageLabel: string | null;
    relatedListing?: RotinaRelatedListing | null;
    headlineOverride?: { headline: string; details: string[] };
  }) {
    const definition = ROTINA_RULES[args.rule];
    const target = input.targets.get(args.entity.mlItemId) ?? null;
    const listing = identity(args.entity, settings, target);
    const state = states.get(stateKey(args.stateItemId, args.rule)) ?? null;
    const visibility = resolveActionVisibility({
      kind: definition.kind,
      state,
      now,
      dataAt: args.dataAt,
      episodeStart: args.episodeStart,
    });

    const floor =
      args.entity.health && FLOOR_RULES.has(args.rule)
        ? buildFloorView(args.entity.health, listing.minMarginPercent)
        : null;
    const verdict: CatalogVerdictView | null =
      args.rule === "catalog_losing" || args.rule === "catalog_shared"
        ? verdictView(floor, args.entity.catalog?.priceToWin ?? null, args.entity.health !== null)
        : args.rule === "catalog_raise_price"
          ? { tone: "neutral", text: CATALOG_RAISE_CHECK_LINE }
          : null;
    const live = args.entity.catalog;
    const raise =
      args.rule === "catalog_raise_price"
        ? catalogRaiseFor(live, settings, { now, bands: args.entity.health?.floorBands })
        : null;
    const text =
      args.headlineOverride ??
      describe(args.rule, args.entity, listing, floor, { now, timeZone, raise });
    const verdictData =
      live && floor && live.priceToWin !== null ? catalogVerdict(floor, live.priceToWin) : null;

    actions.push({
      id: `${args.rule}:${args.stateItemId}`,
      rule: args.rule,
      kind: definition.kind,
      segment: listing.catalogListing ? "catalog" : "own",
      stateItemId: args.stateItemId,
      bucket: visibility.bucket,
      doneToday:
        visibility.bucket === "done" &&
        state !== null &&
        isoIsToday(state.statusChangedAt, now, timeZone),
      continues: visibility.continues,
      isNew: args.isNew,
      ageLabel: args.ageLabel,
      listing,
      headline: text.headline,
      details: text.details,
      floor,
      verdict,
      raisePanel: buildRaisePanel(raise, listing.unitsPerDay),
      related: args.relatedListing ?? null,
      catalog: live
        ? {
            status: live.status,
            priceToWin: live.priceToWin,
            sellerPrice: live.sellerPrice,
            suggestedPrice:
              verdictData?.kind === "can_win" && verdictData.belowBand
                ? verdictData.suggestedPrice
                : null,
            raise,
          }
        : null,
      // Na subida, o que importa é quanto entra a mais por dia.
      impact:
        raise !== null
          ? (listing.unitsPerDay ?? 0) * (raise.gainPerUnit ?? 0)
          : (listing.unitsPerDay ?? 0) * (listing.salePrice ?? 0),
      snoozedUntil: state?.status === "snoozed" ? state.snoozedUntil : null,
      decidedAt: visibility.bucket !== "active" && state ? state.statusChangedAt : null,
      links: buildActionLinks({
        rule: args.rule,
        mlItemId: listing.mlItemId,
        catalogListing: listing.catalogListing,
        catalogProductId: listing.catalogProductId,
        related: args.relatedListing
          ? {
              mlItemId: args.relatedListing.mlItemId,
              catalogProductId:
                entities.get(args.relatedListing.mlItemId)?.health?.catalogProductId ?? null,
            }
          : null,
      }),
    });
  }

  // Regras da rodada e de catálogo, por anúncio.
  for (const entity of entities.values()) {
    const target = input.targets.get(entity.mlItemId) ?? null;

    if (entity.health) {
      const hits = evaluateRefreshRules(entity.health, {
        settings,
        target,
        now,
        timeZone,
      });
      for (const rule of hits) {
        const state = states.get(stateKey(entity.mlItemId, rule)) ?? null;
        const firstSeenAt = state && state.status !== "resolved" ? state.firstSeenAt : null;
        pushAction({
          rule,
          entity,
          stateItemId: entity.mlItemId,
          dataAt: entity.health.computedAt,
          episodeStart: null,
          isNew: isoIsToday(firstSeenAt, now, timeZone),
          ageLabel: ageLabelFrom(firstSeenAt, now, timeZone),
        });
      }
    }

    const catalogHits = evaluateCatalogRules(entity.catalog, settings, {
      now,
      bands: entity.health?.floorBands,
    });
    for (const rule of catalogHits) {
      if (rule === "catalog_raise_price") {
        // Sem "desde quando": o histórico de quem ganha cobre só 3 dias, e a
        // folga muda a cada leitura dos concorrentes.
        pushAction({
          rule,
          entity,
          stateItemId: entity.mlItemId,
          dataAt: entity.catalog?.polledAt ?? null,
          episodeStart: null,
          isNew: false,
          ageLabel: null,
        });
        continue;
      }
      const since = entity.catalog?.statusSince ?? null;
      const truncated = entity.catalog?.statusSinceTruncated ?? false;
      pushAction({
        rule,
        entity,
        stateItemId: entity.mlItemId,
        dataAt: entity.catalog?.polledAt ?? null,
        episodeStart: since,
        isNew: !truncated && isoIsToday(since, now, timeZone),
        ageLabel: truncated
          ? `há mais de ${rotinaConfig.catalogHistoryDays} dias`
          : ageLabelFrom(since, now, timeZone),
      });
    }
  }

  // Eventos de vínculo de catálogo (só existem como estado).
  if (!settings.disabledRules.includes("catalog_takeover")) {
    for (const state of input.states) {
      if (state.rule !== "catalog_takeover" || state.status === "resolved") continue;
      const catalogEntity = entities.get(state.mlItemId);
      const ownId = state.relatedItemId;
      const ownEntity = ownId ? entities.get(ownId) : undefined;
      // Sem o próprio na rodada, a ação fica no anúncio de catálogo mesmo.
      const entity = ownEntity ?? catalogEntity;
      if (!entity) continue;
      const catalogRelated = related(catalogEntity, state.mlItemId);
      const listedAt = catalogEntity?.health?.listedAt ?? null;
      const ownUnits = ownEntity?.health?.unitsPerDay ?? null;
      const details: string[] = [];
      details.push(
        `Vendas: próprio ${formatUnitsRate(ownUnits)} · catálogo ${formatUnitsRate(catalogRelated.unitsPerDay)}`,
      );
      const catalogStatus = catalogEntity?.catalog?.status;
      if (catalogStatus === "losing") details.push("O catálogo novo está perdendo a vitrine.");
      if (catalogStatus === "winning") details.push("O catálogo novo está ganhando a vitrine.");
      pushAction({
        rule: "catalog_takeover",
        entity: { ...entity, catalog: ownEntity ? null : entity.catalog },
        stateItemId: state.mlItemId,
        dataAt: null,
        episodeStart: null,
        isNew: isoIsToday(state.firstSeenAt, now, timeZone),
        ageLabel: ageLabelFrom(state.firstSeenAt, now, timeZone),
        relatedListing: catalogRelated,
        headlineOverride: {
          headline: `O ML criou o catálogo ${state.mlItemId}${
            listedAt ? ` em ${formatShortDate(listedAt, timeZone)}` : ""
          } ligado a este anúncio`,
          details,
        },
      });
    }
  }

  actions.sort(compareActions);

  // Listas de apoio (cinza, recolhidas).
  const linkedOwnIds = new Set<string>();
  const linkedCatalog: RotinaLinkedPair[] = [];
  for (const entity of entities.values()) {
    const ownId = entity.health?.catalogListing ? entity.health.linkedOwnItemId : null;
    if (!ownId) continue;
    linkedOwnIds.add(ownId);
    const ownEntity = entities.get(ownId);
    linkedCatalog.push({
      catalog: { ...related(entity, entity.mlItemId), listedAt: entity.health?.listedAt ?? null },
      own: related(ownEntity, ownId),
    });
  }

  const dataMissing: RotinaInfoItem[] = [];
  const catalogEligible: RotinaInfoItem[] = [];
  for (const entity of entities.values()) {
    const health = entity.health;
    if (!health || health.mlStatus !== "active") continue;
    const base = {
      mlItemId: health.mlItemId,
      title: health.title,
      sku: health.sku,
      imageUrl: health.imageUrl,
      permalink: buyerFacingItemPermalink(health.permalink, health.mlItemId),
    };
    const exclusion = exclusionLabel(health.exclusionReason);
    if (exclusion) dataMissing.push({ ...base, note: exclusion });
    if (
      !health.catalogListing &&
      health.tags.includes(ELIGIBLE_TAG) &&
      !linkedOwnIds.has(health.mlItemId)
    ) {
      catalogEligible.push({
        ...base,
        note: "O ML marcou como elegível para catálogo.",
      });
    }
  }

  const resolvedToday: RotinaInfoItem[] = [];
  for (const state of input.states) {
    if (state.status !== "resolved" || !isoIsToday(state.resolvedAt, now, timeZone)) continue;
    if (!(REFRESH_CONDITION_RULES as readonly string[]).includes(state.rule)) continue;
    const entity = entities.get(state.mlItemId);
    if (!entity?.health) continue;
    resolvedToday.push({
      mlItemId: entity.mlItemId,
      title: entity.health.title,
      sku: entity.health.sku,
      imageUrl: entity.health.imageUrl,
      permalink: buyerFacingItemPermalink(entity.health.permalink, entity.mlItemId),
      note: ROTINA_RULES[state.rule as RotinaRuleKey].settingsLabel,
      outcome: resolvedOutcome(
        state.rule as RotinaRuleKey,
        entity.health,
        settings,
        input.targets.get(entity.mlItemId) ?? null,
        timeZone,
      ),
    });
  }
  // Subidas feitas hoje que a leitura de catálogo já conferiu (a regra não
  // dispara mais): o resultado, bom ou ruim.
  const activeRaiseIds = new Set(
    actions
      .filter((action) => action.rule === "catalog_raise_price")
      .map((action) => action.stateItemId),
  );
  for (const state of input.states) {
    if (state.rule !== "catalog_raise_price" || state.status !== "done") continue;
    if (!isoIsToday(state.statusChangedAt, now, timeZone)) continue;
    if (activeRaiseIds.has(state.mlItemId)) continue;
    const entity = entities.get(state.mlItemId);
    if (!entity) continue;
    const polledAt = entity.catalog?.polledAt ?? null;
    if (polledAt === null || polledAt <= state.statusChangedAt) continue;
    const listing = identity(entity, settings, null);
    const result = raiseOutcome(entity.catalog, settings);
    resolvedToday.push({
      mlItemId: entity.mlItemId,
      title: listing.title,
      sku: listing.sku,
      imageUrl: listing.imageUrl,
      permalink: listing.permalink,
      note: ROTINA_RULES.catalog_raise_price.taskLabel,
      outcome: result.outcome,
      outcomeTone: result.tone,
    });
  }
  for (const entity of entities.values()) {
    if (!entity.catalog?.wonBackToday) continue;
    const listing = identity(entity, settings, null);
    resolvedToday.push({
      mlItemId: entity.mlItemId,
      title: listing.title,
      sku: listing.sku,
      imageUrl: listing.imageUrl,
      permalink: listing.permalink,
      note: "Catálogo",
      outcome: entity.catalog.statusSince
        ? `Voltou a ganhar a vitrine às ${formatClock(entity.catalog.statusSince, timeZone)}`
        : "Voltou a ganhar a vitrine",
    });
  }

  // Tabela "Todos os anúncios".
  const openByItem = new Map<string, number>();
  for (const action of actions) {
    if (action.bucket !== "active") continue;
    openByItem.set(action.listing.mlItemId, (openByItem.get(action.listing.mlItemId) ?? 0) + 1);
  }
  const listings: RotinaListingRow[] = [];
  for (const entity of entities.values()) {
    const health = entity.health;
    if (!health) continue;
    const target = input.targets.get(health.mlItemId) ?? null;
    const minMargin = effectiveMinMarginPercent(health.catalogListing, settings, target);
    listings.push({
      mlItemId: health.mlItemId,
      title: health.title,
      sku: health.sku,
      imageUrl: health.imageUrl,
      permalink: buyerFacingItemPermalink(health.permalink, health.mlItemId),
      catalogListing: health.catalogListing,
      listingTypeId: health.listingTypeId,
      mlStatus: health.mlStatus,
      salePrice: health.salePrice,
      regularPrice: health.regularPrice,
      hasPromotion: health.hasPromotion,
      marginPercent: health.marginPercent,
      marginAfterAdsPercent: health.marginAfterAdsPercent,
      exclusionLabel: exclusionLabel(health.exclusionReason),
      floor: buildFloorView(health, minMargin),
      adsLabel: health.adsAvailable ? adsLabel(health.adsStatus) : null,
      tacosPercent: health.tacosPercent,
      catalogStatus: entity.catalog?.status ?? null,
      priceToWin: entity.catalog?.priceToWin ?? null,
      raiseCeiling: raiseCeilingFor(entity.catalog, settings, now, health.floorBands),
      unitsPerDay: health.unitsPerDay,
      openActions: openByItem.get(health.mlItemId) ?? 0,
      target: listingTargetView(health.catalogListing, settings, target),
    });
  }
  listings.sort((a, b) => {
    const impactA = (a.unitsPerDay ?? 0) * a.salePrice;
    const impactB = (b.unitsPerDay ?? 0) * b.salePrice;
    if (impactA !== impactB) return impactB - impactA;
    return a.title.localeCompare(b.title, "pt-BR");
  });

  // Avisos discretos: o que ficou de fora e por quê.
  const warnings: string[] = [];
  const activeHealth = input.health.filter((health) => health.mlStatus === "active");
  if (input.lastRun?.status === "failed") {
    warnings.push(
      "A última atualização não terminou. Os dados abaixo são da rodada anterior.",
    );
  }
  const adsMissing = activeHealth.filter((health) => !health.adsAvailable).length;
  if (adsMissing > 0) {
    warnings.push(
      `O Product Ads não respondeu para ${adsMissing} anúncio(s) na última atualização: as regras de ADS ficaram de fora neles.`,
    );
  }
  const priceUnknown = activeHealth.filter(
    (health) => !health.catalogListing && !health.promotionKnown,
  ).length;
  if (priceUnknown > 0) {
    warnings.push(
      `${priceUnknown} anúncio(s) ficaram sem consulta de preço: não entram em "sem promoção" até a próxima atualização.`,
    );
  }
  const endUnknown = activeHealth.filter(
    (health) =>
      !health.catalogListing && health.hasPromotion && !health.promotionEndKnown,
  ).length;
  if (endUnknown > 0) {
    warnings.push(`${endUnknown} promoção(ões) sem data de término lida.`);
  }
  const staleFloors = actions.filter(
    (action) => action.bucket === "active" && action.floor?.stale,
  ).length;
  if (staleFloors > 0) {
    warnings.push(
      `${staleFloors} preço(s) mínimo(s) foram calculados com outra meta: use "recalcular" no anúncio ou atualize tudo.`,
    );
  }
  const polled = input.catalogLive
    .map((catalog) => catalog.polledAt)
    .filter((value): value is string => value !== null)
    .sort();
  const lastPoll = polled[polled.length - 1];
  if (lastPoll && now.getTime() - new Date(lastPoll).getTime() > CATALOG_POLL_STALE_MS) {
    warnings.push(
      `O status do catálogo não é lido desde ${formatWhen(lastPoll, now, timeZone)}: confira o cron de catálogo.`,
    );
  }

  const targetOverrides: RotinaTargetOverride[] = [];
  for (const [mlItemId, target] of input.targets) {
    if (target.minMarginPercent === null && target.tacosTargetPercent === null) continue;
    const entity = entities.get(mlItemId);
    targetOverrides.push({
      mlItemId,
      title: entity?.health?.title ?? entity?.catalog?.title ?? mlItemId,
      catalogListing: entity?.health?.catalogListing ?? entity?.catalog !== undefined,
      minMarginPercent: target.minMarginPercent,
      tacosTargetPercent: target.tacosTargetPercent,
    });
  }
  targetOverrides.sort((a, b) => a.title.localeCompare(b.title, "pt-BR"));

  return {
    generatedAt: nowIso,
    todayLabel: formatTodayLabel(now, timeZone),
    timeZone,
    settings,
    lastRun: input.lastRun,
    lastCompleteRunAt: input.lastCompleteRunAt,
    lastCompleteRunLabel: input.lastCompleteRunAt
      ? formatWhen(input.lastCompleteRunAt, now, timeZone)
      : null,
    dataIsFromToday: isoIsToday(input.lastCompleteRunAt, now, timeZone),
    hasHealth: input.health.length > 0,
    actions,
    info: { dataMissing, catalogEligible, linkedCatalog, resolvedToday },
    listings,
    targetOverrides,
    warnings,
  };
}
