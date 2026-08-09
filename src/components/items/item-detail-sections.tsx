import Link from "next/link";
import { ExternalLink } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ListingStatusBadge } from "@/components/listing-status-badge";
import {
  catalogPriceGap,
  catalogStatusBadgeClass,
  catalogStatusLabel,
} from "@/lib/catalog-competition";
import {
  formatFinancialMoney,
  formatFinancialPercent,
  listingTypeLabelFromId,
} from "@/lib/financial-margin";
import type { ItemDetailContext } from "@/lib/items/item-detail-data";
import type { ItemBody } from "@/lib/mercadolibre/types";
import { statusLabelsForKind } from "@/lib/replenishment-cycle";

function formatDatePtBR(d: Date | string | null): string {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatLogistics(item: ItemBody): string {
  const parts: string[] = [];
  const logistic = item.shipping?.logistic_type;
  if (logistic) parts.push(logistic.replace(/_/g, " "));
  if (item.shipping?.free_shipping) parts.push("Frete grátis");
  return parts.length > 0 ? parts.join(" · ") : "—";
}

function variationLabel(
  variation: NonNullable<ItemBody["variations"]>[number],
): string {
  const attrs = variation.attribute_combinations
    ?.map((a) => a.value_name?.trim())
    .filter(Boolean);
  if (attrs && attrs.length > 0) return attrs.join(" / ");
  return `Variação ${variation.id}`;
}

export function ItemDetailStockSection({
  context,
}: {
  context: ItemDetailContext;
}) {
  const { plan } = context;

  return (
    <Card className="shadow-sm">
      <CardHeader className="pb-2">
        <CardTitle className="text-lg text-[var(--primary)]">
          Estoque e planejamento
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-xl border border-[var(--border)] bg-[var(--muted)]/50 p-4">
            <dt className="text-[11px] font-semibold uppercase tracking-wider text-[var(--muted-foreground)]">
              Estoque ML
            </dt>
            <dd className="mt-1 text-2xl font-bold tabular-nums text-[var(--primary)]">
              {context.mlStock}
            </dd>
          </div>
          <div className="rounded-xl border border-[var(--border)] bg-[var(--muted)]/50 p-4">
            <dt className="text-[11px] font-semibold uppercase tracking-wider text-[var(--muted-foreground)]">
              Galpão
            </dt>
            <dd className="mt-1 text-2xl font-bold tabular-nums">
              {context.warehouseStock}
            </dd>
          </div>
          <div className="rounded-xl border border-[var(--border)] bg-[var(--muted)]/50 p-4">
            <dt className="text-[11px] font-semibold uppercase tracking-wider text-[var(--muted-foreground)]">
              Total
            </dt>
            <dd className="mt-1 text-2xl font-bold tabular-nums">
              {context.totalStock}
            </dd>
          </div>
          <div className="rounded-xl border border-[var(--border)] bg-[var(--muted)]/50 p-4">
            <dt className="text-[11px] font-semibold uppercase tracking-wider text-[var(--muted-foreground)]">
              Vendas ({context.windowDays}d)
            </dt>
            <dd className="mt-1 text-2xl font-bold tabular-nums">
              {context.unitsSoldInWindow}
            </dd>
          </div>
        </dl>

        <dl className="grid gap-3 sm:grid-cols-2">
          <div>
            <dt className="text-xs font-medium text-[var(--muted-foreground)]">
              Estoque vai durar
            </dt>
            <dd className="mt-0.5 font-medium">{plan.stockWillLast}</dd>
          </div>
          <div>
            <dt className="text-xs font-medium text-[var(--muted-foreground)]">
              Compra precisa iniciar em
            </dt>
            <dd
              className={
                plan.purchaseIsOverdue && plan.purchaseStartsOn
                  ? "mt-0.5 font-semibold text-rose-900"
                  : "mt-0.5 font-medium"
              }
            >
              {plan.purchaseStartsOn ?? "—"}
            </dd>
          </div>
          <div>
            <dt className="text-xs font-medium text-[var(--muted-foreground)]">
              Busca para agendamento
            </dt>
            <dd
              className={
                plan.searchIsOverdue && plan.searchStartsOn
                  ? "mt-0.5 font-semibold text-rose-900"
                  : "mt-0.5 font-medium"
              }
            >
              {plan.searchStartsOn ?? "—"}
            </dd>
          </div>
          <div>
            <dt className="text-xs font-medium text-[var(--muted-foreground)]">
              Novo estoque ativo em
            </dt>
            <dd className="mt-0.5 font-medium">{plan.activeStockOn ?? "—"}</dd>
          </div>
          {context.leadTimeDays > 0 ? (
            <div>
              <dt className="text-xs font-medium text-[var(--muted-foreground)]">
                Prazo compra → galpão
              </dt>
              <dd className="mt-0.5 font-medium">{context.leadTimeDays} dias</dd>
            </div>
          ) : null}
          {context.warehouseNotes ? (
            <div className="sm:col-span-2">
              <dt className="text-xs font-medium text-[var(--muted-foreground)]">
                Notas do galpão
              </dt>
              <dd className="mt-0.5 text-sm">{context.warehouseNotes}</dd>
            </div>
          ) : null}
        </dl>

        <Button variant="outline" size="sm" asChild>
          <Link href="/dashboard/inventory">Editar estoque no galpão</Link>
        </Button>
      </CardContent>
    </Card>
  );
}

export function ItemDetailMarginSection({
  context,
}: {
  context: ItemDetailContext;
}) {
  const row = context.financial;

  return (
    <Card className="shadow-sm">
      <CardHeader className="pb-2">
        <CardTitle className="text-lg text-[var(--primary)]">Margem</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {!row ? (
          <p className="text-sm text-[var(--muted-foreground)]">
            Não foi possível calcular a margem deste anúncio.
          </p>
        ) : row.productCost == null ? (
          <div className="space-y-2 text-sm text-[var(--muted-foreground)]">
            <p>
              {row.sku
                ? "SKU sem custo cadastrado — cadastre o produto para ver margem."
                : "Anúncio sem SKU — vincule um SKU para calcular margem."}
            </p>
            <Button variant="outline" size="sm" asChild>
              <Link href="/dashboard/produtos">Ir para produtos</Link>
            </Button>
          </div>
        ) : (
          <dl className="grid gap-3 sm:grid-cols-2">
            <div>
              <dt className="text-xs font-medium text-[var(--muted-foreground)]">
                Preço de venda
              </dt>
              <dd className="mt-0.5 font-semibold tabular-nums">
                {formatFinancialMoney(row.salePrice)}
              </dd>
            </div>
            <div>
              <dt className="text-xs font-medium text-[var(--muted-foreground)]">
                Custo produto
              </dt>
              <dd className="mt-0.5 tabular-nums">
                {formatFinancialMoney(row.productCost)}
              </dd>
            </div>
            <div>
              <dt className="text-xs font-medium text-[var(--muted-foreground)]">
                Taxa ML
              </dt>
              <dd className="mt-0.5 tabular-nums">
                {formatFinancialMoney(row.mlFeeAmount)}
              </dd>
            </div>
            <div>
              <dt className="text-xs font-medium text-[var(--muted-foreground)]">
                Frete
              </dt>
              <dd className="mt-0.5 tabular-nums">
                {formatFinancialMoney(row.shippingCost)}
              </dd>
            </div>
            <div>
              <dt className="text-xs font-medium text-[var(--muted-foreground)]">
                Margem
              </dt>
              <dd className="mt-0.5 font-semibold tabular-nums text-[var(--primary)]">
                {formatFinancialMoney(row.breakdown?.marginValue ?? null)}{" "}
                <span className="text-sm font-medium text-[var(--muted-foreground)]">
                  ({formatFinancialPercent(row.breakdown?.marginPercent ?? null)})
                </span>
              </dd>
            </div>
            {row.hasActiveAds && row.tacosPercent != null ? (
              <div>
                <dt className="text-xs font-medium text-[var(--muted-foreground)]">
                  TACOS
                </dt>
                <dd className="mt-0.5 tabular-nums">
                  {formatFinancialPercent(row.tacosPercent)}
                </dd>
              </div>
            ) : null}
          </dl>
        )}

        <Button variant="outline" size="sm" asChild>
          <Link href="/dashboard/lucratividade">Ver em Lucratividade</Link>
        </Button>
      </CardContent>
    </Card>
  );
}

export function ItemDetailCatalogSection({
  itemId,
  context,
}: {
  itemId: string;
  context: ItemDetailContext;
}) {
  const catalog = context.catalog;
  if (!catalog) return null;

  const gap = catalogPriceGap(
    catalog.catalogSellerPrice,
    catalog.catalogPriceToWin,
  );

  return (
    <Card className="shadow-sm">
      <CardHeader className="pb-2">
        <CardTitle className="text-lg text-[var(--primary)]">
          Competição de catálogo
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <span
            className={catalogStatusBadgeClass(catalog.catalogStatus)}
          >
            {catalogStatusLabel(
              (catalog.catalogStatus as "winning" | "losing" | "shared" | "unknown") ??
                "unknown",
            )}
          </span>
          {catalog.catalogPolledAt ? (
            <span className="text-xs text-[var(--muted-foreground)]">
              Última coleta: {formatDatePtBR(catalog.catalogPolledAt)}
            </span>
          ) : null}
        </div>

        <dl className="grid gap-3 sm:grid-cols-3">
          <div>
            <dt className="text-xs font-medium text-[var(--muted-foreground)]">
              Seu preço
            </dt>
            <dd className="mt-0.5 font-semibold tabular-nums">
              {formatFinancialMoney(catalog.catalogSellerPrice)}
            </dd>
          </div>
          <div>
            <dt className="text-xs font-medium text-[var(--muted-foreground)]">
              Para ganhar
            </dt>
            <dd className="mt-0.5 tabular-nums">
              {formatFinancialMoney(catalog.catalogPriceToWin)}
            </dd>
          </div>
          <div>
            <dt className="text-xs font-medium text-[var(--muted-foreground)]">
              Gap
            </dt>
            <dd className="mt-0.5 tabular-nums">
              {gap != null && catalog.catalogStatus === "losing"
                ? formatFinancialMoney(gap)
                : "—"}
            </dd>
          </div>
        </dl>

        <Button variant="outline" size="sm" asChild>
          <Link href={`/dashboard/catalog-report/${itemId}`}>
            Ver relatório de competição
          </Link>
        </Button>
      </CardContent>
    </Card>
  );
}

export function ItemDetailOperationsSection({
  context,
}: {
  context: ItemDetailContext;
}) {
  const cycle = context.openCycle;
  if (!cycle) return null;

  const labels = statusLabelsForKind(cycle.kind);
  const kindLabel = cycle.kind === "purchase" ? "Compra" : "Full";

  return (
    <Card className="shadow-sm">
      <CardHeader className="pb-2">
        <CardTitle className="text-lg text-[var(--primary)]">Operações</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm">
          Ciclo de <strong>{kindLabel}</strong> em andamento:{" "}
          <span className="font-medium">{labels[cycle.status]}</span>
        </p>
        <Button variant="outline" size="sm" asChild>
          <Link
            href={
              cycle.kind === "full"
                ? "/dashboard/operacoes-full"
                : "/dashboard/compras?tab=kanban"
            }
          >
            Ver no kanban
          </Link>
        </Button>
      </CardContent>
    </Card>
  );
}

export function ItemDetailHeroMeta({
  item,
  context,
}: {
  item: ItemBody;
  context: ItemDetailContext;
}) {
  const listingType = listingTypeLabelFromId(item.listing_type_id);

  return (
    <>
      <div className="flex flex-wrap gap-2">
        {listingType ? (
          <Badge variant="secondary">{listingType}</Badge>
        ) : null}
        <Badge variant="outline">
          {item.catalog_listing ? "Catálogo" : "Próprio"}
        </Badge>
        <ListingStatusBadge
          status={item.status}
          mlStock={context.mlStock}
          warehouseStock={context.warehouseStock}
        />
      </div>

      <dl className="grid gap-4 sm:grid-cols-2">
        <div className="rounded-xl border border-[var(--border)] bg-[var(--muted)]/50 p-4">
          <dt className="text-[11px] font-semibold uppercase tracking-wider text-[var(--muted-foreground)]">
            Vendidos (total ML)
          </dt>
          <dd className="mt-1 text-2xl font-bold tabular-nums text-[var(--foreground)]">
            {item.sold_quantity ?? 0}
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
        <div>
          <dt className="text-xs font-medium text-[var(--muted-foreground)]">
            Logística
          </dt>
          <dd className="mt-0.5 text-sm capitalize">{formatLogistics(item)}</dd>
        </div>
        {context.categoryName ? (
          <div>
            <dt className="text-xs font-medium text-[var(--muted-foreground)]">
              Categoria
            </dt>
            <dd className="mt-0.5 text-sm">{context.categoryName}</dd>
          </div>
        ) : item.category_id ? (
          <div>
            <dt className="text-xs font-medium text-[var(--muted-foreground)]">
              Categoria
            </dt>
            <dd className="mt-0.5 font-mono text-sm">{item.category_id}</dd>
          </div>
        ) : null}
        {item.date_created ? (
          <div>
            <dt className="text-xs font-medium text-[var(--muted-foreground)]">
              Criado em
            </dt>
            <dd className="mt-0.5 text-sm">
              {formatDatePtBR(item.date_created)}
            </dd>
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
    </>
  );
}

export function ItemDetailVariationsSection({
  item,
}: {
  item: ItemBody;
}) {
  const variations =
    item.variations?.map((v) => ({
      id: v.id,
      qty: v.available_quantity ?? 0,
      label: variationLabel(v),
    })) ?? [];

  if (variations.length === 0) return null;

  return (
    <Card className="shadow-sm">
      <CardHeader className="pb-2">
        <CardTitle className="text-lg text-[var(--primary)]">
          Variações (estoque)
        </CardTitle>
      </CardHeader>
      <CardContent>
        <ul className="divide-y divide-[var(--border)] rounded-lg border border-[var(--border)]">
          {variations.map((v) => (
            <li
              key={v.id}
              className="flex items-center justify-between gap-4 px-4 py-3 text-sm first:rounded-t-lg last:rounded-b-lg"
            >
              <span className="text-[var(--foreground)]">{v.label}</span>
              <span className="font-mono text-xs text-[var(--muted-foreground)]">
                {v.id}
              </span>
              <span className="tabular-nums font-semibold">{v.qty}</span>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
