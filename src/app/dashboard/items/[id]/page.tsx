import Image from "next/image";
import Link from "next/link";
import { cookies } from "next/headers";
import { ChevronLeft } from "lucide-react";
import { notFound, redirect } from "next/navigation";
import {
  ItemDetailCatalogSection,
  ItemDetailHeroMeta,
  ItemDetailMarginSection,
  ItemDetailOperationsSection,
  ItemDetailStockSection,
  ItemDetailVariationsSection,
} from "@/components/item-detail-sections";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { loadItemDetailContext } from "@/lib/item-detail-data";
import { fetchItemById } from "@/lib/mercadolibre/api";
import { bestItemImageUrl } from "@/lib/mercadolibre/item-image";
import { getItemSku } from "@/lib/mercadolibre/item-sku";
import {
  getSessionAccessState,
  readSession,
  refreshSessionPath,
} from "@/lib/mercadolibre/session";

type PageProps = {
  params: Promise<{ id: string }>;
};

export default async function ItemDetailPage({ params }: PageProps) {
  const { id } = await params;
  const cookieStore = await cookies();
  const session = getSessionAccessState(cookieStore);
  if (session.needsRefresh) {
    redirect(refreshSessionPath(`/dashboard/items/${encodeURIComponent(id)}`));
  }
  const token = session.accessToken;
  const { userId } = readSession(cookieStore);

  if (!token || userId === undefined) {
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

  const context = await loadItemDetailContext({
    accessToken: token,
    userId,
    itemId: id,
    item,
  });

  const imageUrl = bestItemImageUrl(item);
  const sku = getItemSku(item);

  return (
    <div className="space-y-8">
      <nav className="flex flex-wrap items-center gap-2 text-sm text-[var(--muted-foreground)]">
        <Button variant="ghost" size="sm" className="-ml-2 h-8 gap-1 px-2" asChild>
          <Link href="/dashboard">
            <ChevronLeft className="size-4" />
            Início
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
              <div className="space-y-1">
                <h1 className="text-2xl font-bold tracking-tight text-[var(--primary)] sm:text-3xl">
                  {sku ?? "Sem SKU"}
                </h1>
                <p
                  className="text-sm leading-snug text-[var(--muted-foreground)]"
                  title={item.title}
                >
                  {item.title}
                </p>
              </div>
              <ItemDetailHeroMeta item={item} context={context} />
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <ItemDetailStockSection context={context} />
        <ItemDetailMarginSection context={context} />
      </div>

      {item.catalog_listing ? (
        <ItemDetailCatalogSection itemId={id} context={context} />
      ) : null}

      <ItemDetailOperationsSection context={context} />
      <ItemDetailVariationsSection item={item} />
    </div>
  );
}
