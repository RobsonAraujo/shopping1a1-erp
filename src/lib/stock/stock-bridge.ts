import { prisma } from "@/lib/db/db";

/**
 * Ponte do estoque automático para os módulos que ainda raciocinam por
 * anúncio com a fórmula `total = estoque do anúncio no ML + galpão`: Compras,
 * Kanban, Insights, detalhe do item e fechamento mensal.
 *
 * - **Organização sem estoque automático:** nada muda (galpão digitado em
 *   `WarehouseStock.quantity`).
 * - **Com estoque automático**, o "galpão" de cada anúncio passa a ser:
 *   - anúncio Full (o ML mostra só o Full): o Em casa inteiro (galpão + depósito);
 *   - anúncio fora do Full (o ML já mostra o depósito): Em casa − depósito, ou
 *     seja, o Galpão de verdade (nunca negativo).
 *   Assim `ML + galpão` dá Em casa + Full disponível nos dois casos, sem
 *   contar o depósito duas vezes — o erro do galpão digitado, que já incluía o
 *   depósito e somava com ele.
 * - **Opções de venda do mesmo item:** só o anúncio principal recebe o saldo;
 *   as outras ficam com 0. O estoque é um só, e somar por anúncio contaria em
 *   dobro (o fechamento mensal agrupa por SKU e soma).
 */

export type BridgeListing = {
  mlItemId: string;
  /** `null` quando quem chama não tem o anúncio do ML: decide pela leitura do Full. */
  isFulfillment: boolean | null;
};

export async function isStockAutomatic(organizationId: string): Promise<boolean> {
  const settings = await prisma.stockSettings.findUnique({
    where: { organizationId },
    select: { organizationId: true },
  });
  return settings != null;
}

/**
 * Galpão por anúncio no estoque automático. `null` = organização sem estoque
 * automático (quem chama usa o galpão digitado). Anúncio fora do mapa = 0.
 */
export async function automaticWarehouseQtyByListing(
  organizationId: string,
  listings: BridgeListing[],
): Promise<Map<string, number> | null> {
  if (!(await isStockAutomatic(organizationId))) return null;
  const result = new Map<string, number>();
  if (listings.length === 0) return result;

  const rows = await prisma.listing.findMany({
    where: { organizationId, mlItemId: { in: listings.map((l) => l.mlItemId) } },
    select: {
      mlItemId: true,
      stockItem: {
        select: {
          id: true,
          primaryMlItemId: true,
          balance: { select: { ownQty: true } },
          mlPosition: { select: { depositQty: true, fullTotalQty: true, fullAvailableQty: true, error: true } },
          listings: { select: { mlItemId: true } },
        },
      },
    },
  });
  const byMlb = new Map(rows.map((r) => [r.mlItemId, r.stockItem]));
  const requested = new Set(listings.map((l) => l.mlItemId));

  for (const listing of listings) {
    const item = byMlb.get(listing.mlItemId);
    if (!item) {
      result.set(listing.mlItemId, 0);
      continue;
    }
    // Principal: o `primaryMlItemId`, ou o primeiro anúncio do item pedido aqui
    // (quando o principal não está nesta consulta, o saldo não pode sumir).
    const primary =
      item.primaryMlItemId && requested.has(item.primaryMlItemId)
        ? item.primaryMlItemId
        : item.listings.map((l) => l.mlItemId).find((id) => requested.has(id));
    if (primary !== listing.mlItemId) {
      result.set(listing.mlItemId, 0);
      continue;
    }
    const own = item.balance?.ownQty ?? 0;
    const pos = item.mlPosition;
    const isFull =
      listing.isFulfillment ??
      ((pos?.fullTotalQty ?? 0) > 0 || (pos?.fullAvailableQty ?? 0) > 0);
    const deposit = pos && !pos.error ? (pos.depositQty ?? 0) : 0;
    result.set(listing.mlItemId, isFull ? own : Math.max(0, own - deposit));
  }
  return result;
}

/**
 * Anúncios principais de itens com saldo Em casa (para manter no Kanban/Compras
 * um anúncio encerrado que ainda tem estoque). Vazio sem estoque automático.
 */
export async function listingIdsWithOwnStock(organizationId: string): Promise<string[]> {
  if (!(await isStockAutomatic(organizationId))) return [];
  const balances = await prisma.stockBalance.findMany({
    where: { organizationId, ownQty: { not: 0 } },
    select: { stockItem: { select: { primaryMlItemId: true } } },
  });
  return balances
    .map((b) => b.stockItem.primaryMlItemId)
    .filter((id): id is string => Boolean(id));
}

/**
 * Sobrepõe o galpão automático num mapa `mlItemId → { quantity, … }` já
 * carregado de `WarehouseStock` (mantém prazo de compra, cobertura etc.).
 * Sem estoque automático (`auto = null`), não mexe em nada.
 */
export function overlayAutomaticWarehouse<T extends { quantity: number }>(
  byId: Record<string, T>,
  auto: Map<string, number> | null,
  empty: () => T,
): void {
  if (!auto) return;
  for (const [mlItemId, quantity] of auto) {
    byId[mlItemId] = { ...(byId[mlItemId] ?? empty()), quantity };
  }
}
