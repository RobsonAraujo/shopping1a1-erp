import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { StockEntriesView } from "@/components/stock/StockEntriesView";
import { StockPageHeader } from "@/components/stock/StockPageHeader";
import { StockTabsNav } from "@/components/stock/StockTabsNav";
import { getOrganizationContext } from "@/lib/organizations/context";
import {
  loadOpenStockReviews,
  loadStockEntries,
  loadStockItemOptions,
  loadStockSettings,
  loadSupplierOptions,
} from "@/lib/stock/stock-page-data";

export const metadata: Metadata = {
  title: "Entradas de estoque",
};

export default async function StockEntriesPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const orgContext = await getOrganizationContext();
  if (orgContext.status !== "active") return null;
  const organizationId = orgContext.organization.id;
  if (!(await loadStockSettings(organizationId))) redirect("/dashboard/inventory");

  const sp = await searchParams;
  const [entries, items, suppliers, reviews] = await Promise.all([
    loadStockEntries(organizationId),
    loadStockItemOptions(organizationId),
    loadSupplierOptions(organizationId),
    loadOpenStockReviews(organizationId),
  ]);

  return (
    <div className="space-y-6">
      <StockPageHeader subtitle="Mercadoria que chegou no galpão. Com custo novo, ele só passa a valer depois que o estoque anterior for vendido." />
      <StockTabsNav active="entradas" pendingCount={reviews.length} />
      <StockEntriesView entries={entries} items={items} suppliers={suppliers} openForm={sp.nova === "1"} />
    </div>
  );
}
