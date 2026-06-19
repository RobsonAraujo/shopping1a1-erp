import { normalizeProductSku } from "@/lib/product-pricing";

export type SkuAliasMap = Map<string, string>;

function normalizeSkuKey(sku: string): string {
  return normalizeProductSku(sku);
}

export function resolveCanonicalSku(
  sku: string | null | undefined,
  aliasMap?: SkuAliasMap,
): string {
  const normalized = sku ? normalizeSkuKey(sku) : "";
  if (!normalized) return "";
  if (!aliasMap) return normalized;
  return aliasMap.get(normalized) ?? normalized;
}

export function getAliasSkusForCanonical(
  canonicalSku: string,
  aliasMap?: SkuAliasMap,
): string[] {
  const canonical = normalizeSkuKey(canonicalSku);
  if (!aliasMap || !canonical) return [];
  return [...aliasMap.entries()]
    .filter(([, target]) => target === canonical)
    .map(([alias]) => alias)
    .sort((a, b) => a.localeCompare(b, "pt-BR", { sensitivity: "base" }));
}

export function expandSkuGroup(
  sku: string | null | undefined,
  aliasMap?: SkuAliasMap,
): string[] {
  const canonical = resolveCanonicalSku(sku, aliasMap);
  if (!canonical) return [];
  const aliases = getAliasSkusForCanonical(canonical, aliasMap);
  return [canonical, ...aliases.filter((alias) => alias !== canonical)];
}

export function skuMatchesGroup(
  sku: string | null | undefined,
  groupSku: string | null | undefined,
  aliasMap?: SkuAliasMap,
): boolean {
  const target = resolveCanonicalSku(groupSku, aliasMap);
  if (!target) return false;
  return expandSkuGroup(target, aliasMap).includes(normalizeSkuKey(sku ?? ""));
}

/** Indexa valores por SKU de entrada (incluindo aliases) apontando para o canônico. */
export function indexBySkuWithAliases<T>(
  valuesByCanonical: Map<string, T>,
  requestedSkus: string[],
  aliasMap?: SkuAliasMap,
): Map<string, T> {
  const map = new Map<string, T>();
  for (const sku of requestedSkus) {
    const normalized = normalizeSkuKey(sku);
    if (!normalized) continue;
    const canonical = resolveCanonicalSku(normalized, aliasMap);
    const value = valuesByCanonical.get(canonical);
    if (value !== undefined) {
      map.set(normalized, value);
    }
  }
  return map;
}
