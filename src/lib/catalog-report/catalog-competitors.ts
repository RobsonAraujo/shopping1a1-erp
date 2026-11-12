import type { CatalogProductItem } from "@/lib/mercadolibre/types";

/**
 * Resumo das ofertas de um produto de catálogo (`/products/{id}/items`), do
 * jeito que fica gravado em `Listing.catalogCompetitors`. Puro: entra a lista
 * crua do ML, sai só o que a Central usa para estimar "até quanto dá para
 * subir" — o concorrente mais barato e a logística de cada um.
 *
 * Formato real (probe de 2026-11-12): `price` já é o preço de venda (com
 * promoção; `original_price` é o de antes), `seller_id` é número, a logística
 * vem em `shipping.logistic_type`, e a lista **inclui as ofertas do próprio
 * vendedor**. A ordem é quase por preço, mas não estrita — por isso ordenamos
 * aqui.
 */

export type CatalogCompetitorOffer = {
  itemId: string;
  sellerId: string | null;
  price: number;
  logisticType: string | null;
  freeShipping: boolean | null;
};

/** Outro anúncio do mesmo vendedor no mesmo produto (ex.: o par clássico/premium). */
export type CatalogOwnOffer = {
  itemId: string;
  price: number;
  logisticType: string | null;
};

export type CatalogCompetitionSummary = {
  version: 1;
  fetchedAt: string;
  /** Ofertas com preço de **outros** vendedores. */
  competitorCount: number;
  /** As mais baratas primeiro (até `TOP_OFFERS`). `top[0]` é o mais barato. */
  top: CatalogCompetitorOffer[];
  /** Ofertas do próprio vendedor no mesmo produto — não contam como concorrência. */
  ownOfferCount: number;
  /**
   * O mais barato dos **outros** anúncios do próprio vendedor no produto. Não é
   * concorrência, mas é teto prático: se este subir acima dele, a vitrine
   * tende a passar para ele (a venda continua sua, no preço dele).
   */
  ownOther: CatalogOwnOffer | null;
  myLogisticType: string | null;
};

const TOP_OFFERS = 5;

function parsePrice(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) && value > 0 ? value : null;
  if (typeof value === "string") {
    const n = Number(value.replace(",", "."));
    return Number.isFinite(n) && n > 0 ? n : null;
  }
  return null;
}

export function summarizeCatalogCompetitors(args: {
  results: CatalogProductItem[];
  ownSellerId: number | string;
  myItemId: string;
  myLogisticType: string | null;
  fetchedAt: Date;
}): CatalogCompetitionSummary {
  const ownSeller = String(args.ownSellerId);
  const competitors: CatalogCompetitorOffer[] = [];
  let ownOfferCount = 0;
  let ownOther: CatalogOwnOffer | null = null;
  const seen = new Set<string>();

  for (const raw of args.results) {
    const itemId = typeof raw.item_id === "string" ? raw.item_id : null;
    if (!itemId || seen.has(itemId)) continue;
    seen.add(itemId);
    const sellerId =
      raw.seller_id === undefined || raw.seller_id === null ? null : String(raw.seller_id);
    const price = parsePrice(raw.price);
    if (itemId === args.myItemId || sellerId === ownSeller) {
      ownOfferCount += 1;
      if (itemId !== args.myItemId && price !== null && (!ownOther || price < ownOther.price)) {
        ownOther = { itemId, price, logisticType: raw.shipping?.logistic_type ?? null };
      }
      continue;
    }
    if (price === null) continue;
    competitors.push({
      itemId,
      sellerId,
      price,
      logisticType: raw.shipping?.logistic_type ?? null,
      freeShipping:
        typeof raw.shipping?.free_shipping === "boolean" ? raw.shipping.free_shipping : null,
    });
  }

  competitors.sort((a, b) => a.price - b.price || a.itemId.localeCompare(b.itemId));

  return {
    version: 1,
    fetchedAt: args.fetchedAt.toISOString(),
    competitorCount: competitors.length,
    top: competitors.slice(0, TOP_OFFERS),
    ownOfferCount,
    ownOther,
    myLogisticType: args.myLogisticType,
  };
}

function isOffer(value: unknown): value is CatalogCompetitorOffer {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return typeof v.itemId === "string" && typeof v.price === "number" && Number.isFinite(v.price);
}

function parseOwnOffer(value: unknown): CatalogOwnOffer | null {
  if (typeof value !== "object" || value === null) return null;
  const v = value as Record<string, unknown>;
  if (typeof v.itemId !== "string" || typeof v.price !== "number" || !Number.isFinite(v.price)) {
    return null;
  }
  return {
    itemId: v.itemId,
    price: v.price,
    logisticType: typeof v.logisticType === "string" ? v.logisticType : null,
  };
}

/** Lê de volta o JSON gravado (defensivo: formato desconhecido → `null`). */
export function parseCatalogCompetitionSummary(
  value: unknown,
): CatalogCompetitionSummary | null {
  if (typeof value !== "object" || value === null) return null;
  const v = value as Record<string, unknown>;
  if (v.version !== 1 || typeof v.fetchedAt !== "string") return null;
  if (typeof v.competitorCount !== "number" || !Array.isArray(v.top)) return null;
  return {
    version: 1,
    fetchedAt: v.fetchedAt,
    competitorCount: v.competitorCount,
    top: v.top.filter(isOffer).map((offer) => ({
      itemId: offer.itemId,
      sellerId: typeof offer.sellerId === "string" ? offer.sellerId : null,
      price: offer.price,
      logisticType: typeof offer.logisticType === "string" ? offer.logisticType : null,
      freeShipping: typeof offer.freeShipping === "boolean" ? offer.freeShipping : null,
    })),
    ownOfferCount: typeof v.ownOfferCount === "number" ? v.ownOfferCount : 0,
    // Gravado antes deste campo existir → `null` (sem aviso, não inventa).
    ownOther: parseOwnOffer(v.ownOther),
    myLogisticType: typeof v.myLogisticType === "string" ? v.myLogisticType : null,
  };
}

/**
 * Ordem de "quão boa" é a logística para o comprador. O ML não publica o peso
 * de cada uma na disputa do catálogo; isto só serve para avisar quando o
 * concorrente tem entrega melhor que a sua.
 */
const LOGISTIC_RANK: Record<string, number> = {
  fulfillment: 4,
  self_service: 3,
  cross_docking: 2,
  xd_drop_off: 2,
  drop_off: 1,
};

export function logisticRank(logisticType: string | null): number {
  if (!logisticType) return 0;
  return LOGISTIC_RANK[logisticType] ?? 0;
}

const LOGISTIC_LABEL: Record<string, string> = {
  fulfillment: "Full",
  self_service: "Flex",
  cross_docking: "Coleta",
  xd_drop_off: "Agência",
  drop_off: "Agência",
};

export function logisticLabel(logisticType: string | null): string | null {
  if (!logisticType) return null;
  return LOGISTIC_LABEL[logisticType] ?? null;
}
