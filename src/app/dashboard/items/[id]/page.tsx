import type { Metadata } from "next";
import Image from "next/image";
import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import { Breadcrumbs } from "@/components/shared/Breadcrumbs";
import {
  ItemDetailCatalogSection,
  ItemDetailHeroMeta,
  ItemDetailMarginSection,
  ItemDetailOperationsSection,
  ItemDetailStockSection,
  ItemDetailVariationsSection,
} from "@/components/items/ItemDetailSections";
import { Card, CardContent } from "@/components/ui/card";
import { loadItemDetailContext } from "@/lib/items/item-detail-data";
import { fetchItemById } from "@/lib/mercadolibre/api";
import { bestItemImageUrl } from "@/lib/mercadolibre/item-image";
import { getItemSku } from "@/lib/mercadolibre/item-sku";
import { readSession } from "@/lib/mercadolibre/session";
import { getOrganizationContext } from "@/lib/organizations/context";

type PageProps = {
  params: Promise<{ id: string }>;
};

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const { id } = await params;
  const cookieStore = await cookies();
  const { accessToken } = readSession(cookieStore);
  if (!accessToken) return { title: "Detalhe do anúncio" };
  try {
    const item = await fetchItemById(accessToken, id);
    const sku = item ? getItemSku(item) : null;
    return { title: sku ?? item?.title ?? "Detalhe do anúncio" };
  } catch {
    return { title: "Detalhe do anúncio" };
  }
}

export default async function ItemDetailPage({ params }: PageProps) {
  const { id } = await params;
  const cookieStore = await cookies();
  const { accessToken: token, userId } = readSession(cookieStore);

  if (!token || userId === undefined) {
    return null;
  }

  const orgContext = await getOrganizationContext();
  if (orgContext.status !== "active") {
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
    organizationId: orgContext.organization.id,
    itemId: id,
    item,
  });

  const imageUrl = bestItemImageUrl(item);
  const sku = getItemSku(item);

  return (
    <div className="space-y-8">
      <Breadcrumbs
        items={[
          { label: "Início", href: "/dashboard" },
          { label: sku ?? item.title },
        ]}
      />

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
