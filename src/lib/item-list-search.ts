export type ItemListSearchFields = {
  sku?: string | null;
  title?: string | null;
  mlItemId?: string | null;
  extra?: Array<string | null | undefined>;
};

export function normalizeItemListSearchQuery(query: string): string {
  return query.trim().toLowerCase();
}

export function matchesItemListSearch(
  query: string,
  fields: ItemListSearchFields,
): boolean {
  const normalized = normalizeItemListSearchQuery(query);
  if (!normalized) return true;

  const haystack = [
    fields.sku,
    fields.title,
    fields.mlItemId,
    ...(fields.extra ?? []),
  ]
    .filter((value): value is string => Boolean(value))
    .join(" ")
    .toLowerCase();

  return haystack.includes(normalized);
}

export function filterByItemListSearch<T>(
  items: T[],
  query: string,
  getFields: (item: T) => ItemListSearchFields,
): T[] {
  if (!normalizeItemListSearchQuery(query)) return items;
  return items.filter((item) => matchesItemListSearch(query, getFields(item)));
}
