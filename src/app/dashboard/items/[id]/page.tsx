import Image from "next/image";
import Link from "next/link";
import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import { fetchItemById } from "@/lib/mercadolibre/api";
import { getValidAccessToken } from "@/lib/mercadolibre/session";

type PageProps = {
  params: Promise<{ id: string }>;
};

export default async function ItemDetailPage({ params }: PageProps) {
  const { id } = await params;
  const cookieStore = await cookies();
  const token = await getValidAccessToken(cookieStore);

  if (!token) {
    return null;
  }

  let item;
  try {
    item = await fetchItemById(token, id);
  } catch {
    notFound();
  }

  if (!item) {
    notFound();
  }

  const variationStock =
    item.variations?.map((v) => ({
      id: v.id,
      qty: v.available_quantity ?? 0,
    })) ?? [];

  return (
    <div className="space-y-8">
      <nav className="text-sm text-[var(--text-muted)]">
        <Link href="/dashboard" className="text-[var(--brand)] hover:underline">
          Anúncios
        </Link>
        <span className="mx-2">/</span>
        <span className="text-[var(--foreground)]">Detalhe</span>
      </nav>

      <div className="rounded-lg border border-[var(--border)] bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-6 lg:flex-row">
          {item.thumbnail ? (
            <Image
              src={item.thumbnail}
              alt=""
              width={192}
              height={192}
              className="h-48 w-48 shrink-0 rounded-md border border-[var(--border)] object-contain"
            />
          ) : null}
          <div className="min-w-0 flex-1 space-y-4">
            <h1 className="text-2xl font-semibold tracking-tight text-[var(--brand)]">
              {item.title}
            </h1>
            <dl className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-md bg-[var(--surface-muted)] p-4">
                <dt className="text-xs font-medium uppercase tracking-wide text-[var(--text-muted)]">
                  Estoque disponível
                </dt>
                <dd className="mt-1 text-3xl font-semibold tabular-nums text-[var(--brand)]">
                  {item.available_quantity}
                </dd>
              </div>
              <div className="rounded-md bg-[var(--surface-muted)] p-4">
                <dt className="text-xs font-medium uppercase tracking-wide text-[var(--text-muted)]">
                  Vendidos
                </dt>
                <dd className="mt-1 text-2xl font-semibold tabular-nums text-[var(--foreground)]">
                  {item.sold_quantity}
                </dd>
              </div>
              <div>
                <dt className="text-xs font-medium text-[var(--text-muted)]">
                  Preço
                </dt>
                <dd className="text-lg font-medium tabular-nums">
                  {item.currency_id}{" "}
                  {item.price.toLocaleString("pt-BR", {
                    minimumFractionDigits: 2,
                  })}
                </dd>
              </div>
              <div>
                <dt className="text-xs font-medium text-[var(--text-muted)]">
                  Status
                </dt>
                <dd className="font-medium capitalize">{item.status}</dd>
              </div>
              {item.condition ? (
                <div>
                  <dt className="text-xs font-medium text-[var(--text-muted)]">
                    Condição
                  </dt>
                  <dd className="capitalize">{item.condition}</dd>
                </div>
              ) : null}
              <div className="sm:col-span-2">
                <dt className="text-xs font-medium text-[var(--text-muted)]">
                  ID
                </dt>
                <dd className="font-mono text-sm">{item.id}</dd>
              </div>
            </dl>
            <a
              href={item.permalink}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex text-sm font-medium text-[var(--brand)] underline-offset-2 hover:underline"
            >
              Ver no Mercado Livre
            </a>
          </div>
        </div>
      </div>

      {variationStock.length > 0 ? (
        <div className="rounded-lg border border-[var(--border)] bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-[var(--brand)]">
            Variações (estoque)
          </h2>
          <ul className="mt-4 divide-y divide-[var(--border)]">
            {variationStock.map((v) => (
              <li
                key={v.id}
                className="flex justify-between py-2 text-sm first:pt-0 last:pb-0"
              >
                <span className="font-mono text-[var(--text-muted)]">
                  Variação {v.id}
                </span>
                <span className="tabular-nums font-medium">{v.qty}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
