import Link from "next/link";
import { cookies } from "next/headers";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { InventoryStockTable } from "@/components/inventory-stock-table";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  fetchItemsByIds,
  fetchUserItemsSearch,
} from "@/lib/mercadolibre/api";
import { mlAvailableStockUnits } from "@/lib/mercadolibre/ml-available-stock";
import { bestItemImageUrl } from "@/lib/mercadolibre/item-image";
import { prisma } from "@/lib/db";
import { getValidAccessToken, readSession } from "@/lib/mercadolibre/session";

type PageProps = {
  searchParams: Promise<{ offset?: string }>;
};

export default async function InventoryPage({ searchParams }: PageProps) {
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
  let warehouseLoadFailed = false;
  let rows: {
    mlItemId: string;
    title: string;
    imageUrl?: string;
    mlStock: number;
    warehouseStock: number;
    leadTimeDays: number | null;
  }[] = [];

  try {
    const s = await fetchUserItemsSearch(token, userId, offset, limit, {
      status: "active",
    });
    const items = await fetchItemsByIds(token, s.results);
    const ids = items.map((i) => i.id);

    let warehouseById: Record<string, number> = {};
    let leadTimeById: Record<string, number | null> = {};
    try {
      const stocks = await prisma.warehouseStock.findMany({
        where: { mlItemId: { in: ids } },
        select: {
          mlItemId: true,
          quantity: true,
          purchaseLeadTimeDays: true,
        },
      });
      warehouseById = Object.fromEntries(
        stocks.map((s) => [s.mlItemId, s.quantity]),
      );
      leadTimeById = Object.fromEntries(
        stocks.map((s) => [s.mlItemId, s.purchaseLeadTimeDays]),
      );
    } catch {
      warehouseLoadFailed = true;
    }

    rows = items.map((item) => ({
      mlItemId: item.id,
      title: item.title,
      imageUrl: bestItemImageUrl(item),
      mlStock: mlAvailableStockUnits(item),
      warehouseStock: warehouseById[item.id] ?? 0,
      leadTimeDays: leadTimeById[item.id] ?? null,
    }));

    search = s;
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

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-[var(--primary)]">
          Estoque
        </h1>
        <p className="mt-2 max-w-3xl text-[15px] leading-relaxed text-[var(--muted-foreground)]">
          Anúncios <strong>ativos</strong>: estoque no galpão (banco local),
          estoque no Mercado Livre (API, atualizado ao carregar a página) e
          total geral (soma dos dois). <strong>Editar</strong> ajusta só o
          galpão; <strong>Configurações</strong> define o prazo compra →
          galpão.
        </p>
      </div>

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

      <InventoryStockTable rows={rows} />

      <Card>
        <CardContent className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:justify-between sm:py-4">
          <p className="text-sm text-[var(--muted-foreground)]">
            Página {Math.floor(offset / limit) + 1} de{" "}
            {Math.max(1, Math.ceil(total / limit))}
            {" · "}
            {total} anúncio{total !== 1 ? "s" : ""} ativo{total !== 1 ? "s" : ""}{" "}
            no total
          </p>
          <div className="flex flex-wrap gap-2">
            {hasPrev ? (
              <Button variant="outline" size="sm" asChild>
                <Link
                  href={
                    prevOffset
                      ? `/dashboard/inventory?offset=${prevOffset}`
                      : "/dashboard/inventory"
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
                  href={`/dashboard/inventory?offset=${nextOffset}`}
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
  );
}
