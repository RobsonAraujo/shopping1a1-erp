"use client";

import Image from "next/image";
import Link from "next/link";
import { ExternalLink, ImageOff, LineChart } from "lucide-react";
import { bestItemImageUrl } from "@/lib/mercadolibre/item-image";
import { formatSellerListingStartedLabel } from "@/lib/mercadolibre/listing-dates";
import {
  ListingStatusBadge,
  listingRowMutedClass,
} from "@/components/listing-status-badge";
import { MetricWithHint } from "@/components/metric-with-hint";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { TooltipProvider } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { ItemRevenueBadge } from "@/components/compras/supplier-purchase-analysis-table/shared";
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
  type SupplierPurchaseAnalysisTableProps,
} from "@/components/compras/supplier-purchase-analysis-table/types";

export function SupplierPurchaseAnalysisTableMobile({
  rows,
  emptyMessage = "Nenhum produto neste fornecedor.",
}: SupplierPurchaseAnalysisTableProps) {
  if (rows.length === 0) {
    return (
      <Card className="px-4 py-12 text-center text-sm text-[var(--muted-foreground)]">
        {emptyMessage}
      </Card>
    );
  }

  return (
    <TooltipProvider delayDuration={200} disableHoverableContent={false}>
      <ul className="space-y-3">
        {rows.map((row) => {
          const { analysis } = row;
          const catalogLabel = catalogStatusLabel(row.catalogStatus);
          const showCatalogLink = showCatalogReportLink(row);
          const imageUrl = bestItemImageUrl(row.item);
          const listingStarted = formatSellerListingStartedLabel(row.item);

          return (
            <li key={row.item.id}>
              <Card
                className={cn(
                  "space-y-3 p-4 shadow-sm",
                  analysis.purchaseStatus === "urgente" && "bg-rose-50/30",
                  listingRowMutedClass(
                    row.item.status,
                    row.mlStock,
                    row.warehouseStock,
                  ),
                )}
              >
                <div className="flex min-w-0 gap-3">
                  <Link
                    href={`/dashboard/items/${row.item.id}`}
                    className="relative shrink-0 overflow-hidden rounded-md border border-[var(--border)] bg-[var(--muted)]"
                  >
                    {imageUrl ? (
                      <Image
                        src={imageUrl}
                        alt={row.item.title}
                        width={48}
                        height={48}
                        className="size-12 object-contain"
                        sizes="48px"
                      />
                    ) : (
                      <span className="flex size-12 items-center justify-center">
                        <ImageOff
                          className="size-4 text-[var(--muted-foreground)]/60"
                          aria-hidden
                        />
                      </span>
                    )}
                  </Link>
                  <div className="min-w-0 flex-1">
                    {listingStarted ? (
                      <p
                        className="text-[10px] leading-none text-[var(--muted-foreground)]"
                        title={listingStarted.hint}
                      >
                        {listingStarted.label}
                      </p>
                    ) : null}
                    <p className="mt-0.5 truncate text-sm font-semibold text-[var(--foreground)]">
                      {row.sku ?? "Sem SKU"}
                    </p>
                    <p className="mt-0.5 line-clamp-2 text-xs text-[var(--muted-foreground)]">
                      {row.item.title}
                    </p>
                    <div className="mt-1 flex flex-wrap items-center gap-1">
                      <ListingStatusBadge
                        status={row.item.status}
                        mlStock={row.mlStock}
                        warehouseStock={row.warehouseStock}
                      />
                      {row.categoryName ? (
                        <Badge
                          className="h-4 max-w-full truncate border-sky-200/80 bg-sky-50 px-1.5 text-[10px] font-normal text-sky-900"
                          title={row.categoryPath ?? undefined}
                        >
                          {row.categoryName}
                        </Badge>
                      ) : null}
                    </div>
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
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3 border-t border-[var(--border)] pt-3 text-xs">
                  <div>
                    <p className="text-[10px] uppercase tracking-wide text-[var(--muted-foreground)]">
                      Estoque
                    </p>
                    <div className="mt-0.5 space-y-0.5 tabular-nums">
                      <div>
                        <span className="text-[var(--muted-foreground)]">
                          Galpão:{" "}
                        </span>
                        {row.warehouseStock}
                      </div>
                      <div>
                        <span className="text-[var(--muted-foreground)]">
                          ML:{" "}
                        </span>
                        {row.mlStock}
                      </div>
                      <div className="font-medium text-[var(--foreground)]">
                        <span className="font-normal text-[var(--muted-foreground)]">
                          Total:{" "}
                        </span>
                        {row.totalStock}
                      </div>
                    </div>
                  </div>
                  <div>
                    <p className="text-[10px] uppercase tracking-wide text-[var(--muted-foreground)]">
                      Vendas / Cobertura
                    </p>
                    <div className="mt-0.5 space-y-0.5 tabular-nums">
                      <div>
                        {row.unitsSold} un. ·{" "}
                        {analysis.dailyAvg.toLocaleString("pt-BR", {
                          maximumFractionDigits: 2,
                        })}
                        /dia
                      </div>
                      <div className="text-[var(--muted-foreground)]">
                        Cobertura: {formatCoverage(analysis.coverageDays)}
                      </div>
                    </div>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-1.5 border-t border-[var(--border)] pt-3">
                  <Badge
                    variant={performanceVariants[analysis.performanceTier]}
                    className="h-5 px-1.5 text-[10px]"
                    title={analysis.performanceTooltip}
                  >
                    {performanceLabels[analysis.performanceTier]}
                  </Badge>
                  <Badge
                    variant={statusVariants[analysis.purchaseStatus]}
                    className="h-5 px-1.5 text-[10px]"
                    title={analysis.statusTooltip}
                  >
                    {statusLabels[analysis.purchaseStatus]}
                  </Badge>
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
                  <span className="ml-auto inline-flex items-center gap-1 text-xs font-medium tabular-nums">
                    <MetricWithHint content={analysis.recommendationTooltip}>
                      <span>Qtd. sugerida: {analysis.suggestedQty}</span>
                    </MetricWithHint>
                  </span>
                </div>

                <div className="flex flex-wrap gap-1.5 border-t border-[var(--border)] pt-3">
                  {showCatalogLink ? (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-auto min-h-9 flex-1 gap-1 whitespace-normal px-2 py-1.5 text-center leading-tight"
                      asChild
                    >
                      <Link href={catalogReportHref(row.item.id)} target="blank">
                        <LineChart className="size-3.5 shrink-0" aria-hidden />
                        <span>Relatório catálogo</span>
                      </Link>
                    </Button>
                  ) : null}
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="flex-1 gap-1.5"
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
              </Card>
            </li>
          );
        })}
      </ul>
    </TooltipProvider>
  );
}
