"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useMemo, useState } from "react";
import {
  Check,
  Copy,
  ExternalLink,
  ImageOff,
  LineChart,
} from "lucide-react";
import type { PurchaseAnalysisItemRow } from "@/lib/purchase-analysis-rows";
import { bestItemImageUrl } from "@/lib/mercadolibre/item-image";
import { buildMercadoLivreItemMetricsUrl } from "@/lib/mercadolibre/item-metrics-url";
import { formatSellerListingStartedLabel } from "@/lib/mercadolibre/listing-dates";
import {
  formatRevenueBRL,
  formatUnitsSold,
  getCalendarMonthLabels,
  getCalendarMonthRanges,
  REVENUE_TOOLTIP_HINT,
} from "@/lib/mercadolibre/revenue-periods";
import type {
  PurchasePerformanceTier,
  PurchaseRecommendation,
  PurchaseStatus,
} from "@/lib/purchase-analysis";
import {
  ListingStatusBadge,
  listingRowMutedClass,
} from "@/components/listing-status-badge";
import { MetricWithHint } from "@/components/metric-with-hint";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

const performanceLabels: Record<PurchasePerformanceTier, string> = {
  alta: "Alta",
  media: "Média",
  baixa: "Baixa",
  zero: "Zero",
};

const performanceVariants: Record<
  PurchasePerformanceTier,
  "success" | "secondary" | "warning" | "muted"
> = {
  alta: "success",
  media: "secondary",
  baixa: "warning",
  zero: "muted",
};

const statusLabels: Record<PurchaseStatus, string> = {
  urgente: "Urgente",
  planejar: "Planejar",
  ok: "OK",
  sem_vendas: "Sem vendas",
  evitar: "Evitar",
};

const statusVariants: Record<
  PurchaseStatus,
  "overdue" | "warning" | "success" | "muted" | "secondary"
> = {
  urgente: "overdue",
  planejar: "warning",
  ok: "success",
  sem_vendas: "muted",
  evitar: "secondary",
};

const recommendationLabels: Record<PurchaseRecommendation, string> = {
  comprar: "Comprar",
  revisar: "Revisar",
  nao_repor: "Não repor",
};

function formatCoverage(days: number | null): string {
  if (days === null) return "—";
  if (days < 1) return "< 1 dia";
  const floored = Math.floor(days);
  return `${floored} ${floored === 1 ? "dia" : "dias"}`;
}

function BadgeTooltip({
  content,
  children,
}: {
  content: string;
  children: React.ReactNode;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="inline-flex cursor-default">{children}</span>
      </TooltipTrigger>
      <TooltipContent side="top" className="max-w-xs text-left">
        {content}
      </TooltipContent>
    </Tooltip>
  );
}

function CopyableTooltipRow({
  label,
  value,
  displayValue,
}: {
  label: string;
  value: string | null;
  displayValue?: string;
}) {
  const [copied, setCopied] = useState(false);

  const copy = useCallback(
    async (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (!value) return;
      try {
        await navigator.clipboard.writeText(value);
        setCopied(true);
        window.setTimeout(() => setCopied(false), 1200);
      } catch {
        // ignore clipboard errors
      }
    },
    [value],
  );

  if (!value) {
    return (
      <div>
        <p className="text-[10px] font-medium uppercase tracking-wide text-[var(--muted-foreground)]">
          {label}
        </p>
        <p className="mt-0.5 font-semibold text-[var(--popover-foreground)]">
          {displayValue ?? "—"}
        </p>
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={copy}
      className="flex w-full items-start gap-2 rounded-md px-1 py-0.5 text-left transition-colors hover:bg-[var(--accent)]/60"
      title={`Copiar ${label.toLowerCase()}`}
    >
      <span className="min-w-0 flex-1">
        <span className="text-[10px] font-medium uppercase tracking-wide text-[var(--muted-foreground)]">
          {label}
        </span>
        <span className="mt-0.5 block font-semibold leading-snug text-[var(--popover-foreground)]">
          {displayValue ?? value}
        </span>
      </span>
      <span className="mt-0.5 shrink-0 text-[var(--muted-foreground)]">
        {copied ? (
          <Check className="size-3.5 text-emerald-600" aria-hidden />
        ) : (
          <Copy className="size-3.5" aria-hidden />
        )}
      </span>
      <span className="sr-only">
        {copied ? `${label} copiado` : `Copiar ${label.toLowerCase()}`}
      </span>
    </button>
  );
}

function ItemRevenueBadge({
  itemId,
  lastMonth,
  currentMonth,
  unitsLastMonth,
  unitsCurrentMonth,
}: {
  itemId: string;
  lastMonth: number;
  currentMonth: number;
  unitsLastMonth: number;
  unitsCurrentMonth: number;
}) {
  const monthLabels = useMemo(
    () => getCalendarMonthLabels(getCalendarMonthRanges()),
    [],
  );
  const metricsUrl = useMemo(
    () => buildMercadoLivreItemMetricsUrl(itemId),
    [itemId],
  );

  const hasLastMonth = lastMonth > 0 || unitsLastMonth > 0;
  const hasCurrentMonth = currentMonth > 0 || unitsCurrentMonth > 0;
  if (!hasLastMonth && !hasCurrentMonth) return null;

  const badgeLabel = hasLastMonth
    ? `${formatRevenueBRL(lastMonth)} · ${formatUnitsSold(unitsLastMonth)}`
    : `${formatRevenueBRL(currentMonth)} · ${formatUnitsSold(unitsCurrentMonth)}`;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="mt-0.5 inline-flex h-4 max-w-full min-w-0 cursor-pointer items-center truncate rounded-md border border-emerald-300/90 bg-emerald-50 px-1.5 text-[10px] font-medium text-emerald-900 underline decoration-emerald-400/50 decoration-dotted underline-offset-2 transition-all hover:border-emerald-400 hover:bg-emerald-100 hover:decoration-emerald-600/70 hover:shadow-sm active:bg-emerald-200/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/70 data-[state=open]:border-emerald-400 data-[state=open]:bg-emerald-100"
          aria-label={`Mês anterior: ${formatRevenueBRL(lastMonth)}, ${formatUnitsSold(unitsLastMonth)}. Toque para ver detalhes.`}
        >
          <span className="truncate tabular-nums">{badgeLabel}</span>
        </button>
      </PopoverTrigger>
      <PopoverContent side="top" align="start" className="w-56 space-y-2 p-2.5">
        <p className="text-[11px] font-medium text-[var(--foreground)]">
          Faturamento e vendas
        </p>
        <div className="space-y-1.5">
          <div className="text-[11px]">
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-[var(--muted-foreground)]">
                {monthLabels.lastMonth}
              </span>
              <span className="shrink-0 font-medium tabular-nums text-emerald-900">
                {formatRevenueBRL(lastMonth)}
              </span>
            </div>
            <div className="mt-0.5 flex justify-end text-[10px] tabular-nums text-emerald-900/80">
              {formatUnitsSold(unitsLastMonth)}
            </div>
          </div>
          <div className="text-[11px]">
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-[var(--muted-foreground)]">
                {monthLabels.currentMonth}
              </span>
              <span className="shrink-0 font-medium tabular-nums text-emerald-900">
                {formatRevenueBRL(currentMonth)}
              </span>
            </div>
            <div className="mt-0.5 flex justify-end text-[10px] tabular-nums text-emerald-900/80">
              {formatUnitsSold(unitsCurrentMonth)}
            </div>
          </div>
        </div>
        <p className="text-[10px] leading-snug text-[var(--muted-foreground)]">
          {REVENUE_TOOLTIP_HINT}
        </p>
        <a
          href={metricsUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-[10px] font-medium text-sky-700 transition-colors hover:text-sky-900 hover:underline"
        >
          Métricas no ML — últimos 30 dias
          <ExternalLink className="size-3 shrink-0" aria-hidden />
        </a>
      </PopoverContent>
    </Popover>
  );
}

function catalogStatusLabel(status: string | null): string | null {
  if (!status) return null;
  if (status === "winning") return "Ganhando";
  if (status === "losing") return "Perdendo";
  if (status === "shared") return "Compartilhado";
  return "Desconhecido";
}

function catalogReportHref(itemId: string) {
  return `/dashboard/catalog-report/${itemId}`;
}

function showCatalogReportLink(row: PurchaseAnalysisItemRow): boolean {
  return row.item.catalog_listing === true || row.catalogStatus !== null;
}

type SupplierPurchaseAnalysisTableProps = {
  rows: PurchaseAnalysisItemRow[];
  emptyMessage?: string;
};

export function SupplierPurchaseAnalysisTable({
  rows,
  emptyMessage = "Nenhum produto neste fornecedor.",
}: SupplierPurchaseAnalysisTableProps) {
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
                <th className="w-[8rem] px-2 py-3.5 text-xs font-semibold uppercase tracking-wide text-[var(--muted-foreground)]">
                  Estoque
                </th>
                <th className="w-[5rem] px-2 py-3.5 text-xs font-semibold uppercase tracking-wide text-[var(--muted-foreground)]">
                  Vendas
                </th>
                <th className="w-[5.5rem] px-2 py-3.5 text-xs font-semibold uppercase tracking-wide text-[var(--muted-foreground)]">
                  Cobertura
                </th>
                <th className="w-[4.5rem] px-2 py-3.5 text-xs font-semibold uppercase tracking-wide text-[var(--muted-foreground)]">
                  Rotação
                </th>
                <th className="w-[5.5rem] px-2 py-3.5 text-xs font-semibold uppercase tracking-wide text-[var(--muted-foreground)]">
                  Status
                </th>
                <th className="w-[4.5rem] px-2 py-3.5 text-xs font-semibold uppercase tracking-wide text-[var(--muted-foreground)]">
                  Qtd.
                </th>
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
                                alt=""
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
