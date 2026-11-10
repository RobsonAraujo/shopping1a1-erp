import { normalizeProductSku } from "@/lib/pricing/product-pricing";

/**
 * "O ML criou um anúncio de catálogo ligado ao seu próprio": o próprio continua
 * existindo, mas as vendas migram para o catálogo. Para avisar isso, cada
 * anúncio de catálogo é ligado ao próprio de onde veio, nesta ordem:
 *
 * 1. `item_relations` (nos dois sentidos) — o vínculo explícito do ML;
 * 2. mesmo `catalog_product_id` de um próprio;
 * 3. mesmo SKU de um único próprio (SKU repetido em vários próprios é ambíguo:
 *    não liga).
 *
 * A ordem precisa ser confirmada com um caso real (ver README da Rotina).
 */

export type LinkCandidate = {
  mlItemId: string;
  catalogListing: boolean;
  sku: string | null;
  catalogProductId: string | null;
  relatedItemIds: readonly string[];
};

function skuKey(sku: string | null): string | null {
  if (!sku) return null;
  const normalized = normalizeProductSku(sku).toUpperCase();
  return normalized || null;
}

/** catálogo → próprio. */
export function resolveCatalogLinks(
  candidates: readonly LinkCandidate[],
): Map<string, string> {
  const own = candidates.filter((candidate) => !candidate.catalogListing);
  const catalog = candidates.filter((candidate) => candidate.catalogListing);
  const ownIds = new Set(own.map((candidate) => candidate.mlItemId));

  const ownByRelated = new Map<string, string>();
  const ownByProduct = new Map<string, string>();
  const ownBySku = new Map<string, string | null>();
  for (const candidate of own) {
    for (const related of candidate.relatedItemIds) {
      if (!ownByRelated.has(related)) ownByRelated.set(related, candidate.mlItemId);
    }
    if (candidate.catalogProductId && !ownByProduct.has(candidate.catalogProductId)) {
      ownByProduct.set(candidate.catalogProductId, candidate.mlItemId);
    }
    const key = skuKey(candidate.sku);
    if (key) {
      // `null` marca SKU ambíguo (mais de um próprio).
      ownBySku.set(key, ownBySku.has(key) ? null : candidate.mlItemId);
    }
  }

  const links = new Map<string, string>();
  for (const candidate of catalog) {
    const explicit = candidate.relatedItemIds.find((id) => ownIds.has(id));
    const reverse = ownByRelated.get(candidate.mlItemId);
    const byProduct = candidate.catalogProductId
      ? ownByProduct.get(candidate.catalogProductId)
      : undefined;
    const key = skuKey(candidate.sku);
    const bySku = key ? ownBySku.get(key) : undefined;

    const ownId = explicit ?? reverse ?? byProduct ?? bySku ?? null;
    if (ownId) links.set(candidate.mlItemId, ownId);
  }
  return links;
}

/**
 * Vínculos que viraram notícia nesta rodada: o catálogo não estava ligado a
 * esse próprio na rodada anterior. Anúncio de catálogo antigo que só agora
 * entrou no radar (criado há mais de `maxAgeDays`) não conta como novo.
 */
export function detectNewCatalogLinks(input: {
  links: ReadonlyMap<string, string>;
  previousLinkByCatalogId: ReadonlyMap<string, string | null>;
  listedAtByCatalogId: ReadonlyMap<string, string | null>;
  now: Date;
  maxAgeDays: number;
}): Array<{ catalogItemId: string; ownItemId: string }> {
  const oldestNew = input.now.getTime() - input.maxAgeDays * 24 * 60 * 60 * 1000;
  const fresh: Array<{ catalogItemId: string; ownItemId: string }> = [];

  for (const [catalogItemId, ownItemId] of input.links) {
    if (input.previousLinkByCatalogId.get(catalogItemId) === ownItemId) continue;
    const listedAt = input.listedAtByCatalogId.get(catalogItemId) ?? null;
    if (listedAt) {
      const listedMs = new Date(listedAt).getTime();
      if (Number.isFinite(listedMs) && listedMs < oldestNew) continue;
    }
    fresh.push({ catalogItemId, ownItemId });
  }
  return fresh;
}
