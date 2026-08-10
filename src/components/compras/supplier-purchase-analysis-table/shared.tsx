"use client";

import { useCallback, useMemo, useState } from "react";
import { Check, Copy, ExternalLink } from "lucide-react";
import { buildMercadoLivreItemMetricsUrl } from "@/lib/mercadolibre/item-metrics-url";
import {
  formatRevenueBRL,
  formatUnitsSold,
  getCalendarMonthLabels,
  getCalendarMonthRanges,
  REVENUE_TOOLTIP_HINT,
} from "@/lib/mercadolibre/revenue-periods";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

export function BadgeTooltip({
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

export function CopyableTooltipRow({
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

export function ItemRevenueBadge({
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
