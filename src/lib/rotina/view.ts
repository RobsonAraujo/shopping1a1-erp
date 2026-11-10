import { rotinaConfig } from "@/config/rotina";
import {
  MARGIN_EXCLUSION_LABEL,
  type MarginExclusionReason,
} from "@/lib/lucratividade/margin-summary";
import { buyerFacingItemPermalink } from "@/lib/mercadolibre/item-permalink";
import { roundMoney } from "@/lib/pricing/financial-margin";
import {
  buildFloorView,
  catalogVerdict,
  type RotinaFloorView,
} from "@/lib/rotina/floor-view";
import {
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
  effectiveMinMarginPercent,
  effectiveTacosTargetPercent,
  evaluateCatalogRules,
  evaluateRefreshRules,
  marginForRules,
  promotionDaysLeft,
} from "@/lib/rotina/rules";
import { stateKey } from "@/lib/rotina/reconcile";
import type { RotinaSettings } from "@/lib/rotina/settings-shared";
import { isoIsToday, localDayDiff } from "@/lib/rotina/time";
import type {
  ActionStateSnapshot,
  ListingTargetValues,
  RotinaCatalogLive,
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

export type RotinaActionListing = {
  mlItemId: string;
  title: string;
  sku: string | null;
  imageUrl: string | null;
  permalink: string;
  catalogListing: boolean;
  salePrice: number | null;
  unitsPerDay: number | null;
  marginPercent: number | null;
  marginAfterAdsPercent: number | null;
  minMarginPercent: number;
  minMarginOverridden: boolean;
  tacosTargetPercent: number;
  tacosOverridden: boolean;
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
  } | null;
  impact: number;
  snoozedUntil: string | null;
};

export type RotinaInfoItem = {
  mlItemId: string;
  title: string;
  sku: string | null;
  imageUrl: string | null;
  permalink: string;
  note: string;
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
  unitsPerDay: number | null;
  openActions: number;
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

/** Frase principal + linhas de apoio de cada regra. */
function describe(
  rule: RotinaRuleKey,
  entity: Entity,
  listing: RotinaActionListing,
  floor: RotinaFloorView | null,
  ctx: { now: Date; timeZone: string },
): { headline: string; details: string[] } {
  const { health, catalog } = entity;
  const details: string[] = [];

  switch (rule) {
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
      return { headline: since ? `${verb} ${since}` : verb, details };
    }

    case "promo_expiring": {
      const days = health ? promotionDaysLeft(health, ctx.now, ctx.timeZone) : null;
      const name = health?.promotionName ? `“${health.promotionName}”` : "Promoção";
      const when =
        days === null
          ? "em breve"
          : `${formatDaysUntil(days)}${
              days > 1 && health?.promotionEndsAt
                ? ` (${formatShortDate(health.promotionEndsAt, ctx.timeZone)})`
                : ""
            }`;
      if (health) {
        details.push(
          `Com promoção: ${formatMoney(health.salePrice)}${
            health.regularPrice !== null
              ? ` · original ${formatMoney(health.regularPrice)}`
              : ""
          }`,
        );
      }
      return { headline: `${name} termina ${when}`, details };
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
    const verdict =
      args.rule === "catalog_losing" || args.rule === "catalog_shared"
        ? verdictView(floor, args.entity.catalog?.priceToWin ?? null, args.entity.health !== null)
        : null;
    const text =
      args.headlineOverride ??
      describe(args.rule, args.entity, listing, floor, { now, timeZone });
    const live = args.entity.catalog;
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
          }
        : null,
      impact: (listing.unitsPerDay ?? 0) * (listing.salePrice ?? 0),
      snoozedUntil: state?.status === "snoozed" ? state.snoozedUntil : null,
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

    const catalogHits = evaluateCatalogRules(entity.catalog, settings);
    for (const rule of catalogHits) {
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
      note: `${ROTINA_RULES[state.rule as RotinaRuleKey].settingsLabel}: resolvido`,
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
      note: "Voltou a ganhar no catálogo",
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
      unitsPerDay: health.unitsPerDay,
      openActions: openByItem.get(health.mlItemId) ?? 0,
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
