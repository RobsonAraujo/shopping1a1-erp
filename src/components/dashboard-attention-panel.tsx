"use client";

import Image from "next/image";
import Link from "next/link";
import { AlertTriangle, ImageOff, LayoutGrid } from "lucide-react";
import { stockPlanningConfig } from "@/config/stock-planning";
import { bestItemImageUrl } from "@/lib/mercadolibre/item-image";
import { getItemSku } from "@/lib/mercadolibre/item-sku";
import { computeStockPlanningDisplay } from "@/lib/stock-planning";
import type { ItemBody } from "@/lib/mercadolibre/types";
import { MetricWithHint } from "@/components/metric-with-hint";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { TooltipProvider } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

export function DashboardAttentionPanel({
  items,
  salesByItem,
}: {
  items: ItemBody[];
  salesByItem: Record<string, number>;
}) {
  const w = stockPlanningConfig.salesAverageWindowDays;

  const rows = items
    .map((item) => {
      const sold = salesByItem[item.id] ?? 0;
      const plan = computeStockPlanningDisplay(
        item.available_quantity,
        sold,
        w,
        stockPlanningConfig,
      );
      return { item, plan };
    })
    .filter(({ plan }) => plan.needsSchedulingAttention);

  rows.sort((a, b) => {
    if (a.plan.searchIsOverdue !== b.plan.searchIsOverdue) {
      return a.plan.searchIsOverdue ? -1 : 1;
    }
    const aMs = a.plan.searchStartsAtMs ?? 0;
    const bMs = b.plan.searchStartsAtMs ?? 0;
    return aMs - bMs;
  });

  return (
    <TooltipProvider delayDuration={200}>
      <section id="prioridades" className="scroll-mt-24">
        <Card className="overflow-hidden border-amber-200/90 bg-gradient-to-br from-amber-50/90 via-white to-[var(--card)] shadow-md ring-1 ring-amber-100/70">
          <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-4 space-y-0 pb-3">
            <div className="space-y-1.5">
              <div className="flex flex-wrap items-center gap-2">
                <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-amber-100 text-amber-900">
                  <AlertTriangle className="size-5" aria-hidden />
                </span>
                <CardTitle className="text-lg text-[var(--primary)]">
                  Precisa de atenção agora
                </CardTitle>
              </div>
              <CardDescription className="max-w-2xl text-sm leading-relaxed">
                Data de início da busca ou agendamento é hoje ou já passou —
                hora de agendar e planejar estoque.
              </CardDescription>
            </div>
            {rows.length > 0 ? (
              <Badge variant="warning" className="shrink-0 px-3 py-1 text-sm">
                {rows.length} {rows.length === 1 ? "anúncio" : "anúncios"}
              </Badge>
            ) : null}
          </CardHeader>
          <CardContent className="pb-4">
            {rows.length === 0 ? (
              <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-[var(--border)] bg-[var(--muted)]/30 px-6 py-12 text-center">
                <LayoutGrid
                  className="mb-3 size-10 text-[var(--muted-foreground)] opacity-60"
                  aria-hidden
                />
                <p className="max-w-md text-sm leading-relaxed text-[var(--muted-foreground)]">
                  Nenhum anúncio nesta situação no momento. Quando a data de
                  agendamento chegar (ou atrasar), ele aparece aqui.
                </p>
              </div>
            ) : (
              <ul className="space-y-2.5">
                {rows.map(({ item, plan }) => {
                  const urgent = plan.searchIsOverdue;
                  const imageUrl = bestItemImageUrl(item);
                  const sku = getItemSku(item);
                  return (
                    <li
                      key={item.id}
                      className={cn(
                        "rounded-lg border bg-[var(--card)] px-3 py-2.5 transition-colors hover:bg-[var(--muted)]/20",
                        urgent
                          ? "border-rose-200 bg-rose-50/40"
                          : "border-[var(--border)]",
                      )}
                    >
                      <div className="flex items-start gap-3">
                        <Link
                          href={`/dashboard/items/${item.id}`}
                          className="relative shrink-0 overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--muted)] ring-offset-2 transition-opacity hover:opacity-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
                          aria-label={`Abrir detalhes: ${item.title}`}
                        >
                          {imageUrl ? (
                            <Image
                              src={imageUrl}
                              alt=""
                              width={80}
                              height={80}
                              className="size-14 object-contain sm:size-16"
                              sizes="64px"
                            />
                          ) : (
                            <div className="flex size-14 items-center justify-center sm:size-16">
                              <ImageOff
                                className="size-6 text-[var(--muted-foreground)]/70"
                                aria-hidden
                              />
                            </div>
                          )}
                        </Link>
                        <div className="min-w-0 flex-1 space-y-1.5">
                          <div className="flex flex-wrap items-start justify-between gap-1.5">
                            <Link
                              href={`/dashboard/items/${item.id}`}
                              className="min-w-0 flex-1 underline-offset-2 hover:underline"
                              title={item.title}
                            >
                              <span className="block truncate text-sm font-semibold leading-snug text-[var(--primary)] sm:text-base">
                                {sku ?? "Sem SKU"}
                              </span>
                              <span className="mt-0.5 block truncate text-xs font-normal leading-snug text-[var(--muted-foreground)]">
                                {item.title}
                              </span>
                            </Link>
                            <div className="flex shrink-0 items-center gap-1.5">
                              {item.catalog_listing ? (
                                <Badge
                                  variant="secondary"
                                  className="h-6 px-2 text-[11px]"
                                >
                                  Catálogo
                                </Badge>
                              ) : null}
                              {urgent ? (
                                <Badge
                                  variant="overdue"
                                  className="h-6 px-2 text-[11px]"
                                >
                                  Atrasado
                                </Badge>
                              ) : (
                                <Badge
                                  variant="secondary"
                                  className="h-6 px-2 text-[11px]"
                                >
                                  Hoje
                                </Badge>
                              )}
                            </div>
                          </div>
                          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-[var(--muted-foreground)]">
                            <span className="tabular-nums">
                              Estoque:{" "}
                              <span className="font-semibold text-[var(--foreground)]">
                                {item.available_quantity}
                              </span>
                            </span>
                            <MetricWithHint
                              content={plan.tooltips.stockWillLast}
                            >
                              <span>
                                Cobertura:{" "}
                                <span className="font-semibold text-[var(--foreground)]">
                                  {plan.stockWillLast}
                                </span>
                              </span>
                            </MetricWithHint>
                            <MetricWithHint content={plan.tooltips.search}>
                              <span>
                                Buscar em:{" "}
                                <span
                                  className={cn(
                                    "font-semibold",
                                    urgent
                                      ? "text-rose-900"
                                      : "text-[var(--foreground)]",
                                  )}
                                >
                                  {plan.searchStartsOn ?? "—"}
                                </span>
                              </span>
                            </MetricWithHint>
                            <MetricWithHint content={plan.tooltips.activeStock}>
                              <span>
                                Ativo em:{" "}
                                <span className="font-semibold text-[var(--foreground)]">
                                  {plan.activeStockOn ?? "—"}
                                </span>
                              </span>
                            </MetricWithHint>
                            <span className="font-mono text-[11px]">
                              {item.id}
                            </span>
                          </div>
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </CardContent>
        </Card>
      </section>
    </TooltipProvider>
  );
}
