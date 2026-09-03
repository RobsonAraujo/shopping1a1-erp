"use client";

import Image from "next/image";
import Link from "next/link";
import { ExternalLink, ImageOff, LineChart } from "lucide-react";
import { bestItemImageUrl } from "@/lib/mercadolibre/item-image";
import { formatSellerListingStartedLabel } from "@/lib/mercadolibre/listing-dates";
import {
  ListingStatusBadge,
  listingRowMutedClass,
} from "@/components/shared/ListingStatusBadge";
import { MetricWithHint } from "@/components/shared/MetricWithHint";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { SortableTh } from "@/components/ui/sortable-th";
import { cn } from "@/lib/utils";
import {
  BadgeTooltip,
  CopyableTooltipRow,
  ItemRevenueBadge,
} from "@/components/compras/supplier-purchase-analysis-table/shared";
import {
  catalogReportHref,
  catalogStatusLabel,
  formatCoverage,
  performanceLabels,
  performanceVariants,
  recommendationLabels,
  showCatalogReportLink,
  statusLabels,
  statusVariants,
  type SupplierPurchaseAnalysisTableDesktopProps,
} from "@/components/compras/supplier-purchase-analysis-table/types";

export function SupplierPurchaseAnalysisTableDesktop({
  rows,
  emptyMessage = "Nenhum produto neste fornecedor.",
  sort,
  onSortChange,
}: SupplierPurchaseAnalysisTableDesktopProps) {
  return (
    <TooltipProvider delayDuration={200} disableHoverableContent={false}>
      <Card className="overflow-hidden p-0 shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full table-fixed text-left text-sm">
            <thead className="border-b border-[var(--border)] bg-[var(--muted)]/80">
              <tr>
                <th className="w-[10.5rem] max-w-[10.5rem] px-2.5 py-3.5 text-xs font-semibold uppercase tracking-wide text-[var(--muted-foreground)]">
                  Produto
                </th>
                <SortableTh
                  label="Estoque"
                  sortKey="totalStock"
                  sort={sort}
                  onSortChange={onSortChange}
                  align="left"
                  className="w-[8rem] px-2 py-3.5 text-xs font-semibold uppercase tracking-wide text-[var(--muted-foreground)]"
                />
                <SortableTh
                  label="Vendas"
                  sortKey="unitsSold"
                  sort={sort}
                  onSortChange={onSortChange}
                  align="left"
                  className="w-[5rem] px-2 py-3.5 text-xs font-semibold uppercase tracking-wide text-[var(--muted-foreground)]"
                />
                <SortableTh
                  label="Cobertura"
                  sortKey="coverageDays"
                  sort={sort}
                  onSortChange={onSortChange}
                  align="left"
                  className="w-[5.5rem] px-2 py-3.5 text-xs font-semibold uppercase tracking-wide text-[var(--muted-foreground)]"
                />
                <th className="w-[4.5rem] px-2 py-3.5 text-xs font-semibold uppercase tracking-wide text-[var(--muted-foreground)]">
                  Rotação
                </th>
                <th className="w-[5.5rem] px-2 py-3.5 text-xs font-semibold uppercase tracking-wide text-[var(--muted-foreground)]">
                  Status
                </th>
                <SortableTh
                  label="Qtd."
                  sortKey="suggestedQty"
                  sort={sort}
                  onSortChange={onSortChange}
                  align="left"
                  className="w-[4.5rem] px-2 py-3.5 text-xs font-semibold uppercase tracking-wide text-[var(--muted-foreground)]"
                />
                <th className="w-[6rem] px-2 py-3.5 text-xs font-semibold uppercase tracking-wide text-[var(--muted-foreground)]">
                  Ação
                </th>
                <th className="w-[6.5rem] px-2 py-3.5 text-xs font-semibold uppercase tracking-wide text-[var(--muted-foreground)]">
                  Ações
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td
                    colSpan={9}
                    className="px-4 py-12 text-center text-[var(--muted-foreground)]"
                  >
                    {emptyMessage}
                  </td>
                </tr>
              ) : (
                rows.map((row) => {
                  const { analysis } = row;
                  const catalogLabel = catalogStatusLabel(row.catalogStatus);
                  const showCatalogLink = showCatalogReportLink(row);
                  const imageUrl = bestItemImageUrl(row.item);
                  const listingStarted = formatSellerListingStartedLabel(
                    row.item,
                  );
                  return (
                    <tr
                      key={row.item.id}
                      className={cn(
                        "border-b border-[var(--border)] transition-colors last:border-0 hover:bg-[var(--muted)]/40",
                        analysis.purchaseStatus === "urgente" &&
                          "bg-rose-50/30",
                        listingRowMutedClass(
                          row.item.status,
                          row.mlStock,
                          row.warehouseStock,
                        ),
                      )}
                    >
                      <td className="max-w-[10.5rem] align-middle px-2.5 py-3">
                        {listingStarted ? (
                          <p
                            className="mb-1 text-[10px] leading-none text-[var(--muted-foreground)]"
                            title={listingStarted.hint}
                          >
                            {listingStarted.label}
                          </p>
                        ) : null}
                        <div className="flex min-w-0 gap-2">
                          <Link
                            href={`/dashboard/items/${row.item.id}`}
                            className="relative shrink-0 overflow-hidden rounded-md border border-[var(--border)] bg-[var(--muted)]"
                          >
                            {imageUrl ? (
                              <Image
                                src={imageUrl}
                                alt={row.item.title}
                                width={40}
                                height={40}
                                className="size-10 object-contain"
                                sizes="40px"
                              />
                            ) : (
                              <span className="flex size-10 items-center justify-center">
                                <ImageOff
                                  className="size-4 text-[var(--muted-foreground)]/60"
                                  aria-hidden
                                />
                              </span>
                            )}
                          </Link>
                          <span className="min-w-0 flex-1 overflow-hidden">
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <span className="block min-w-0 cursor-default overflow-hidden">
                                  <span className="block truncate text-xs font-semibold leading-snug text-[var(--foreground)]">
                                    {row.sku ?? "Sem SKU"}
                                  </span>
                                  <span className="mt-0.5 block truncate text-[11px] leading-snug text-[var(--muted-foreground)]">
                                    {row.item.title}
                                  </span>
                                </span>
                              </TooltipTrigger>
                              <TooltipContent
                                side="top"
                                className="pointer-events-auto max-w-xs space-y-2 p-2.5 text-left"
                              >
                                <CopyableTooltipRow
                                  label="SKU"
                                  value={row.sku}
                                  displayValue={row.sku ?? "Sem SKU"}
                                />
                                <CopyableTooltipRow
                                  label="Nome"
                                  value={row.item.title}
                                />
                                {row.categoryPath ? (
                                  <p className="px-1 text-[var(--muted-foreground)]">
                                    Categoria: {row.categoryPath}
                                  </p>
                                ) : null}
                                {listingStarted ? (
                                  <p
                                    className="px-1 text-[var(--muted-foreground)]"
                                    title={listingStarted.hint}
                                  >
                                    {listingStarted.label}
                                  </p>
                                ) : null}
                              </TooltipContent>
                            </Tooltip>
                            <ListingStatusBadge
                              status={row.item.status}
                              mlStock={row.mlStock}
                              warehouseStock={row.warehouseStock}
                            />
                            {row.categoryName ? (
                              <Badge
                                className="mt-0.5 h-4 max-w-full truncate border-sky-200/80 bg-sky-50 px-1.5 text-[10px] font-normal text-sky-900"
                                title={row.categoryPath ?? undefined}
                              >
                                {row.categoryName}
                              </Badge>
                            ) : null}
                            <ItemRevenueBadge
                              itemId={row.item.id}
                              lastMonth={row.revenueLastMonth}
                              currentMonth={row.revenueCurrentMonth}
                              unitsLastMonth={row.unitsSoldLastMonth}
                              unitsCurrentMonth={row.unitsSoldCurrentMonth}
                            />
                            {showCatalogLink ? (
                              <Link
                                href={catalogReportHref(row.item.id)}
                                className="mt-1 inline-flex max-w-full hover:underline"
                                title="Ver timeline de catálogo"
                              >
                                <Badge
                                  variant="outline"
                                  className="h-4 max-w-full truncate px-1 text-[9px]"
                                >
                                  {catalogLabel ?? "Catálogo"}
                                </Badge>
                              </Link>
                            ) : null}
                          </span>
                        </div>
                      </td>
                      <td className="align-middle px-2 py-3 text-xs whitespace-nowrap tabular-nums">
                        <div>
                          <span className="text-[var(--muted-foreground)]">
                            Galpão:{" "}
                          </span>
                          {row.warehouseStock}
                        </div>
                        <div>
                          <span className="text-[var(--muted-foreground)]">
                            ML (estoque):{" "}
                          </span>
                          {row.mlStock}
                        </div>
                        <div className="font-medium text-[var(--foreground)]">
                          <span className="font-normal text-[var(--muted-foreground)]">
                            Total:{" "}
                          </span>
                          {row.totalStock}
                        </div>
                      </td>
                      <td className="align-middle px-2 py-3 tabular-nums">
                        <div>{row.unitsSold}</div>
                        <div className="text-xs text-[var(--muted-foreground)]">
                          {analysis.dailyAvg.toLocaleString("pt-BR", {
                            maximumFractionDigits: 2,
                          })}
                          /dia
                        </div>
                      </td>
                      <td className="align-middle px-2 py-3 tabular-nums text-[var(--muted-foreground)]">
                        {formatCoverage(analysis.coverageDays)}
                      </td>
                      <td className="align-middle px-2 py-3">
                        <BadgeTooltip content={analysis.performanceTooltip}>
                          <Badge
                            variant={
                              performanceVariants[analysis.performanceTier]
                            }
                            className="h-5 px-1.5 text-[10px]"
                          >
                            {performanceLabels[analysis.performanceTier]}
                          </Badge>
                        </BadgeTooltip>
                      </td>
                      <td className="align-middle px-2 py-3">
                        <BadgeTooltip content={analysis.statusTooltip}>
                          <Badge
                            variant={statusVariants[analysis.purchaseStatus]}
                            className="h-5 px-1.5 text-[10px]"
                          >
                            {statusLabels[analysis.purchaseStatus]}
                          </Badge>
                        </BadgeTooltip>
                      </td>
                      <td className="align-middle px-2 py-3 tabular-nums font-medium">
                        <MetricWithHint
                          content={analysis.recommendationTooltip}
                        >
                          <span>{analysis.suggestedQty}</span>
                        </MetricWithHint>
                      </td>
                      <td className="align-middle px-2 py-3">
                        <Badge
                          variant={
                            analysis.recommendation === "comprar"
                              ? "success"
                              : analysis.recommendation === "nao_repor"
                                ? "muted"
                                : "warning"
                          }
                          className="h-5 px-1.5 text-[10px]"
                        >
                          {recommendationLabels[analysis.recommendation]}
                        </Badge>
                      </td>
                      <td className="align-middle px-2 py-3">
                        <div className="flex flex-wrap gap-1.5">
                          {showCatalogLink ? (
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              className="h-auto min-h-8 max-w-[5.5rem] shrink gap-1 whitespace-normal px-1.5 py-1.5 text-center leading-tight"
                              asChild
                            >
                              <Link
                                href={catalogReportHref(row.item.id)}
                                target="blank"
                              >
                                <LineChart
                                  className="size-3.5 shrink-0"
                                  aria-hidden
                                />
                                <span>Relatório catálogo</span>
                              </Link>
                            </Button>
                          ) : null}
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="gap-1.5"
                            asChild
                          >
                            <a
                              href={row.item.permalink}
                              target="_blank"
                              rel="noopener noreferrer"
                            >
                              <ExternalLink className="size-3.5" aria-hidden />
                              ML
                            </a>
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </TooltipProvider>
  );
}
