"use client";

import Image from "next/image";
import Link from "next/link";
import { useMemo, useState } from "react";
import { AlertTriangle, ImageOff } from "lucide-react";
import { stockPlanningConfig } from "@/config/stock-planning";
import { Badge } from "@/components/ui/badge";
import {
  catalogPriceGap,
  catalogStatusBadgeClass,
  catalogStatusLabel,
} from "@/lib/catalog-competition";
import type {
  CatalogListingInfo,
  DashboardItemsEnrichment,
} from "@/lib/dashboard-items-enrichment";
import { formatFinancialMoney } from "@/lib/financial-margin";
import { bestItemImageUrl } from "@/lib/mercadolibre/item-image";
import { getItemSku } from "@/lib/mercadolibre/item-sku";
import { computeStockPlanningDisplay } from "@/lib/stock-planning";
import type { ItemBody } from "@/lib/mercadolibre/types";
import {
  ListingStatusBadge,
  listingRowMutedClass,
} from "@/components/listing-status-badge";
import { MetricWithHint } from "@/components/metric-with-hint";
import { mlAvailableStockUnits } from "@/lib/mercadolibre/ml-available-stock";
import {
  ItemListSearch,
  itemListSearchEmptyMessage,
} from "@/components/item-list-search";
import { Card } from "@/components/ui/card";
import { TooltipProvider } from "@/components/ui/tooltip";
import { filterByItemListSearch } from "@/lib/item-list-search";
import { statusLabelsForKind } from "@/lib/replenishment-cycle";
import { cn } from "@/lib/utils";

type DashboardItemsTableProps = {
  items: ItemBody[];
  salesByItem: Record<string, number>;
  variant: "own" | "catalog";
  enrichment?: DashboardItemsEnrichment;
};

const emptyEnrichment: DashboardItemsEnrichment = {
  warehouseById: {},
  leadTimeById: {},
  catalogById: {},
  openCycleById: {},
};

export function DashboardItemsTable({
  items,
  salesByItem,
  variant,
  enrichment = emptyEnrichment,
}: DashboardItemsTableProps) {
  const w = stockPlanningConfig.salesAverageWindowDays;
  const [searchQuery, setSearchQuery] = useState("");
  const filteredItems = useMemo(
    () =>
      filterByItemListSearch(items, searchQuery, (item) => ({
        sku: getItemSku(item),
        title: item.title,
        mlItemId: item.id,
      })),
    [items, searchQuery],
  );

  const colSpan = variant === "catalog" ? 12 : 11;

  return (
    <TooltipProvider delayDuration={200}>
      <div className="space-y-3">
        <ItemListSearch
          value={searchQuery}
          onChange={setSearchQuery}
          filteredCount={filteredItems.length}
          totalCount={items.length}
        />
        <Card className="overflow-hidden p-0 shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[72rem] text-left text-sm">
              <thead className="border-b border-[var(--border)] bg-[var(--muted)]/80">
                <tr>
                  <th className="px-4 py-3.5 text-xs font-semibold uppercase tracking-wide text-[var(--muted-foreground)]">
                    Produto
                  </th>
                  <th className="hidden px-4 py-3.5 text-xs font-semibold uppercase tracking-wide text-[var(--muted-foreground)] sm:table-cell">
                    ID
                  </th>
                  <th className="px-4 py-3.5 text-xs font-semibold uppercase tracking-wide text-[var(--muted-foreground)]">
                    ML
                  </th>
                  <th className="hidden px-4 py-3.5 text-xs font-semibold uppercase tracking-wide text-[var(--muted-foreground)] md:table-cell">
                    Galpão
                  </th>
                  <th className="px-4 py-3.5 text-xs font-semibold uppercase tracking-wide text-[var(--muted-foreground)]">
                    Total
                  </th>
                  <th className="hidden px-4 py-3.5 text-xs font-semibold uppercase tracking-wide text-[var(--muted-foreground)] lg:table-cell">
                    Preço
                  </th>
                  <th className="hidden px-4 py-3.5 text-xs font-semibold uppercase tracking-wide text-[var(--muted-foreground)] md:table-cell">
                    Vendas ({w}d)
                  </th>
                  <th className="px-4 py-3.5 text-xs font-semibold uppercase tracking-wide text-[var(--muted-foreground)]">
                    Estoque vai durar
                  </th>
                  {variant === "own" ? (
                    <>
                      <th className="max-w-[11rem] px-4 py-3.5 text-xs font-semibold uppercase leading-tight tracking-wide text-[var(--muted-foreground)]">
                        Compra precisa iniciar em
                      </th>
                      <th className="max-w-[11rem] px-4 py-3.5 text-xs font-semibold uppercase leading-tight tracking-wide text-[var(--muted-foreground)]">
                        Busca agendamento
                      </th>
                      <th className="max-w-[11rem] px-4 py-3.5 text-xs font-semibold uppercase leading-tight tracking-wide text-[var(--muted-foreground)]">
                        Estoque ativo em
                      </th>
                    </>
                  ) : (
                    <>
                      <th className="px-4 py-3.5 text-xs font-semibold uppercase tracking-wide text-[var(--muted-foreground)]">
                        Competição
                      </th>
                      <th className="hidden px-4 py-3.5 text-xs font-semibold uppercase tracking-wide text-[var(--muted-foreground)] lg:table-cell">
                        Seu preço
                      </th>
                      <th className="hidden px-4 py-3.5 text-xs font-semibold uppercase tracking-wide text-[var(--muted-foreground)] lg:table-cell">
                        Para ganhar
                      </th>
                      <th className="hidden px-4 py-3.5 text-xs font-semibold uppercase tracking-wide text-[var(--muted-foreground)] xl:table-cell">
                        Gap
                      </th>
                    </>
                  )}
                </tr>
              </thead>
              <tbody>
                {filteredItems.length === 0 ? (
                  <tr>
                    <td
                      colSpan={colSpan}
                      className="px-4 py-12 text-center text-[var(--muted-foreground)]"
                    >
                      {items.length === 0
                        ? "Nenhum anúncio nesta categoria nesta página."
                        : itemListSearchEmptyMessage(searchQuery)}
                    </td>
                  </tr>
                ) : (
                  filteredItems.map((item) => (
                    <DashboardItemRow
                      key={item.id}
                      item={item}
                      sold={salesByItem[item.id] ?? 0}
                      variant={variant}
                      enrichment={enrichment}
                      windowDays={w}
                    />
                  ))
                )}
              </tbody>
            </table>
          </div>
        </Card>
      </div>
    </TooltipProvider>
  );
}

function DashboardItemRow({
  item,
  sold,
  variant,
  enrichment,
  windowDays,
}: {
  item: ItemBody;
  sold: number;
  variant: "own" | "catalog";
  enrichment: DashboardItemsEnrichment;
  windowDays: number;
}) {
  const imageUrl = bestItemImageUrl(item);
  const sku = getItemSku(item);
  const mlStock = mlAvailableStockUnits(item);
  const warehouseStock = enrichment.warehouseById[item.id] ?? 0;
  const leadTimeDays = enrichment.leadTimeById[item.id] ?? 0;
  const totalStock = mlStock + warehouseStock;
  const plan = computeStockPlanningDisplay(
    totalStock,
    sold,
    windowDays,
    stockPlanningConfig,
    leadTimeDays,
  );
  const needsAttention =
    plan.needsPurchaseAttention || plan.needsSchedulingAttention;
  const openCycle = enrichment.openCycleById[item.id];
  const catalog = enrichment.catalogById[item.id];

  return (
    <tr
      className={cn(
        "border-b border-[var(--border)] transition-colors last:border-0 hover:bg-[var(--muted)]/40",
        listingRowMutedClass(item.status, mlStock, warehouseStock),
        needsAttention && "bg-amber-50/40",
      )}
    >
      <td className="align-top px-4 py-3.5">
        <div className="flex gap-2">
          {needsAttention ? (
            <AlertTriangle
              className="mt-1 size-4 shrink-0 text-amber-600"
              aria-label="Requer atenção"
            />
          ) : null}
          <div className="min-w-0 flex-1">
            <Link href={`/dashboard/items/${item.id}`} className="group flex gap-3">
              <span
                className="relative shrink-0 overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--muted)]"
                aria-hidden
              >
                {imageUrl ? (
                  <Image
                    src={imageUrl}
                    alt=""
                    width={128}
                    height={128}
                    className="size-12 object-contain sm:size-14"
                    sizes="56px"
                  />
                ) : (
                  <span className="flex size-12 items-center justify-center sm:size-14">
                    <ImageOff
                      className="size-5 text-[var(--muted-foreground)]/60"
                      aria-hidden
                    />
                  </span>
                )}
              </span>
              <span className="min-w-0 flex-1 overflow-hidden">
                <span
                  className="block max-w-full truncate font-semibold leading-snug text-[var(--primary)] underline-offset-2 group-hover:underline"
                  title={item.title}
                >
                  {sku ?? "Sem SKU"}
                </span>
                <span
                  className="mt-0.5 block text-xs text-[var(--muted-foreground)]"
                  title={item.title}
                >
                  {item.title}
                </span>
                <ListingStatusBadge
                  status={item.status}
                  mlStock={mlStock}
                  warehouseStock={warehouseStock}
                />
                {openCycle ? (
                  <Badge
                    variant="outline"
                    className="mt-1 h-4 max-w-full truncate px-1.5 text-[10px] font-normal"
                  >
                    {openCycle.kind === "purchase" ? "Compra" : "Full"}:{" "}
                    {statusLabelsForKind(openCycle.kind)[openCycle.status]}
                  </Badge>
                ) : null}
              </span>
            </Link>
            {variant === "catalog" ? (
              <Link
                href={`/dashboard/catalog-report/${item.id}`}
                className="mt-1 block text-[10px] text-[var(--primary)] hover:underline"
              >
                Relatório catálogo
              </Link>
            ) : null}
          </div>
        </div>
      </td>
      <td className="hidden align-top px-4 py-3.5 font-mono text-xs text-[var(--muted-foreground)] sm:table-cell">
        {item.id}
      </td>
      <td className="align-top px-4 py-3.5 tabular-nums">{mlStock}</td>
      <td className="hidden align-top px-4 py-3.5 tabular-nums md:table-cell">
        {warehouseStock}
      </td>
      <td className="align-top px-4 py-3.5 tabular-nums font-medium">
        {totalStock}
      </td>
      <td className="hidden align-top px-4 py-3.5 tabular-nums lg:table-cell">
        {item.currency_id}{" "}
        {item.price.toLocaleString("pt-BR", {
          minimumFractionDigits: 2,
        })}
      </td>
      <td className="hidden align-top px-4 py-3.5 tabular-nums md:table-cell">
        {sold}
      </td>
      <td className="align-top px-4 py-3.5 tabular-nums text-[var(--foreground)]">
        <MetricWithHint content={plan.tooltips.stockWillLast}>
          {plan.stockWillLast}
        </MetricWithHint>
      </td>
      {variant === "own" ? (
        <>
          <td className="max-w-[11rem] align-top px-4 py-3.5 text-xs leading-snug">
            <div
              className={cn(
                plan.purchaseIsOverdue &&
                  plan.purchaseStartsOn &&
                  "border-l-[3px] border-rose-600 pl-2.5 font-semibold text-rose-900",
              )}
            >
              <MetricWithHint content={plan.tooltips.purchase}>
                {plan.purchaseStartsOn ?? "—"}
              </MetricWithHint>
            </div>
          </td>
          <td className="max-w-[11rem] align-top px-4 py-3.5 text-xs leading-snug">
            <div
              className={cn(
                plan.searchIsOverdue &&
                  plan.searchStartsOn &&
                  "border-l-[3px] border-rose-600 pl-2.5 font-semibold text-rose-900",
              )}
            >
              <MetricWithHint content={plan.tooltips.search}>
                {plan.searchStartsOn ?? "—"}
              </MetricWithHint>
            </div>
          </td>
          <td className="max-w-[11rem] align-top px-4 py-3.5 text-xs leading-snug">
            <MetricWithHint content={plan.tooltips.activeStock}>
              {plan.activeStockOn ?? "—"}
            </MetricWithHint>
          </td>
        </>
      ) : (
        <CatalogCompetitionCells catalog={catalog} />
      )}
    </tr>
  );
}

function CatalogCompetitionCells({
  catalog,
}: {
  catalog: CatalogListingInfo | undefined;
}) {
  const gap =
    catalog != null
      ? catalogPriceGap(catalog.catalogSellerPrice, catalog.catalogPriceToWin)
      : null;

  return (
    <>
      <td className="align-top px-4 py-3.5">
        {catalog?.catalogStatus ? (
          <span className={catalogStatusBadgeClass(catalog.catalogStatus)}>
            {catalogStatusLabel(
              catalog.catalogStatus as "winning" | "losing" | "shared" | "unknown",
            )}
          </span>
        ) : (
          <span className="text-xs text-[var(--muted-foreground)]">—</span>
        )}
      </td>
      <td className="hidden align-top px-4 py-3.5 tabular-nums lg:table-cell">
        {formatFinancialMoney(catalog?.catalogSellerPrice ?? null)}
      </td>
      <td className="hidden align-top px-4 py-3.5 tabular-nums lg:table-cell">
        {formatFinancialMoney(catalog?.catalogPriceToWin ?? null)}
      </td>
      <td className="hidden align-top px-4 py-3.5 tabular-nums xl:table-cell">
        {catalog?.catalogStatus === "losing" && gap != null
          ? formatFinancialMoney(gap)
          : "—"}
      </td>
    </>
  );
}
