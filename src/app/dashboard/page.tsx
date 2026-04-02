import Link from "next/link";
import { cookies } from "next/headers";
import { stockPlanningConfig } from "@/config/stock-planning";
import { DashboardItemsTable } from "@/components/dashboard-items-table";
import {
  fetchItemsByIds,
  fetchUnitsSoldForItemsInWindow,
  fetchUserItemsSearch,
} from "@/lib/mercadolibre/api";
import {
  getValidAccessToken,
  readSession,
} from "@/lib/mercadolibre/session";

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

  let search;
  let items;
  let salesByItem: Record<string, number> = {};
  try {
    search = await fetchUserItemsSearch(token, userId, offset, limit);
    const windowDays = stockPlanningConfig.salesAverageWindowDays;
    const dateField = stockPlanningConfig.salesWindowDateField;
    const [loadedItems, soldMap] = await Promise.all([
      fetchItemsByIds(token, search.results),
      fetchUnitsSoldForItemsInWindow(
        token,
        userId,
        search.results,
        windowDays,
        dateField,
      ),
    ]);
    items = loadedItems;
    salesByItem = soldMap;
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
    <div className="space-y-6">
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
