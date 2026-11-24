import type { ListingGroups } from "@/lib/products/listing-groups";

/**
 * Relatório de catálogo por **produto**: as opções de venda (Clássico,
 * Premium…) do mesmo produto concorrem separadas no catálogo, cada uma com
 * o próprio status. A linha do produto mostra o melhor status entre elas, e
 * cada opção continua visível dentro dela. Quando uma opção está ganhando, a
 * outra "perde" para ela — não para um concorrente.
 */

export type CatalogReportListing = {
  mlItemId: string;
  titleSnapshot: string | null;
  skuSnapshot: string | null;
  imageUrlSnapshot: string | null;
  mlStatus: string | null;
  catalogStatus: string | null;
  catalogSellerPrice: number | null;
  catalogPriceToWin: number | null;
  catalogPolledAt: string | null;
  listingTypeId: string | null;
};

export type CatalogReportOption = CatalogReportListing & {
  isPrincipal: boolean;
  /** Outra opção deste produto está ganhando o catálogo. */
  siblingWinning: boolean;
};

export type CatalogReportRow = CatalogReportListing & {
  /** Opções de catálogo do produto (só quando há mais de uma), a da linha primeiro. */
  options?: CatalogReportOption[];
};

const STATUS_RANK: Record<string, number> = { winning: 0, shared: 1, losing: 2 };

function rank(status: string | null): number {
  return status !== null && status in STATUS_RANK ? STATUS_RANK[status] : 3;
}

/** Status de anúncio do produto: ativo se alguma opção está ativa. */
function productMlStatus(listings: readonly CatalogReportListing[]): string | null {
  if (listings.some((l) => (l.mlStatus ?? "active") === "active")) return "active";
  return listings[0]?.mlStatus ?? null;
}

export function groupCatalogReportRows(
  listings: readonly CatalogReportListing[],
  groups: ListingGroups,
): CatalogReportRow[] {
  const byPrincipal = new Map<string, CatalogReportListing[]>();
  for (const listing of listings) {
    const principal = groups.principalOf(listing.mlItemId);
    const list = byPrincipal.get(principal) ?? [];
    list.push(listing);
    byPrincipal.set(principal, list);
  }

  const rows: CatalogReportRow[] = [];
  for (const [principal, members] of byPrincipal) {
    if (members.length === 1) {
      rows.push(members[0]);
      continue;
    }
    const sorted = [...members].sort(
      (a, b) =>
        rank(a.catalogStatus) - rank(b.catalogStatus) ||
        Number(b.mlItemId === principal) - Number(a.mlItemId === principal) ||
        a.mlItemId.localeCompare(b.mlItemId),
    );
    const lead = sorted[0];
    const winners = new Set(sorted.filter((l) => l.catalogStatus === "winning").map((l) => l.mlItemId));
    const principalListing = members.find((l) => l.mlItemId === principal);
    rows.push({
      ...lead,
      // Rótulo do produto: o do cadastro principal quando ele está no catálogo.
      skuSnapshot: principalListing?.skuSnapshot ?? lead.skuSnapshot,
      titleSnapshot: principalListing?.titleSnapshot ?? lead.titleSnapshot,
      imageUrlSnapshot: principalListing?.imageUrlSnapshot ?? lead.imageUrlSnapshot,
      mlStatus: productMlStatus(members),
      options: sorted.map((l) => ({
        ...l,
        isPrincipal: l.mlItemId === principal,
        siblingWinning: [...winners].some((id) => id !== l.mlItemId),
      })),
    });
  }
  return rows;
}
