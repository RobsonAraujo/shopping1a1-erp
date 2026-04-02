"use client";

import Link from "next/link";
import { AlertTriangle, LayoutGrid } from "lucide-react";
import { stockPlanningConfig } from "@/config/stock-planning";
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
          <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-4 space-y-0 pb-4">
            <div className="space-y-1.5">
              <div className="flex flex-wrap items-center gap-2">
                <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-amber-100 text-amber-900">
                  <AlertTriangle className="size-5" aria-hidden />
                </span>
                <CardTitle className="text-xl text-[var(--primary)]">
                  Precisa de atenção agora
                </CardTitle>
              </div>
              <CardDescription className="max-w-2xl text-[15px] leading-relaxed">
                Data de início da busca ou agendamento é hoje ou já passou —
                hora de agendar e planejar estoque.
              </CardDescription>
            </div>
            {rows.length > 0 ? (
              <Badge variant="warning" className="shrink-0 px-3 py-1 text-sm">
                {rows.length}{" "}
                {rows.length === 1 ? "anúncio" : "anúncios"}
              </Badge>
            ) : null}
          </CardHeader>
          <CardContent className="pb-6">
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
              <ul className="grid gap-4 lg:grid-cols-2">
                {rows.map(({ item, plan }) => {
                  const urgent = plan.searchIsOverdue;
                  return (
                    <li
                      key={item.id}
                      className={cn(
                        "rounded-xl border bg-[var(--card)] p-5 shadow-sm transition-shadow hover:shadow-md",
                        urgent
                          ? "border-amber-300 ring-1 ring-amber-200/80"
                          : "border-[var(--border)]",
                      )}
                    >
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <Link
                          href={`/dashboard/items/${item.id}`}
                          className="min-w-0 flex-1 text-base font-semibold leading-snug text-[var(--primary)] underline-offset-2 hover:underline sm:text-lg"
                        >
                          {item.title}
                        </Link>
                        {urgent ? (
                          <Badge variant="destructive" className="shrink-0 uppercase">
                            Atrasado
                          </Badge>
                        ) : (
                          <Badge variant="secondary" className="shrink-0">
                            Hoje
                          </Badge>
                        )}
                      </div>

                      <p className="mt-2 font-mono text-xs text-[var(--muted-foreground)]">
                        {item.id}
                      </p>

                      <div className="mt-5 grid gap-5 sm:grid-cols-3">
                        <div className="space-y-1">
                          <p className="text-[11px] font-semibold uppercase tracking-wider text-[var(--muted-foreground)]">
                            Estoque agora
                          </p>
                          <p className="text-3xl font-bold tabular-nums text-[var(--primary)]">
                            {item.available_quantity}
                            <span className="ml-1 text-lg font-semibold text-[var(--muted-foreground)]">
                              un.
                            </span>
                          </p>
                          <div className="text-xs text-[var(--muted-foreground)]">
                            <MetricWithHint content={plan.tooltips.stockWillLast}>
                              <span>
                                Cobertura ~{" "}
                                <span className="font-medium text-[var(--foreground)]">
                                  {plan.stockWillLast}
                                </span>
                              </span>
                            </MetricWithHint>
                          </div>
                        </div>

                        <div className="space-y-1">
                          <p className="text-[11px] font-semibold uppercase tracking-wider text-[var(--muted-foreground)]">
                            Iniciar busca / agendamento
                          </p>
                          <p
                            className={cn(
                              "text-2xl font-bold leading-tight tracking-tight",
                              urgent ? "text-amber-900" : "text-[var(--primary)]",
                            )}
                          >
                            {plan.searchStartsOn ?? "—"}
                          </p>
                          <p className="text-xs text-[var(--muted-foreground)]">
                            <MetricWithHint content={plan.tooltips.search}>
                              <span>Como calculamos</span>
                            </MetricWithHint>
                          </p>
                        </div>

                        <div className="space-y-1">
                          <p className="text-[11px] font-semibold uppercase tracking-wider text-[var(--muted-foreground)]">
                            Novo estoque ativo até
                          </p>
                          <p className="text-2xl font-bold leading-tight tracking-tight text-[var(--primary)]">
                            {plan.activeStockOn ?? "—"}
                          </p>
                          <p className="text-xs text-[var(--muted-foreground)]">
                            <MetricWithHint content={plan.tooltips.activeStock}>
                              <span>Como calculamos</span>
                            </MetricWithHint>
                          </p>
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
