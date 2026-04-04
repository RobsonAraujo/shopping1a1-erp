import Link from "next/link";
import { cookies } from "next/headers";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { stockPlanningConfig } from "@/config/stock-planning";
import { DashboardAttentionPanel } from "@/components/dashboard-attention-panel";
import { DashboardItemsTable } from "@/components/dashboard-items-table";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  fetchAllUserItemIds,
  fetchItemsByIds,
  fetchItemsByIdsBatched,
  fetchUnitsSoldForItemsInWindow,
  fetchUnitsSoldForItemsInWindowBatched,
  fetchUserItemsSearch,
} from "@/lib/mercadolibre/api";
import { getValidAccessToken, readSession } from "@/lib/mercadolibre/session";
import type { ItemBody } from "@/lib/mercadolibre/types";

type PageProps = {
  searchParams: Promise<{ offset?: string }>;
};

export default async function DashboardPage({ searchParams }: PageProps) {
  const sp = await searchParams;
  const offset = Math.max(0, parseInt(sp.offset ?? "0", 10) || 0);
  const limit = 20;

  const cookieStore = await cookies();
  const token = await getValidAccessToken(cookieStore);
  const { userId } = readSession(cookieStore);

  if (!token || userId === undefined) {
    return null;
  }

  const windowDays = stockPlanningConfig.salesAverageWindowDays;
  const dateField = stockPlanningConfig.salesWindowDateField;

  let search;
  let items;
  let salesByItem: Record<string, number> = {};
  let attentionSnapshot: {
    items: ItemBody[];
    salesByItem: Record<string, number>;
  } | null = null;

  try {
    const [pageBundle, attentionResult] = await Promise.all([
      (async () => {
        const s = await fetchUserItemsSearch(token, userId, offset, limit);
        const [loadedItems, soldMap] = await Promise.all([
          fetchItemsByIds(token, s.results),
          fetchUnitsSoldForItemsInWindow(
            token,
            userId,
            s.results,
            windowDays,
            dateField,
          ),
        ]);
        return { search: s, items: loadedItems, soldMap };
      })(),
      (async () => {
        try {
          const allIds = await fetchAllUserItemIds(token, userId);
          const [allItems, allSales] = await Promise.all([
            fetchItemsByIdsBatched(token, allIds),
            fetchUnitsSoldForItemsInWindowBatched(
              token,
              userId,
              allIds,
              windowDays,
              dateField,
            ),
          ]);
          return { items: allItems, salesByItem: allSales };
        } catch {
          return null;
        }
      })(),
    ]);

    search = pageBundle.search;
    items = pageBundle.items;
    salesByItem = pageBundle.soldMap;
    attentionSnapshot = attentionResult;
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Erro ao carregar anúncios";
    return (
      <Card className="border-red-200 bg-red-50/50">
        <CardContent className="pt-6 text-red-900">{msg}</CardContent>
      </Card>
    );
  }

  const { total } = search.paging;
  const prevOffset = Math.max(0, offset - limit);
  const nextOffset = offset + limit;
  const hasPrev = offset > 0;
  const hasNext = nextOffset < total;

  const catalogItems = items.filter((i) => i.catalog_listing === true);
  const ownItems = items.filter((i) => i.catalog_listing !== true);
  const w = stockPlanningConfig.salesAverageWindowDays;

  return (
    <div className="space-y-10">
      {attentionSnapshot ? (
        <DashboardAttentionPanel
          items={attentionSnapshot.items}
          salesByItem={attentionSnapshot.salesByItem}
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
            {total} anúncio{total !== 1 ? "s" : ""} no total. Nesta página:{" "}
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
            Anúncios do catálogo
          </h2>
          <DashboardItemsTable items={catalogItems} salesByItem={salesByItem} />
        </section>

        <section className="space-y-3">
          <h2 className="text-lg font-semibold text-[var(--primary)]">
            Anúncios próprios
          </h2>
          <DashboardItemsTable items={ownItems} salesByItem={salesByItem} />
        </section>

        <Card>
          <CardContent className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:justify-between sm:py-4">
            <p className="text-sm text-[var(--muted-foreground)]">
              Página {Math.floor(offset / limit) + 1} de{" "}
              {Math.max(1, Math.ceil(total / limit))}
            </p>
            <div className="flex flex-wrap gap-2">
              {hasPrev ? (
                <Button variant="outline" size="sm" asChild>
                  <Link
                    href={
                      prevOffset
                        ? `/dashboard?offset=${prevOffset}`
                        : "/dashboard"
                    }
                    className="gap-1.5"
                  >
                    <ChevronLeft className="size-4" />
                    Anterior
                  </Link>
                </Button>
              ) : (
                <Button
                  variant="outline"
                  size="sm"
                  disabled
                  className="gap-1.5"
                >
                  <ChevronLeft className="size-4" />
                  Anterior
                </Button>
              )}
              {hasNext ? (
                <Button variant="outline" size="sm" asChild>
                  <Link
                    href={`/dashboard?offset=${nextOffset}`}
                    className="gap-1.5"
                  >
                    Próxima
                    <ChevronRight className="size-4" />
                  </Link>
                </Button>
              ) : (
                <Button
                  variant="outline"
                  size="sm"
                  disabled
                  className="gap-1.5"
                >
                  Próxima
                  <ChevronRight className="size-4" />
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
