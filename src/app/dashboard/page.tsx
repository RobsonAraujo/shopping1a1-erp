import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { stockPlanningConfig } from "@/config/stock-planning";
import { DashboardOperationsSummary } from "@/components/dashboard-operations-summary";
import { DashboardItemsTable } from "@/components/dashboard-items-table";
import { CollapsibleDashboardSection } from "@/components/collapsible-dashboard-section";
import { Card, CardContent } from "@/components/ui/card";
import {
  fetchOperationalListings,
  fetchUnitsSoldForItemsInWindowBatched,
} from "@/lib/mercadolibre/api";
import {
  getSessionAccessState,
  readSession,
  refreshSessionPath,
} from "@/lib/mercadolibre/session";
import { countListingsByStatus } from "@/lib/mercadolibre/listing-status";
import { loadOperationsSummary } from "@/lib/replenishment-cycle-data";
import type { OperationsSummaryCounts } from "@/lib/replenishment-cycle";

export default async function DashboardPage() {
  const cookieStore = await cookies();
  const session = getSessionAccessState(cookieStore);
  if (session.needsRefresh) {
    redirect(refreshSessionPath("/dashboard"));
  }
  const token = session.accessToken;
  const { userId } = readSession(cookieStore);

  if (!token || userId === undefined) {
    return null;
  }

  const windowDays = stockPlanningConfig.salesAverageWindowDays;
  const dateField = stockPlanningConfig.salesWindowDateField;

  let items;
  let salesByItem: Record<string, number> = {};
  let operationsSummary: OperationsSummaryCounts | null = null;

  try {
    const allItems = await fetchOperationalListings(token, userId);
    const allIds = allItems.map((item) => item.id);
    const [allSales] = await Promise.all([
        fetchUnitsSoldForItemsInWindowBatched(
          token,
          userId,
          allIds,
          windowDays,
          dateField,
        ),
    ]);

    items = allItems;
    salesByItem = allSales;
    operationsSummary = await loadOperationsSummary(token, userId);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Erro ao carregar anúncios";
    return (
      <Card className="border-red-200 bg-red-50/50">
        <CardContent className="pt-6 text-red-900">{msg}</CardContent>
      </Card>
    );
  }

  const total = items.length;
  const statusCounts = countListingsByStatus(items);

  const catalogItems = items.filter((i) => i.catalog_listing === true);
  const ownItems = items.filter((i) => i.catalog_listing !== true);
  const w = stockPlanningConfig.salesAverageWindowDays;

  return (
    <div className="space-y-10">
      {operationsSummary ? (
        <DashboardOperationsSummary summary={operationsSummary} />
      ) : (
        <Card className="border-amber-200 bg-amber-50/50">
          <CardContent className="pt-6 text-sm text-amber-950">
            Não foi possível carregar o resumo de operações. Atualize a página
            ou tente de novo em instantes.
          </CardContent>
        </Card>
      )}

      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-[var(--primary)]">
            Anúncios
          </h1>
          <p className="mt-2 max-w-3xl text-[15px] leading-relaxed text-[var(--muted-foreground)]">
            {total} anúncio{total !== 1 ? "s" : ""} no total
            {statusCounts.paused > 0
              ? ` (${statusCounts.paused} pausado${statusCounts.paused !== 1 ? "s" : ""} no ML)`
              : ""}
            .{" "}
            {catalogItems.length === 1
              ? "1 anúncio do catálogo"
              : `${catalogItems.length} anúncios do catálogo`}
            {" · "}
            {ownItems.length === 1
              ? "1 anúncio próprio"
              : `${ownItems.length} anúncios próprios`}
            . Projeções usam vendas dos últimos {w} dias (pedidos exceto
            cancelados
            {/* janela por{" "}
            {stockPlanningConfig.salesWindowDateField === "date_closed"
              ? "data de fechamento do pedido"
              : "data de criação do pedido"} */}
            {/* ; soma de{" "} */}
            {/* <code className="rounded-md bg-[var(--muted)] px-1.5 py-0.5 font-mono text-[13px] text-[var(--foreground)]">
              quantity
            </code>{" "}
            em{" "}
            <code className="rounded-md bg-[var(--muted)] px-1.5 py-0.5 font-mono text-[13px] text-[var(--foreground)]">
              order_items
            </code>{" "}
            via{" "} */}
            {/* <code className="rounded-md bg-[var(--muted)] px-1.5 py-0.5 font-mono text-[13px] text-[var(--foreground)]">
              orders/search?item=id
            </code> */}
            ).
          </p>
        </div>

        <CollapsibleDashboardSection
          title="Anúncios próprios"
          summary={`${ownItems.length} ${
            ownItems.length === 1 ? "anúncio próprio" : "anúncios próprios"
          }`}
        >
          <DashboardItemsTable items={ownItems} salesByItem={salesByItem} />
        </CollapsibleDashboardSection>

        <CollapsibleDashboardSection
          title="Anúncios do catálogo"
          summary={`${catalogItems.length} ${
            catalogItems.length === 1
              ? "anúncio do catálogo"
              : "anúncios do catálogo"
          }`}
        >
          <DashboardItemsTable items={catalogItems} salesByItem={salesByItem} />
        </CollapsibleDashboardSection>
      </div>
    </div>
  );
}
