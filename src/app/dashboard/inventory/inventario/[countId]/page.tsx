import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { Breadcrumbs } from "@/components/shared/Breadcrumbs";
import { StockCountDetailView } from "@/components/stock/StockCountDetailView";
import { getOrganizationContext } from "@/lib/organizations/context";
import { loadStockCount } from "@/lib/stock/stock-counts";
import { loadStockSettings } from "@/lib/stock/stock-page-data";

export const metadata: Metadata = {
  title: "Inventário",
};

export default async function StockCountPage({ params }: { params: Promise<{ countId: string }> }) {
  const orgContext = await getOrganizationContext();
  if (orgContext.status !== "active") return null;
  const organizationId = orgContext.organization.id;
  if (!(await loadStockSettings(organizationId))) redirect("/dashboard/inventory");

  const { countId } = await params;
  const count = await loadStockCount(organizationId, countId);
  if (!count) notFound();

  return (
    <div className="space-y-6">
      <Breadcrumbs
        items={[
          { label: "Estoque", href: "/dashboard/inventory" },
          { label: "Inventário", href: "/dashboard/inventory/inventario" },
          { label: "Contagem" },
        ]}
      />
      <StockCountDetailView count={count} companyName={orgContext.organization.name} />
    </div>
  );
}
