import type { Metadata } from "next";
import { Suspense } from "react";
import { cookies } from "next/headers";
import Link from "next/link";
import { AlertTriangle, Boxes, Info } from "lucide-react";
import { InventoryStockTable, type InventoryRow } from "@/components/inventory/InventoryStockTable";
import { InventoryStockTableSkeleton } from "@/components/inventory/InventoryStockTableSkeleton";
import { Card } from "@/components/ui/card";
import { UserFeedback } from "@/components/ui/user-feedback";
import { fetchAllUserItemIds, fetchItemsByIdsBatched } from "@/lib/mercadolibre/api";
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
  let supplierNames: Record<string, string> = {};
  let rows: InventoryRow[] = [];
  let unregisteredCount = 0;

  try {
    const operationalSettings = await loadOperationalSettings(organizationId);
    const stockPlanning = toStockPlanningValues(operationalSettings);

    // Fonte de verdade do Estoque: o cadastro em Meus Produtos (`Product`),
    // não a busca ao vivo de anúncios do ML — evita duplicar linha quando o
    // vendedor tem 2 `mlItemId` ativos pro mesmo produto (ex.: anúncio
    // "espelho" de Catálogo), já que `Product` é 1 linha por produto de
    // verdade (SKU único, checado em `PATCH /api/products/[mlItemId]`).
    // Anúncio ativo/pausado nunca cadastrado em Meus Produtos não aparece
    // aqui — o aviso de "não cadastrado" abaixo cobre esse caso.
    const products = await prisma.product.findMany({
      where: { organizationId, active: true },
      select: { mlItemId: true, supplier: { select: { name: true } } },
    });
    const productMlItemIds = products.map((p) => p.mlItemId);
    supplierNames = Object.fromEntries(
      products
        .filter((p): p is typeof p & { supplier: { name: string } } => p.supplier != null)
        .map((p) => [p.mlItemId, p.supplier.name]),
    );

    const [rawItems, activeIds, pausedIds] = await Promise.all([
      productMlItemIds.length > 0
        ? fetchItemsByIdsBatched(token, productMlItemIds)
        : Promise.resolve([]),
      fetchAllUserItemIds(token, userId, { status: "active" }),
      fetchAllUserItemIds(token, userId, { status: "paused" }),
    ]);
    const registeredIds = new Set(productMlItemIds);
    for (const id of new Set([...activeIds, ...pausedIds])) {
      if (!registeredIds.has(id)) unregisteredCount++;
    }

    const items = rawItems.filter((item) => !isKitItem(item));

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
      <Card className="flex items-center gap-3 rounded-2xl p-4">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-[var(--primary)]/10 text-[var(--primary)]">
          <Boxes className="size-4" aria-hidden />
        </span>
        <p className="text-sm text-[var(--muted-foreground)]">
          <span className="font-semibold tabular-nums text-[var(--foreground)]">
            {total}
          </span>{" "}
          anúncio{total !== 1 ? "s" : ""} no total
          {statusCounts.paused > 0
            ? ` · ${statusCounts.active} ativo${statusCounts.active !== 1 ? "s" : ""} · ${statusCounts.paused} pausado${statusCounts.paused !== 1 ? "s" : ""}`
            : null}
        </p>
      </Card>

      {unregisteredCount > 0 ? (
        <Card className="flex items-start gap-3 rounded-2xl border-[var(--primary)]/20 bg-[var(--primary)]/5 p-4 text-sm">
          <Info className="mt-0.5 size-4 shrink-0 text-[var(--primary)]" aria-hidden />
          <p className="text-[var(--foreground)]">
            <strong>
              {unregisteredCount} anúncio{unregisteredCount !== 1 ? "s" : ""}
            </strong>{" "}
            ativo{unregisteredCount !== 1 ? "s" : ""}/pausado
            {unregisteredCount !== 1 ? "s" : ""} no Mercado Livre ainda não{" "}
            {unregisteredCount !== 1 ? "foram cadastrados" : "foi cadastrado"} em{" "}
            <Link href="/dashboard/produtos" className="font-medium underline underline-offset-2">
              Meus Produtos
            </Link>{" "}
            — não {unregisteredCount !== 1 ? "aparecem" : "aparece"} aqui até serem
            cadastrados.
          </p>
        </Card>
      ) : null}

      {warehouseLoadFailed ? (
        <Card className="flex items-start gap-3 rounded-2xl border-amber-500/20 bg-amber-500/5 p-4 text-sm">
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-600 dark:text-amber-400" aria-hidden />
          <p className="text-amber-900 dark:text-amber-200">
            Não foi possível ler o estoque do galpão (PostgreSQL). As colunas do
            galpão aparecem como zero; confira o banco e o{" "}
            <code className="rounded bg-amber-500/10 px-1 font-mono text-xs">
              DATABASE_URL
            </code>
            .
          </p>
        </Card>
      ) : null}

      <InventoryStockTable rows={rows} supplierNames={supplierNames} />
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
      <div className="flex items-center gap-3">
        <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-[var(--primary)]/10 text-[var(--primary)]">
          <Boxes className="size-5" aria-hidden />
        </span>
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-[var(--foreground)] sm:text-3xl">
            Estoque
          </h1>
          <p className="mt-1 max-w-3xl text-sm leading-relaxed text-[var(--muted-foreground)] sm:text-[15px]">
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
