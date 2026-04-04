import Image from "next/image";
import Link from "next/link";
import { cookies } from "next/headers";
import { ChevronLeft, ExternalLink } from "lucide-react";
import { notFound } from "next/navigation";
import { fetchItemById } from "@/lib/mercadolibre/api";
import { bestItemImageUrl } from "@/lib/mercadolibre/item-image";
import { getValidAccessToken } from "@/lib/mercadolibre/session";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

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

  const imageUrl = bestItemImageUrl(item);

  return (
    <div className="space-y-8">
      <nav className="flex flex-wrap items-center gap-2 text-sm text-[var(--muted-foreground)]">
        <Button variant="ghost" size="sm" className="-ml-2 h-8 gap-1 px-2" asChild>
          <Link href="/dashboard">
            <ChevronLeft className="size-4" />
            Anúncios
          </Link>
        </Button>
        <span className="text-[var(--border)]">/</span>
        <span className="text-[var(--foreground)]">Detalhe</span>
      </nav>

      <Card className="overflow-hidden shadow-sm">
        <CardContent className="p-6 sm:p-8">
          <div className="flex flex-col gap-8 lg:flex-row">
            {imageUrl ? (
              <Image
                src={imageUrl}
                alt=""
                width={400}
                height={400}
                className="h-48 w-48 shrink-0 rounded-xl border border-[var(--border)] bg-[var(--muted)] object-contain"
                sizes="192px"
              />
            ) : null}
            <div className="min-w-0 flex-1 space-y-6">
              <h1 className="text-2xl font-bold tracking-tight text-[var(--primary)] sm:text-3xl">
                {item.title}
              </h1>
              <dl className="grid gap-4 sm:grid-cols-2">
                <div className="rounded-xl border border-[var(--border)] bg-[var(--muted)]/50 p-4">
                  <dt className="text-[11px] font-semibold uppercase tracking-wider text-[var(--muted-foreground)]">
                    Estoque disponível
                  </dt>
                  <dd className="mt-1 text-3xl font-bold tabular-nums text-[var(--primary)]">
                    {item.available_quantity}
                  </dd>
                </div>
                <div className="rounded-xl border border-[var(--border)] bg-[var(--muted)]/50 p-4">
                  <dt className="text-[11px] font-semibold uppercase tracking-wider text-[var(--muted-foreground)]">
                    Vendidos
                  </dt>
                  <dd className="mt-1 text-2xl font-bold tabular-nums text-[var(--foreground)]">
                    {item.sold_quantity}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs font-medium text-[var(--muted-foreground)]">
                    Preço
                  </dt>
                  <dd className="mt-0.5 text-lg font-semibold tabular-nums">
                    {item.currency_id}{" "}
                    {item.price.toLocaleString("pt-BR", {
                      minimumFractionDigits: 2,
                    })}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs font-medium text-[var(--muted-foreground)]">
                    Status
                  </dt>
                  <dd className="mt-0.5 font-medium capitalize">{item.status}</dd>
                </div>
                {item.condition ? (
                  <div>
                    <dt className="text-xs font-medium text-[var(--muted-foreground)]">
                      Condição
                    </dt>
                    <dd className="mt-0.5 capitalize">{item.condition}</dd>
                  </div>
                ) : null}
                <div className="sm:col-span-2">
                  <dt className="text-xs font-medium text-[var(--muted-foreground)]">
                    ID
                  </dt>
                  <dd className="mt-0.5 font-mono text-sm">{item.id}</dd>
                </div>
              </dl>
              <Button variant="default" size="sm" className="gap-2" asChild>
                <a href={item.permalink} target="_blank" rel="noopener noreferrer">
                  Ver no Mercado Livre
                  <ExternalLink className="size-4" />
                </a>
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {variationStock.length > 0 ? (
        <Card className="shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-lg text-[var(--primary)]">
              Variações (estoque)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="divide-y divide-[var(--border)] rounded-lg border border-[var(--border)]">
              {variationStock.map((v) => (
                <li
                  key={v.id}
                  className="flex items-center justify-between gap-4 px-4 py-3 text-sm first:rounded-t-lg last:rounded-b-lg"
                >
                  <span className="font-mono text-[var(--muted-foreground)]">
                    Variação {v.id}
                  </span>
                  <span className="tabular-nums font-semibold">{v.qty}</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
