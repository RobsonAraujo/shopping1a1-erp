"use client";

import Link from "next/link";
import { stockPlanningConfig } from "@/config/stock-planning";
import { computeStockPlanningDisplay } from "@/lib/stock-planning";
import type { ItemBody } from "@/lib/mercadolibre/types";
import { PlanningInfoTrigger } from "@/components/planning-info-trigger";
import { TooltipProvider } from "@/components/ui/tooltip";

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
      <div className="overflow-x-auto rounded-lg border border-[var(--border)] bg-white shadow-sm">
        <table className="w-full min-w-[56rem] text-left text-sm">
          <thead className="border-b border-[var(--border)] bg-[var(--surface-muted)]">
            <tr>
              <th className="px-3 py-3 font-semibold text-[var(--brand)]">
                Produto
              </th>
              <th className="hidden px-3 py-3 font-semibold text-[var(--brand)] sm:table-cell">
                ID
              </th>
              <th className="px-3 py-3 font-semibold text-[var(--brand)]">
                Estoque
              </th>
              <th className="hidden px-3 py-3 font-semibold text-[var(--brand)] lg:table-cell">
                Preço
              </th>
              <th className="px-3 py-3 font-semibold text-[var(--brand)]">
                Estoque vai durar
              </th>
              <th className="max-w-[11rem] px-3 py-3 text-xs font-semibold leading-tight text-[var(--brand)]">
                A busca para agendamento precisa iniciar em
              </th>
              <th className="max-w-[11rem] px-3 py-3 text-xs font-semibold leading-tight text-[var(--brand)]">
                O novo estoque precisa entrar ativo em
              </th>
            </tr>
          </thead>
          <tbody>
            {items.length === 0 ? (
              <tr>
                <td
                  colSpan={7}
                  className="px-4 py-8 text-center text-[var(--text-muted)]"
                >
                  Nenhum anúncio nesta categoria nesta página.
                </td>
              </tr>
            ) : (
              items.map((item) => {
                const sold = salesByItem[item.id] ?? 0;
                const plan = computeStockPlanningDisplay(
                  item.available_quantity,
                  sold,
                  w,
                  stockPlanningConfig,
                );
                return (
                  <tr
                    key={item.id}
                    className="border-b border-[var(--border)] last:border-0"
                  >
                    <td className="px-3 py-3">
                      <Link
                        href={`/dashboard/items/${item.id}`}
                        className="font-medium text-[var(--brand)] underline-offset-2 hover:underline"
                      >
                        {item.title}
                      </Link>
                    </td>
                    <td className="hidden px-3 py-3 font-mono text-xs text-[var(--text-muted)] sm:table-cell">
                      {item.id}
                    </td>
                    <td className="px-3 py-3 tabular-nums">
                      {item.available_quantity}
                    </td>
                    <td className="hidden px-3 py-3 tabular-nums lg:table-cell">
                      {item.currency_id}{" "}
                      {item.price.toLocaleString("pt-BR", {
                        minimumFractionDigits: 2,
                      })}
                    </td>
                    <td className="px-3 py-3 tabular-nums text-[var(--text)]">
                      <span className="inline-flex items-center gap-1.5">
                        <span>{plan.stockWillLast}</span>
                        <PlanningInfoTrigger
                          content={plan.tooltips.stockWillLast}
                        />
                      </span>
                    </td>
                    <td
                      className={`max-w-[11rem] px-3 py-3 text-xs leading-snug ${
                        plan.searchIsOverdue && plan.searchStartsOn
                          ? "font-medium text-amber-800"
                          : "text-[var(--text)]"
                      }`}
                    >
                      <span className="inline-flex items-center gap-1.5">
                        <span>{plan.searchStartsOn ?? "—"}</span>
                        <PlanningInfoTrigger content={plan.tooltips.search} />
                      </span>
                    </td>
                    <td className="max-w-[11rem] px-3 py-3 text-xs leading-snug text-[var(--text)]">
                      <span className="inline-flex items-center gap-1.5">
                        <span>{plan.activeStockOn ?? "—"}</span>
                        <PlanningInfoTrigger
                          content={plan.tooltips.activeStock}
                        />
                      </span>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </TooltipProvider>
  );
}
