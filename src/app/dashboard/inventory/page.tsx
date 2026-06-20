import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { stockPlanningConfig } from "@/config/stock-planning";
import { InventoryStockTable, type InventoryRow } from "@/components/inventory-stock-table";
import { Card, CardContent } from "@/components/ui/card";
import {
  enrichItemsWithFulfillmentStock,
  fetchOperationalListings,
  fetchUnitsSoldForItemsInWindowBatched,
} from "@/lib/mercadolibre/api";
import { isFulfillmentListing } from "@/lib/mercadolibre/fulfillment-stock";
import { mlAvailableStockUnits } from "@/lib/mercadolibre/ml-available-stock";
import { bestItemImageUrl } from "@/lib/mercadolibre/item-image";
import { getItemSku } from "@/lib/mercadolibre/item-sku";
import { countListingsByStatus } from "@/lib/mercadolibre/listing-status";
import { computeStockPlanningDisplay } from "@/lib/stock-planning";
import { loadStockReportProductsBySku } from "@/lib/product-data";
import type { StockReportProductInfo } from "@/lib/inventory-stock-report";
import { prisma } from "@/lib/db";
import {
  getSessionAccessState,
  readSession,
  refreshSessionPath,
} from "@/lib/mercadolibre/session";

function stockUnits(value: number | null | undefined): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return 0;
  return Math.max(0, Math.floor(value));
}

export default async function InventoryPage() {

  const cookieStore = await cookies();
  const session = getSessionAccessState(cookieStore);
  if (session.needsRefresh) {
    redirect(refreshSessionPath("/dashboard/inventory"));
  }
  const token = session.accessToken;
  const { userId } = readSession(cookieStore);

  if (!token || userId === undefined) {
    return null;
  }

  let total = 0;
  let statusCounts = { active: 0, paused: 0, other: 0 };
  let warehouseLoadFailed = false;
  let productsBySku: Record<string, StockReportProductInfo> = {};
  let rows: InventoryRow[] = [];

  try {
    const items = await fetchOperationalListings(token, userId);
    const fulfillmentStockByItem = await enrichItemsWithFulfillmentStock(
      token,
      items,
    );
    const allIds = items.map((item) => item.id);
    const salesByItem = await fetchUnitsSoldForItemsInWindowBatched(
      token,
      userId,
      allIds,
      stockPlanningConfig.salesAverageWindowDays,
      stockPlanningConfig.salesWindowDateField,
    );
    const ids = items.map((i) => i.id);

    let warehouseById: Record<string, number> = {};
    let leadTimeById: Record<string, number | null> = {};
    try {
      const stocks = await prisma.warehouseStock.findMany({
        where: { mlItemId: { in: ids } },
        select: {
          mlItemId: true,
          quantity: true,
          purchaseLeadTimeDays: true,
        },
      });
      warehouseById = Object.fromEntries(
        stocks.map((s) => [s.mlItemId, s.quantity]),
      );
      leadTimeById = Object.fromEntries(
        stocks.map((s) => [s.mlItemId, s.purchaseLeadTimeDays]),
      );
    } catch {
      warehouseLoadFailed = true;
    }

    rows = items.map((item) => ({
      ...(() => {
        const mlStock = mlAvailableStockUnits(item);
        const warehouseStock = warehouseById[item.id] ?? 0;
        const fulfillment = fulfillmentStockByItem.get(item.id);
        const isFulfillment = isFulfillmentListing(item);
        const mlProcessTransfer = stockUnits(fulfillment?.inTransfer);
        const mlProcessInternal = stockUnits(fulfillment?.internalProcess);
        const mlStockOnTheWay = isFulfillment
          ? stockUnits(fulfillment?.inProcess)
          : 0;
        const purchaseLeadTimeDays = leadTimeById[item.id] ?? 0;
        const sold = salesByItem[item.id] ?? 0;
        const plan = computeStockPlanningDisplay(
          mlStock + warehouseStock + mlStockOnTheWay,
          sold,
          stockPlanningConfig.salesAverageWindowDays,
          stockPlanningConfig,
          purchaseLeadTimeDays,
        );
        return {
          mlStock,
          warehouseStock,
          isFulfillment,
          mlStockOnTheWay,
          mlProcessTransfer,
          mlProcessInternal,
          leadTimeDays: leadTimeById[item.id] ?? null,
          needsPurchaseAttention: plan.needsPurchaseAttention,
        };
      })(),
      mlItemId: item.id,
      sku: getItemSku(item),
      title: item.title,
      imageUrl: bestItemImageUrl(item),
      mlStatus: item.status,
      catalogListing: item.catalog_listing === true,
    }));

    total = items.length;
    statusCounts = countListingsByStatus(items);

    const skus = rows
      .map((row) => row.sku)
      .filter((sku): sku is string => Boolean(sku?.trim()));
    productsBySku = await loadStockReportProductsBySku(skus);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Erro ao carregar anúncios";
    return (
      <Card className="border-red-200 bg-red-50/50">
        <CardContent className="pt-6 text-red-900">{msg}</CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-[var(--primary)]">
          Estoque
        </h1>
        <p className="mt-2 max-w-3xl text-[15px] leading-relaxed text-[var(--muted-foreground)]">
          Anúncios <strong>ativos e pausados</strong> no Mercado Livre (pausados
          aparecem com aviso). Estoque no <strong>galpão</strong>, no{" "}
          <strong>Full</strong> (já liberado para venda), <strong>a caminho</strong>{" "}
          (transferência e processamento interno via API) e total geral. O
          &quot;a caminho&quot; pode ser menor que no painel do Meli quando há{" "}
          <strong>entrada pendente</strong> não exposta pela API.{" "}
          <strong>Editar</strong> ajusta só o galpão;{" "}
          <strong>Configurações</strong> define o prazo compra → galpão.
        </p>
      </div>

      {warehouseLoadFailed ? (
        <Card className="border-amber-200 bg-amber-50/50">
          <CardContent className="pt-6 text-sm text-amber-950">
            Não foi possível ler o estoque do galpão (PostgreSQL). As colunas do
            galpão aparecem como zero; confira o banco e o{" "}
            <code className="rounded bg-amber-100/80 px-1 font-mono text-xs">
              DATABASE_URL
            </code>
            .
          </CardContent>
        </Card>
      ) : null}

      <InventoryStockTable rows={rows} productsBySku={productsBySku} />

      <Card>
        <CardContent className="p-4 text-sm text-[var(--muted-foreground)] sm:py-4">
          {total} anúncio{total !== 1 ? "s" : ""} no total
          {statusCounts.paused > 0
            ? ` · ${statusCounts.active} ativo${statusCounts.active !== 1 ? "s" : ""} · ${statusCounts.paused} pausado${statusCounts.paused !== 1 ? "s" : ""}`
            : null}
        </CardContent>
      </Card>
    </div>
  );
}
