import Link from "next/link";
import { cookies } from "next/headers";
import {
  fetchItemsByIds,
  fetchUserItemsSearch,
} from "@/lib/mercadolibre/api";
import type { ItemBody } from "@/lib/mercadolibre/types";
import {
  getValidAccessToken,
  readSession,
} from "@/lib/mercadolibre/session";

type PageProps = {
  searchParams: Promise<{ offset?: string }>;
};

function ItemsTable({ items }: { items: ItemBody[] }) {
  return (
    <div className="overflow-hidden rounded-lg border border-[var(--border)] bg-white shadow-sm">
      <table className="w-full text-left text-sm">
        <thead className="border-b border-[var(--border)] bg-[var(--surface-muted)]">
          <tr>
            <th className="px-4 py-3 font-semibold text-[var(--brand)]">
              Produto
            </th>
            <th className="hidden px-4 py-3 font-semibold text-[var(--brand)] sm:table-cell">
              ID
            </th>
            <th className="px-4 py-3 font-semibold text-[var(--brand)]">
              Estoque
            </th>
            <th className="hidden px-4 py-3 font-semibold text-[var(--brand)] md:table-cell">
              Preço
            </th>
          </tr>
        </thead>
        <tbody>
          {items.length === 0 ? (
            <tr>
              <td
                colSpan={4}
                className="px-4 py-8 text-center text-[var(--text-muted)]"
              >
                Nenhum anúncio nesta categoria nesta página.
              </td>
            </tr>
          ) : (
            items.map((item) => (
              <tr
                key={item.id}
                className="border-b border-[var(--border)] last:border-0"
              >
                <td className="px-4 py-3">
                  <Link
                    href={`/dashboard/items/${item.id}`}
                    className="font-medium text-[var(--brand)] underline-offset-2 hover:underline"
                  >
                    {item.title}
                  </Link>
                </td>
                <td className="hidden px-4 py-3 font-mono text-xs text-[var(--text-muted)] sm:table-cell">
                  {item.id}
                </td>
                <td className="px-4 py-3 tabular-nums">
                  {item.available_quantity}
                </td>
                <td className="hidden px-4 py-3 tabular-nums md:table-cell">
                  {item.currency_id}{" "}
                  {item.price.toLocaleString("pt-BR", {
                    minimumFractionDigits: 2,
                  })}
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}

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
  try {
    search = await fetchUserItemsSearch(token, userId, offset, limit);
    items = await fetchItemsByIds(token, search.results);
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
          .
        </p>
      </div>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-[var(--brand)]">
          Anúncios do catálogo
        </h2>
        <ItemsTable items={catalogItems} />
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-[var(--brand)]">
          Anúncios próprios
        </h2>
        <ItemsTable items={ownItems} />
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
