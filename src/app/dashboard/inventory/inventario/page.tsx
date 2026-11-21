import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { StockCountsView } from "@/components/stock/StockCountsView";
import { StockPageHeader } from "@/components/stock/StockPageHeader";
import { StockTabsNav } from "@/components/stock/StockTabsNav";
import { getOrganizationContext } from "@/lib/organizations/context";
import { loadStockCounts } from "@/lib/stock/stock-counts";
import { loadOpenStockReviews, loadStockOverview, loadStockSettings } from "@/lib/stock/stock-page-data";

export const metadata: Metadata = {
  title: "Inventário",
};

export default async function StockCountsPage() {
  const orgContext = await getOrganizationContext();
  if (orgContext.status !== "active") return null;
  const organizationId = orgContext.organization.id;
  if (!(await loadStockSettings(organizationId))) redirect("/dashboard/inventory");

  const [counts, overview, reviews] = await Promise.all([
    loadStockCounts(organizationId),
    loadStockOverview(organizationId),
    loadOpenStockReviews(organizationId),
  ]);
  const suppliers = [...new Set((overview?.rows ?? []).map((r) => r.supplierName))].sort((a, b) =>
    a.localeCompare(b, "pt-BR"),
  );

  return (
    <div className="space-y-6">
      <StockPageHeader subtitle="Conferência física mensal: folha para a prancheta, digitação do que foi encontrado e ajuste com aprovação." />
      <StockTabsNav active="inventario" pendingCount={reviews.length} />
      <StockCountsView counts={counts} suppliers={suppliers} />
    </div>
  );
}
