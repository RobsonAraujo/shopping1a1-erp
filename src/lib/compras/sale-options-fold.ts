import { isFulfillmentListing } from "@/lib/mercadolibre/fulfillment-stock";
import { mlAvailableStockUnits } from "@/lib/mercadolibre/ml-available-stock";
import type { ItemBody } from "@/lib/mercadolibre/types";
import type { ListingGroups, ListingOption } from "@/lib/products/listing-groups";

/**
 * Opções de venda em Compras, Operações Full e Insights: o planejamento é do
 * **produto físico**, não do anúncio.
 *
 * Antes, cada opção (Clássico, Premium…) era planejada sozinha: usava o
 * estoque do ML inteiro (as opções informam o mesmo estoque, que é do
 * produto) com só a venda dela. A cobertura saía inflada, a compra era
 * sugerida tarde e podia haver dois cards do mesmo produto. Aqui os anúncios
 * do mesmo produto viram um só, na **chave do board**:
 *
 * - a chave é o anúncio principal (`listing-groups.ts`) quando ele está entre
 *   os anúncios lidos; senão, a primeira opção lida (o card precisa de um
 *   anúncio de verdade para título, foto e link);
 * - a venda é a soma das opções;
 * - o estoque do ML entra uma vez por "lugar": o Full (as opções Full
 *   dividem o mesmo inventário) e o depósito (as opções fora do Full dividem
 *   o mesmo estoque do vendedor). Só um produto com opção Full **e** opção
 *   fora do Full soma os dois;
 * - o galpão digitado (sem o estoque automático) é somado, como fez a
 *   ativação do Estoque (`stock-opening.ts`); com o estoque automático ele
 *   sai do livro, só para a chave.
 *
 * Anúncio com variações (modelo antigo) não é juntado: o estoque dele é por
 * variação, não do produto.
 */

export type SaleOptionsFold = {
  /** Um anúncio por produto físico: o corpo da chave, com o estoque do ML do produto. */
  items: ItemBody[];
  /** Chave do board de um MLB (o próprio quando não é opção de um produto juntado). */
  keyOf(mlItemId: string): string;
  /** MLBs lidos do produto da chave (a chave primeiro). */
  membersOf(key: string): string[];
  /** Todas as opções lidas estão no Full (decide a regra do galpão automático). */
  allFulfillment(key: string): boolean;
  /** Opções de venda do produto, para as etiquetas do card (só quando há mais de uma). */
  optionsOf(key: string): ListingOption[] | undefined;
};

function hasVariations(item: ItemBody): boolean {
  return Array.isArray(item.variations) && item.variations.length > 0;
}

/** Estoque do ML do produto: o Full uma vez e o depósito uma vez. */
export function pooledMlStock(members: readonly ItemBody[]): number {
  let full = 0;
  let seller = 0;
  for (const item of members) {
    const qty = mlAvailableStockUnits(item);
    if (isFulfillmentListing(item)) full = Math.max(full, qty);
    else seller = Math.max(seller, qty);
  }
  return full + seller;
}

export function foldSaleOptions(items: readonly ItemBody[], groups: ListingGroups): SaleOptionsFold {
  const byPrincipal = new Map<string, ItemBody[]>();
  for (const item of items) {
    if (!item.id) continue;
    const principal = groups.principalOf(item.id);
    const list = byPrincipal.get(principal) ?? [];
    list.push(item);
    byPrincipal.set(principal, list);
  }

  const keyById = new Map<string, string>();
  const membersByKey = new Map<string, ItemBody[]>();
  const optionsByKey = new Map<string, ListingOption[]>();
  const folded: ItemBody[] = [];

  for (const [principal, members] of byPrincipal) {
    if (members.length === 1 || members.some(hasVariations)) {
      for (const item of members) {
        keyById.set(item.id, item.id);
        membersByKey.set(item.id, [item]);
        folded.push(item);
        const options = groups.optionsOf(item.id);
        if (options.length > 1) optionsByKey.set(item.id, options);
      }
      continue;
    }
    const options = groups.optionsOf(principal);
    const order = new Map(options.map((o, index) => [o.mlItemId, index]));
    const sorted = [...members].sort(
      (a, b) =>
        Number(b.id === principal) - Number(a.id === principal) ||
        (order.get(a.id) ?? 99) - (order.get(b.id) ?? 99) ||
        a.id.localeCompare(b.id),
    );
    const key = sorted[0].id;
    for (const item of sorted) keyById.set(item.id, key);
    membersByKey.set(key, sorted);
    optionsByKey.set(key, options);
    // Corpo real da chave; só o estoque do ML passa a ser o do produto
    // (sem variações, então `available_quantity` é o número que vale).
    folded.push({ ...sorted[0], available_quantity: pooledMlStock(sorted) });
  }

  return {
    items: folded,
    keyOf: (mlItemId) => keyById.get(mlItemId) ?? mlItemId,
    membersOf: (key) => (membersByKey.get(key) ?? []).map((item) => item.id),
    allFulfillment: (key) => (membersByKey.get(key) ?? []).every((item) => isFulfillmentListing(item)),
    optionsOf: (key) => optionsByKey.get(key),
  };
}

/** Venda do produto = soma das opções lidas. */
export function foldSalesByKey(
  salesByItem: Record<string, number>,
  fold: SaleOptionsFold,
): Record<string, number> {
  const result: Record<string, number> = {};
  for (const item of fold.items) {
    const members = fold.membersOf(item.id);
    const known = members.filter((id) => id in salesByItem);
    if (known.length === 0) continue;
    result[item.id] = known.reduce((sum, id) => sum + (salesByItem[id] ?? 0), 0);
  }
  return result;
}

/**
 * Galpão digitado e prazos por chave (organização **sem** o estoque
 * automático): quantidade somada entre as opções; prazo de compra e
 * cobertura-alvo da chave, senão de qualquer opção que tenha.
 */
export function foldWarehouseByKey<
  T extends { quantity: number; purchaseLeadTimeDays: number | null; targetCoverageDays?: number | null },
>(warehouseById: Record<string, T>, fold: SaleOptionsFold): Record<string, T> {
  const result: Record<string, T> = {};
  for (const item of fold.items) {
    const members = fold.membersOf(item.id);
    const rows = members.map((id) => warehouseById[id]).filter((row): row is T => Boolean(row));
    if (rows.length === 0) continue;
    const own = warehouseById[item.id];
    const base = own ?? rows[0];
    result[item.id] = {
      ...base,
      quantity: rows.reduce((sum, row) => sum + row.quantity, 0),
      purchaseLeadTimeDays:
        own?.purchaseLeadTimeDays ?? rows.find((row) => row.purchaseLeadTimeDays != null)?.purchaseLeadTimeDays ?? null,
      ...("targetCoverageDays" in base
        ? {
            targetCoverageDays:
              own?.targetCoverageDays ??
              rows.find((row) => row.targetCoverageDays != null)?.targetCoverageDays ??
              null,
          }
        : {}),
    };
  }
  return result;
}
