import Link from "next/link";
import { cookies } from "next/headers";
import { stockPlanningConfig } from "@/config/stock-planning";
import { DashboardAttentionPanel } from "@/components/dashboard-attention-panel";
import { DashboardItemsTable } from "@/components/dashboard-items-table";
import {
  fetchAllUserItemIds,
  fetchItemsByIds,
  fetchItemsByIdsBatched,
  fetchUnitsSoldForItemsInWindow,
  fetchUnitsSoldForItemsInWindowBatched,
  fetchUserItemsSearch,
} from "@/lib/mercadolibre/api";
import {
  getValidAccessToken,
  readSession,
} from "@/lib/mercadolibre/session";
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
      <div className="rounded-lg border border-red-200 bg-white p-6 text-red-800">
        {msg}
      </div>
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
    <div className="space-y-8">
      {attentionSnapshot ? (
        <DashboardAttentionPanel
          items={attentionSnapshot.items}
          salesByItem={attentionSnapshot.salesByItem}
        />
      ) : (
        <div className="rounded-lg border border-amber-200 bg-amber-50/60 px-4 py-3 text-sm text-amber-950">
          Não foi possível carregar o painel de prioridades. Atualize a página
          ou tente de novo em instantes.
        </div>
      )}

      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-[var(--brand)]">
          Anúncios
        </h1>
        <p className="mt-1 text-sm text-[var(--text-muted)]">
          {total} anúncio{total !== 1 ? "s" : ""} no total. Nesta página:{" "}
          {catalogItems.length === 1
            ? "1 anúncio do catálogo"
            : `${catalogItems.length} anúncios do catálogo`}
          {" · "}
          {ownItems.length === 1
            ? "1 anúncio próprio"
            : `${ownItems.length} anúncios próprios`}
          . Projeções usam vendas dos últimos {w} dias (todos os pedidos exceto
          cancelados; janela
          por{" "}
          {stockPlanningConfig.salesWindowDateField === "date_closed"
            ? "data de fechamento do pedido"
            : "data de criação do pedido"}
          ; soma de <code className="rounded bg-[var(--surface-muted)] px-1">quantity</code> em{" "}
          <code className="rounded bg-[var(--surface-muted)] px-1">order_items</code> via{" "}
          <code className="rounded bg-[var(--surface-muted)] px-1">orders/search?item=id</code>
          ).
        </p>
      </div>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-[var(--brand)]">
          Anúncios do catálogo
        </h2>
        <DashboardItemsTable items={catalogItems} salesByItem={salesByItem} />
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-[var(--brand)]">
          Anúncios próprios
        </h2>
        <DashboardItemsTable items={ownItems} salesByItem={salesByItem} />
      </section>

      <div className="flex flex-wrap items-center justify-between gap-4">
        <p className="text-sm text-[var(--text-muted)]">
          Página {Math.floor(offset / limit) + 1} de{" "}
          {Math.max(1, Math.ceil(total / limit))}
        </p>
        <div className="flex gap-2">
          {hasPrev ? (
            <Link
              href={prevOffset ? `/dashboard?offset=${prevOffset}` : "/dashboard"}
              className="rounded-md border border-[var(--border)] bg-white px-4 py-2 text-sm font-medium text-[var(--brand)] hover:bg-[var(--surface-muted)]"
            >
              Anterior
            </Link>
          ) : (
            <span className="rounded-md border border-transparent px-4 py-2 text-sm text-[var(--text-muted)]">
              Anterior
            </span>
          )}
          {hasNext ? (
            <Link
              href={`/dashboard?offset=${nextOffset}`}
              className="rounded-md border border-[var(--border)] bg-white px-4 py-2 text-sm font-medium text-[var(--brand)] hover:bg-[var(--surface-muted)]"
            >
              Próxima
            </Link>
          ) : (
            <span className="rounded-md border border-transparent px-4 py-2 text-sm text-[var(--text-muted)]">
              Próxima
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
