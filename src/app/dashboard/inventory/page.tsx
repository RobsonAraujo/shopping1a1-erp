import type { Metadata } from "next";
import { Suspense } from "react";
import { cookies } from "next/headers";
import { InventoryStockTable, type InventoryRow } from "@/components/inventory/InventoryStockTable";
import { InventoryStockTableSkeleton } from "@/components/inventory/InventoryStockTableSkeleton";
import { Card, CardContent } from "@/components/ui/card";
import { UserFeedback } from "@/components/ui/user-feedback";
import { fetchOperationalListings } from "@/lib/mercadolibre/api";
import { fetchUnitsSoldForItemsInWindowCached } from "@/lib/mercadolibre/sales-window-cache";
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
import {
  loadInactiveProductMlItemIds,
  loadSupplierNamesByMlItemId,
} from "@/lib/products/product-resolver";
import type { StockReportProductInfo } from "@/lib/inventory/inventory-stock-report";
import { prisma } from "@/lib/db/db";
import { readSession } from "@/lib/mercadolibre/session";
import { getOrganizationContext } from "@/lib/organizations/context";
import { publicPageLoadMessage } from "@/lib/infra/server-public-error";

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
  let supplierNames: Record<string, string> = {};
  let rows: InventoryRow[] = [];

  try {
    const operationalSettings = await loadOperationalSettings(organizationId);
    const stockPlanning = toStockPlanningValues(operationalSettings);
    const rawItems = (
      await fetchOperationalListings(token, userId, organizationId)
    ).filter(
      (item) => !isKitItem(item),
    );
    // Produto inativado pelo usuário some do Estoque (linha e Relatório de
    // Estoque), sem afetar o cadastro nem relatórios históricos.
    const inactiveIds = await loadInactiveProductMlItemIds(
      organizationId,
      rawItems.map((item) => item.id),
    );
    const items = rawItems.filter((item) => !inactiveIds.has(item.id));

    const allIds = items.map((item) => item.id);

    // As 2 buscas abaixo são independentes entre si — paralelizadas em vez
    // de sequenciais. O estoque Full em processamento
    // (`enrichItemsWithFulfillmentStock`, 1 chamada ML por item Full) NÃO
    // entra aqui de propósito: é a parte mais lenta do carregamento, então
    // fica pra depois — o client busca isso via streaming
    // (`/api/inventory/fulfillment-stream`) assim que a tabela já estiver
    // na tela, preenchendo "A caminho"/"Total"/"Comprar" aos poucos.
    const [salesByItem, warehouseStocks] = await Promise.all([
      fetchUnitsSoldForItemsInWindowCached(
        organizationId,
        token,
        userId,
        allIds,
        stockPlanning.salesAverageWindowDays,
        stockPlanning.salesWindowDateField,
      ),
      prisma.warehouseStock
        .findMany({
          where: { organizationId, mlItemId: { in: allIds } },
          select: {
            mlItemId: true,
            quantity: true,
            purchaseLeadTimeDays: true,
          },
        })
        .catch(() => null),
    ]);

    let warehouseById: Record<string, number> = {};
    let leadTimeById: Record<string, number | null> = {};
    if (warehouseStocks) {
      warehouseById = Object.fromEntries(
        warehouseStocks.map((s) => [s.mlItemId, s.quantity]),
      );
      leadTimeById = Object.fromEntries(
        warehouseStocks.map((s) => [s.mlItemId, s.purchaseLeadTimeDays]),
      );
    } else {
      warehouseLoadFailed = true;
    }

    rows = items.map((item) => ({
      ...(() => {
        const mlStock = mlAvailableStockUnits(item);
        const warehouseStock = warehouseById[item.id] ?? 0;
        const isFulfillment = isFulfillmentListing(item);
        const purchaseLeadTimeDays = leadTimeById[item.id] ?? 0;
        const sold = salesByItem[item.id] ?? 0;

        // Itens Full: "a caminho"/"total"/"comprar" dependem do estoque Full
        // em processamento, que ainda não foi buscado (ver comentário acima)
        // — ficam com valor provisório até o streaming client-side resolver.
        // Itens sem Full: não têm esse dado pra esperar, resolvem na hora.
        if (isFulfillment) {
          return {
            mlStock,
            warehouseStock,
            isFulfillment,
            mlStockOnTheWay: 0,
            mlProcessTransfer: 0,
            mlProcessInternal: 0,
            leadTimeDays: leadTimeById[item.id] ?? null,
            needsPurchaseAttention: false,
            fulfillmentPending: true,
          };
        }

        const plan = computeStockPlanningDisplay(
          mlStock + warehouseStock,
          sold,
          stockPlanning.salesAverageWindowDays,
          stockPlanning,
          purchaseLeadTimeDays,
        );
        return {
          mlStock,
          warehouseStock,
          isFulfillment,
          mlStockOnTheWay: 0,
          mlProcessTransfer: 0,
          mlProcessInternal: 0,
          leadTimeDays: leadTimeById[item.id] ?? null,
          needsPurchaseAttention: plan.needsPurchaseAttention,
          fulfillmentPending: false,
        };
      })(),
      mlItemId: item.id,
      sku: getItemSku(item),
      title: item.title,
      imageUrl: bestItemImageUrl(item),
      mlStatus: item.status,
      catalogListing: item.catalog_listing === true,
    }));

    // Anúncios encerrados (`closed`) só aparecem se ainda houver estoque
    // registrado. Com o Full pendente, `mlStockOnTheWay` ainda é 0
    // provisório — não dá pra decidir com certeza ainda, então mantém
    // visível (evita a linha sumir e depois reaparecer quando o streaming
    // resolver o valor real).
    rows = rows.filter((row) => {
      if (row.mlStatus !== "closed") return true;
      if (row.fulfillmentPending) return true;
      return row.mlStock + row.warehouseStock + row.mlStockOnTheWay > 0;
    });

    total = items.length;
    statusCounts = countListingsByStatus(items);

    const [productsResult, supplierNamesMap] = await Promise.all([
      loadStockReportProductsForListings(
        organizationId,
        rows.map((row) => ({ mlItemId: row.mlItemId, sku: row.sku })),
      ),
      loadSupplierNamesByMlItemId(
        organizationId,
        rows.map((row) => row.mlItemId),
      ),
    ]);
    productsBySku = productsResult;
    supplierNames = Object.fromEntries(supplierNamesMap);
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

      <InventoryStockTable
        rows={rows}
        productsBySku={productsBySku}
        supplierNames={supplierNames}
      />

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
