import type { FinancialEvaluationRow } from "@/lib/lucratividade/financial-evaluation-data";

/**
 * Recorte da Lucratividade por tipo de anúncio. O anúncio de catálogo tem MLB
 * próprio no ML e os pedidos apontam pra ele, então cada venda cai em um só
 * recorte — Próprios + Catálogo = Todos.
 */
export type ListingSegment = "all" | "own" | "catalog";

export const LISTING_SEGMENT_LABEL: Record<ListingSegment, string> = {
  all: "Todos",
  own: "Próprios",
  catalog: "Catálogo",
};

type SegmentRow = Pick<FinancialEvaluationRow, "catalogListing">;

export function rowInSegment(row: SegmentRow, segment: ListingSegment): boolean {
  if (segment === "all") return true;
  return segment === "catalog" ? row.catalogListing : !row.catalogListing;
}

export function filterRowsBySegment<T extends SegmentRow>(
  rows: T[],
  segment: ListingSegment,
): T[] {
  if (segment === "all") return rows;
  return rows.filter((row) => rowInSegment(row, segment));
}
