/**
 * DRE por produto: as auditorias do mês (custo, imposto, receita, tarifa,
 * frete…) são guardadas por anúncio (`item:MLB…`). Na leitura, as linhas das
 * opções de venda (Clássico, Premium… do mesmo produto físico) passam para a
 * chave do anúncio principal e são somadas. Nada é reescrito no mês guardado,
 * e os totais não mudam — só as linhas das opções se juntam.
 */

const ITEM_KEY = /^(item|missing):([^:]+)(::.+)?$/;

/** `item:MLB…` (com sufixo `::leveled`/`::cadastro`) → a mesma chave no principal. */
export function breakdownKeyForProduct(
  key: string,
  principalOf: (mlItemId: string) => string,
): string {
  const match = ITEM_KEY.exec(key);
  if (!match) return key;
  const [, prefix, mlItemId, suffix] = match;
  const principal = principalOf(mlItemId);
  return principal === mlItemId ? key : `${prefix}:${principal}${suffix ?? ""}`;
}

/**
 * Junta as linhas das opções no principal. A linha que já era do principal
 * vem primeiro, para a linha somada ficar com o título e o SKU dele.
 * `merge` é o mesmo somador que junta meses (`mergeLineBreakdowns` etc.).
 */
export function groupBreakdownByProduct<T extends { key: string }>(
  list: T[] | null,
  principalOf: (mlItemId: string) => string,
  merge: (lists: T[][]) => T[],
): T[] | null {
  if (!list) return list;
  let changed = false;
  const mapped = list.map((item) => {
    const key = breakdownKeyForProduct(item.key, principalOf);
    if (key === item.key) return { item, own: true };
    changed = true;
    return { item: { ...item, key }, own: false };
  });
  if (!changed) return list;
  const ordered = [...mapped.filter((m) => m.own), ...mapped.filter((m) => !m.own)].map((m) => m.item);
  return merge([ordered]);
}
