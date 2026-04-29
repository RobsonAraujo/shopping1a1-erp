import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { stockPlanningConfig } from "@/config/stock-planning";
import {
  DashboardAttentionPanel,
  type StockAttentionAcknowledgementView,
} from "@/components/dashboard-attention-panel";
import { DashboardItemsTable } from "@/components/dashboard-items-table";
import { Card, CardContent } from "@/components/ui/card";
import {
  fetchAllUserItemIds,
  fetchItemsByIdsBatched,
  fetchUnitsSoldForItemsInWindowBatched,
} from "@/lib/mercadolibre/api";
import { prisma } from "@/lib/db";
import {
  getSessionAccessState,
  readSession,
  refreshSessionPath,
} from "@/lib/mercadolibre/session";
import type { ItemBody } from "@/lib/mercadolibre/types";

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
  let purchaseLeadTimeByItem: Record<string, number | null> = {};
  let warehouseStockByItem: Record<string, number> = {};
  let acknowledgements: StockAttentionAcknowledgementView[] = [];
  let attentionSnapshot: {
    items: ItemBody[];
    salesByItem: Record<string, number>;
    purchaseLeadTimeByItem: Record<string, number | null>;
    warehouseStockByItem: Record<string, number>;
    acknowledgements: StockAttentionAcknowledgementView[];
  } | null = null;

  try {
    const allIds = await fetchAllUserItemIds(token, userId);
    const [allItems, allSales, warehouseStocks, stockAttentionAcks] =
      await Promise.all([
        fetchItemsByIdsBatched(token, allIds),
        fetchUnitsSoldForItemsInWindowBatched(
          token,
          userId,
          allIds,
          windowDays,
          dateField,
        ),
        prisma.warehouseStock.findMany({
          where: { mlItemId: { in: allIds } },
          select: { mlItemId: true, purchaseLeadTimeDays: true, quantity: true },
        }),
        prisma.stockAttentionAcknowledgement.findMany({
          where: { mlItemId: { in: allIds } },
          select: {
            mlItemId: true,
            kind: true,
            mlAvailableQuantity: true,
            warehouseQuantity: true,
            purchaseLeadTimeDays: true,
          },
        }),
      ]);

    purchaseLeadTimeByItem = Object.fromEntries(
      warehouseStocks.map((s) => [s.mlItemId, s.purchaseLeadTimeDays]),
    );
    warehouseStockByItem = Object.fromEntries(
      warehouseStocks.map((s) => [s.mlItemId, s.quantity]),
    );
    items = allItems;
    salesByItem = allSales;
    acknowledgements = stockAttentionAcks;
    attentionSnapshot = {
      items: allItems,
      salesByItem: allSales,
      purchaseLeadTimeByItem,
      warehouseStockByItem,
      acknowledgements,
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Erro ao carregar anúncios";
    return (
      <Card className="border-red-200 bg-red-50/50">
        <CardContent className="pt-6 text-red-900">{msg}</CardContent>
      </Card>
    );
  }

  const total = items.length;

  const catalogItems = items.filter((i) => i.catalog_listing === true);
  const ownItems = items.filter((i) => i.catalog_listing !== true);
  const w = stockPlanningConfig.salesAverageWindowDays;

  return (
    <div className="space-y-10">
      {attentionSnapshot ? (
        <DashboardAttentionPanel
          items={attentionSnapshot.items}
          salesByItem={attentionSnapshot.salesByItem}
          purchaseLeadTimeByItem={attentionSnapshot.purchaseLeadTimeByItem}
          warehouseStockByItem={attentionSnapshot.warehouseStockByItem}
          acknowledgements={attentionSnapshot.acknowledgements}
        />
      ) : (
        <Card className="border-amber-200 bg-amber-50/50">
          <CardContent className="pt-6 text-sm text-amber-950">
            Não foi possível carregar o painel de prioridades. Atualize a página
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
            {total} anúncio{total !== 1 ? "s" : ""} no total.{" "}
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

        <section className="space-y-3">
          <h2 className="text-lg font-semibold text-[var(--primary)]">
            Anúncios próprios
          </h2>
          <DashboardItemsTable items={ownItems} salesByItem={salesByItem} />
        </section>

        <section className="space-y-3">
          <h2 className="text-lg font-semibold text-[var(--primary)]">
            Anúncios do catálogo
          </h2>
          <DashboardItemsTable items={catalogItems} salesByItem={salesByItem} />
        </section>
      </div>
    </div>
  );
}
