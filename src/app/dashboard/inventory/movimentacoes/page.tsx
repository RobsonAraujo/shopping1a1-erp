import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { StockExitButton } from "@/components/stock/StockExitForm";
import { StockMovementsView } from "@/components/stock/StockMovementsView";
import { MOVEMENT_GROUPS, type MovementGroup } from "@/lib/stock/stock-movement-groups";
import { StockPageHeader } from "@/components/stock/StockPageHeader";
import { StockReviewsPanel } from "@/components/stock/StockReviewsPanel";
import { StockTabsNav } from "@/components/stock/StockTabsNav";
import { reportsConfig } from "@/config/reports";
import { getOrganizationContext } from "@/lib/organizations/context";
import { zonedLocalToUtc } from "@/lib/report-timezone";
import {
  loadOpenStockReviews,
  loadStockItemOptions,
  loadStockMovements,
  loadStockSettings,
} from "@/lib/stock/stock-page-data";

export const metadata: Metadata = {
  title: "Movimentações de estoque",
};

function one(value: string | string[] | undefined): string {
  return typeof value === "string" ? value : "";
}

function ymdToDate(ymd: string, endOfDay: boolean): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return null;
  const [y, m, d] = ymd.split("-").map(Number);
  return endOfDay
    ? zonedLocalToUtc(y, m, d, 23, 59, 59, 999, reportsConfig.catalogCompetitionTimezone)
    : zonedLocalToUtc(y, m, d, 0, 0, 0, 0, reportsConfig.catalogCompetitionTimezone);
}

export default async function StockMovementsPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const orgContext = await getOrganizationContext();
  if (orgContext.status !== "active") return null;
  const organizationId = orgContext.organization.id;
  if (!(await loadStockSettings(organizationId))) redirect("/dashboard/inventory");

  const sp = await searchParams;
  const groupParam = one(sp.type);
  const group: MovementGroup = groupParam in MOVEMENT_GROUPS ? (groupParam as MovementGroup) : "all";
  const location = one(sp.location) === "own" || one(sp.location) === "full" ? (one(sp.location) as "own" | "full") : null;
  const filters = {
    item: one(sp.item),
    group,
    location: location ?? "",
    from: one(sp.from),
    to: one(sp.to),
  };

  const [movements, reviews, items] = await Promise.all([
    loadStockMovements({
      organizationId,
      stockItemId: filters.item || null,
      types: MOVEMENT_GROUPS[group].types,
      location,
      from: ymdToDate(filters.from, false),
      to: ymdToDate(filters.to, true),
      limit: 200,
      cursor: one(sp.before) || null,
    }),
    loadOpenStockReviews(organizationId),
    loadStockItemOptions(organizationId),
  ]);
  const itemOptions = items.map((i) => ({ stockItemId: i.stockItemId, title: i.title, sku: i.sku }));

  return (
    <div className="space-y-6">
      <StockPageHeader
        subtitle="Extrato de cada entrada e saída: vendas por canal, envios ao Full, devoluções, ajustes. Nada é sobrescrito."
        actions={
          <StockExitButton
            items={items.map((i) => ({ stockItemId: i.stockItemId, title: i.title, sku: i.sku, ownQty: i.ownQty }))}
          />
        }
      />
      <StockTabsNav active="movimentacoes" pendingCount={reviews.length} />
      <StockReviewsPanel reviews={reviews} items={itemOptions} />
      <StockMovementsView rows={movements.rows} items={itemOptions} filters={filters} nextCursor={movements.nextCursor} />
    </div>
  );
}
