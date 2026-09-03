import type { Metadata } from "next";
import { Suspense } from "react";
import { cookies } from "next/headers";
import { InventoryStockTable, type InventoryRow } from "@/components/inventory/InventoryStockTable";
import { InventoryStockTableSkeleton } from "@/components/inventory/InventoryStockTableSkeleton";
import { Card, CardContent } from "@/components/ui/card";
import { UserFeedback } from "@/components/ui/user-feedback";
import {
  enrichItemsWithFulfillmentStock,
  fetchOperationalListings,
  fetchUnitsSoldForItemsInWindowBatched,
} from "@/lib/mercadolibre/api";
import { isFulfillmentListing } from "@/lib/mercadolibre/fulfillment-stock";
import { mlAvailableStockUnits } from "@/lib/mercadolibre/ml-available-stock";
import { bestItemImageUrl } from "@/lib/mercadolibre/item-image";
import { getItemSku, isKitItem } from "@/lib/mercadolibre/item-sku";
import { countListingsByStatus } from "@/lib/mercadolibre/listing-status";
import { computeStockPlanningDisplay } from "@/lib/compras/stock-planning";
import {
  loadOperationalSettings,
  toStockPlanningValues,
} from "@/lib/configuracoes/operational-settings";
import { loadStockReportProductsForListings } from "@/lib/products/product-data";
import type { StockReportProductInfo } from "@/lib/inventory/inventory-stock-report";
import { prisma } from "@/lib/db/db";
import { readSession } from "@/lib/mercadolibre/session";
import { getOrganizationContext } from "@/lib/organizations/context";
import { publicPageLoadMessage } from "@/lib/infra/server-public-error";

function stockUnits(value: number | null | undefined): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return 0;
  return Math.max(0, Math.floor(value));
}

async function InventoryDataSection({
  token,
  userId,
  organizationId,
}: {
  token: string;
  userId: number;
  organizationId: string;
}) {
  let total = 0;
  let statusCounts = { active: 0, paused: 0, other: 0 };
  let warehouseLoadFailed = false;
  let productsBySku: Record<string, StockReportProductInfo> = {};
  let rows: InventoryRow[] = [];

  try {
    const operationalSettings = await loadOperationalSettings(organizationId);
    const stockPlanning = toStockPlanningValues(operationalSettings);
    const items = (
      await fetchOperationalListings(token, userId, organizationId)
    ).filter(
      (item) => !isKitItem(item),
    );

    const fulfillmentStockByItem = await enrichItemsWithFulfillmentStock(
      token,
      items,
    );
    const allIds = items.map((item) => item.id);
    const salesByItem = await fetchUnitsSoldForItemsInWindowBatched(
      token,
      userId,
      allIds,
      stockPlanning.salesAverageWindowDays,
      stockPlanning.salesWindowDateField,
    );
    const ids = items.map((i) => i.id);

    let warehouseById: Record<string, number> = {};
    let leadTimeById: Record<string, number | null> = {};
    try {
      const stocks = await prisma.warehouseStock.findMany({
        where: { organizationId, mlItemId: { in: ids } },
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
          stockPlanning.salesAverageWindowDays,
          stockPlanning,
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

    // Anúncios encerrados (`closed`) só aparecem se ainda houver estoque registrado.
    rows = rows.filter((row) => {
      if (row.mlStatus !== "closed") return true;
      return row.mlStock + row.warehouseStock + row.mlStockOnTheWay > 0;
    });

    total = items.length;
    statusCounts = countListingsByStatus(items);

    productsBySku = await loadStockReportProductsForListings(
      organizationId,
      rows.map((row) => ({ mlItemId: row.mlItemId, sku: row.sku })),
    );
  } catch (e) {
    const msg = publicPageLoadMessage(
      "dashboard/inventory",
      e,
      "Não foi possível carregar o estoque agora. Tente de novo em instantes.",
    );
    return (
      <UserFeedback title="Não foi possível carregar o estoque">{msg}</UserFeedback>
    );
  }

  return (
    <>
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
    </>
  );
}

export const metadata: Metadata = {
  title: "Estoque",
};

export default async function InventoryPage() {
  const cookieStore = await cookies();
  const { accessToken: token, userId } = readSession(cookieStore);

  if (!token || userId === undefined) {
    return null;
  }

  const orgContext = await getOrganizationContext();
  if (orgContext.status !== "active") {
    return null;
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

      <Suspense fallback={<InventoryStockTableSkeleton />}>
        <InventoryDataSection
          token={token}
          userId={userId}
          organizationId={orgContext.organization.id}
        />
      </Suspense>
    </div>
  );
}
