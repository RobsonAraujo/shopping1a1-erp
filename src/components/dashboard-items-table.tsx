"use client";

import Image from "next/image";
import Link from "next/link";
import { ImageOff } from "lucide-react";
import { stockPlanningConfig } from "@/config/stock-planning";
import { bestItemImageUrl } from "@/lib/mercadolibre/item-image";
import { computeStockPlanningDisplay } from "@/lib/stock-planning";
import type { ItemBody } from "@/lib/mercadolibre/types";
import { MetricWithHint } from "@/components/metric-with-hint";
import { Card } from "@/components/ui/card";
import { TooltipProvider } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

export function DashboardItemsTable({
  items,
  salesByItem,
}: {
  items: ItemBody[];
  salesByItem: Record<string, number>;
}) {
  const w = stockPlanningConfig.salesAverageWindowDays;

  return (
    <TooltipProvider delayDuration={200}>
      <Card className="overflow-hidden p-0 shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[60rem] text-left text-sm">
            <thead className="border-b border-[var(--border)] bg-[var(--muted)]/80">
              <tr>
                <th className="px-4 py-3.5 text-xs font-semibold uppercase tracking-wide text-[var(--muted-foreground)]">
                  Produto
                </th>
                <th className="hidden px-4 py-3.5 text-xs font-semibold uppercase tracking-wide text-[var(--muted-foreground)] sm:table-cell">
                  ID
                </th>
                <th className="px-4 py-3.5 text-xs font-semibold uppercase tracking-wide text-[var(--muted-foreground)]">
                  Estoque
                </th>
                <th className="hidden px-4 py-3.5 text-xs font-semibold uppercase tracking-wide text-[var(--muted-foreground)] lg:table-cell">
                  Preço
                </th>
                <th className="px-4 py-3.5 text-xs font-semibold uppercase tracking-wide text-[var(--muted-foreground)]">
                  Estoque vai durar
                </th>
                <th className="max-w-[11rem] px-4 py-3.5 text-xs font-semibold uppercase leading-tight tracking-wide text-[var(--muted-foreground)]">
                  A busca para agendamento precisa iniciar em
                </th>
                <th className="max-w-[11rem] px-4 py-3.5 text-xs font-semibold uppercase leading-tight tracking-wide text-[var(--muted-foreground)]">
                  O novo estoque precisa entrar ativo em
                </th>
              </tr>
            </thead>
            <tbody>
              {items.length === 0 ? (
                <tr>
                  <td
                    colSpan={7}
                    className="px-4 py-12 text-center text-[var(--muted-foreground)]"
                  >
                    Nenhum anúncio nesta categoria nesta página.
                  </td>
                </tr>
              ) : (
                items.map((item) => {
                  const sold = salesByItem[item.id] ?? 0;
                  const imageUrl = bestItemImageUrl(item);
                  const plan = computeStockPlanningDisplay(
                    item.available_quantity,
                    sold,
                    w,
                    stockPlanningConfig,
                  );
                  return (
                    <tr
                      key={item.id}
                      className="border-b border-[var(--border)] transition-colors last:border-0 hover:bg-[var(--muted)]/40"
                    >
                      <td className="align-top px-4 py-3.5">
                        <Link
                          href={`/dashboard/items/${item.id}`}
                          className="group flex gap-3"
                        >
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
                          <span className="min-w-0 flex-1 font-medium leading-snug text-[var(--primary)] underline-offset-2 group-hover:underline">
                            {item.title}
                          </span>
                        </Link>
                      </td>
                      <td className="hidden align-top px-4 py-3.5 font-mono text-xs text-[var(--muted-foreground)] sm:table-cell">
                        {item.id}
                      </td>
                      <td className="align-top px-4 py-3.5 tabular-nums">
                        {item.available_quantity}
                      </td>
                      <td className="hidden align-top px-4 py-3.5 tabular-nums lg:table-cell">
                        {item.currency_id}{" "}
                        {item.price.toLocaleString("pt-BR", {
                          minimumFractionDigits: 2,
                        })}
                      </td>
                      <td className="align-top px-4 py-3.5 tabular-nums text-[var(--foreground)]">
                        <MetricWithHint content={plan.tooltips.stockWillLast}>
                          {plan.stockWillLast}
                        </MetricWithHint>
                      </td>
                      <td
                        className={cn(
                          "max-w-[11rem] align-top px-4 py-3.5 text-xs leading-snug",
                          plan.searchIsOverdue && plan.searchStartsOn
                            ? "font-medium text-amber-900"
                            : "text-[var(--foreground)]",
                        )}
                      >
                        <MetricWithHint content={plan.tooltips.search}>
                          {plan.searchStartsOn ?? "—"}
                        </MetricWithHint>
                      </td>
                      <td className="max-w-[11rem] align-top px-4 py-3.5 text-xs leading-snug text-[var(--foreground)]">
                        <MetricWithHint content={plan.tooltips.activeStock}>
                          {plan.activeStockOn ?? "—"}
                        </MetricWithHint>
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
