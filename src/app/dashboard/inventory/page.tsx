import { cookies } from "next/headers";
import { InventoryStockTable } from "@/components/inventory-stock-table";
import { Card, CardContent } from "@/components/ui/card";
import {
  fetchAllUserItemIds,
  fetchItemsByIdsBatched,
} from "@/lib/mercadolibre/api";
import { mlAvailableStockUnits } from "@/lib/mercadolibre/ml-available-stock";
import { bestItemImageUrl } from "@/lib/mercadolibre/item-image";
import { getItemSku } from "@/lib/mercadolibre/item-sku";
import { prisma } from "@/lib/db";
import { getValidAccessToken, readSession } from "@/lib/mercadolibre/session";

export default async function InventoryPage() {

  const cookieStore = await cookies();
  const token = await getValidAccessToken(cookieStore);
  const { userId } = readSession(cookieStore);

  if (!token || userId === undefined) {
    return null;
  }

  let total = 0;
  let warehouseLoadFailed = false;
  let rows: {
    mlItemId: string;
    sku: string | null;
    title: string;
    imageUrl?: string;
    mlStock: number;
    warehouseStock: number;
    leadTimeDays: number | null;
  }[] = [];

  try {
    const allIds = await fetchAllUserItemIds(token, userId, {
      status: "active",
    });
    const items = await fetchItemsByIdsBatched(token, allIds);
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
      sku: getItemSku(item),
      title: item.title,
      imageUrl: bestItemImageUrl(item),
      mlStock: mlAvailableStockUnits(item),
      warehouseStock: warehouseById[item.id] ?? 0,
      leadTimeDays: leadTimeById[item.id] ?? null,
    }));

    total = items.length;
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Erro ao carregar anúncios";
    return (
      <Card className="border-red-200 bg-red-50/50">
        <CardContent className="pt-6 text-red-900">{msg}</CardContent>
      </Card>
    );
  }

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
        <CardContent className="p-4 text-sm text-[var(--muted-foreground)] sm:py-4">
          {total} anúncio{total !== 1 ? "s" : ""} ativo{total !== 1 ? "s" : ""}{" "}
          no total
        </CardContent>
      </Card>
    </div>
  );
}
