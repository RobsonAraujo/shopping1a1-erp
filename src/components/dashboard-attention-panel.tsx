"use client";

import Link from "next/link";
import { stockPlanningConfig } from "@/config/stock-planning";
import { computeStockPlanningDisplay } from "@/lib/stock-planning";
import type { ItemBody } from "@/lib/mercadolibre/types";
import { PlanningInfoTrigger } from "@/components/planning-info-trigger";
import { TooltipProvider } from "@/components/ui/tooltip";

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
      <section className="rounded-xl border-2 border-amber-200/90 bg-gradient-to-br from-amber-50/80 to-white p-5 shadow-sm ring-1 ring-amber-100/60">
        <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
          <div>
            <h2 className="text-xl font-bold tracking-tight text-[var(--brand)]">
              Precisa de atenção agora
            </h2>
            <p className="mt-1 text-sm text-[var(--text-muted)]">
              Data de início da busca/agendamento é hoje ou já passou — hora de
              agendar e planejar estoque.
            </p>
          </div>
          {rows.length > 0 ? (
            <span className="rounded-full bg-amber-100 px-3 py-1 text-sm font-semibold tabular-nums text-amber-950">
              {rows.length}{" "}
              {rows.length === 1 ? "anúncio" : "anúncios"}
            </span>
          ) : null}
        </div>

        {rows.length === 0 ? (
          <p className="rounded-lg border border-dashed border-[var(--border)] bg-white/60 py-10 text-center text-sm text-[var(--text-muted)]">
            Nenhum anúncio nesta situação no momento. Quando a data de
            agendamento chegar (ou atrasar), ele aparece aqui.
          </p>
        ) : (
          <ul className="grid gap-4 sm:grid-cols-1 lg:grid-cols-2">
            {rows.map(({ item, plan }) => {
              const urgent = plan.searchIsOverdue;
              return (
                <li
                  key={item.id}
                  className={`rounded-lg border bg-white p-4 shadow-sm transition-shadow hover:shadow-md ${
                    urgent
                      ? "border-amber-400 ring-1 ring-amber-200/80"
                      : "border-[var(--border)]"
                  }`}
                >
                  <div className="flex flex-wrap items-start justify-between gap-2 gap-y-1">
                    <Link
                      href={`/dashboard/items/${item.id}`}
                      className="text-base font-semibold leading-snug text-[var(--brand)] underline-offset-2 hover:underline sm:text-lg"
                    >
                      {item.title}
                    </Link>
                    {urgent ? (
                      <span className="shrink-0 rounded bg-amber-600 px-2 py-0.5 text-xs font-semibold uppercase tracking-wide text-white">
                        Atrasado
                      </span>
                    ) : (
                      <span className="shrink-0 rounded bg-[var(--surface-muted)] px-2 py-0.5 text-xs font-medium text-[var(--text-muted)]">
                        Hoje
                      </span>
                    )}
                  </div>

                  <p className="mt-3 font-mono text-xs text-[var(--text-muted)]">
                    {item.id}
                  </p>

                  <div className="mt-4 grid gap-4 sm:grid-cols-3">
                    <div>
                      <p className="text-xs font-medium uppercase tracking-wide text-[var(--text-muted)]">
                        Estoque agora
                      </p>
                      <p className="mt-1 text-3xl font-bold tabular-nums text-[var(--brand)]">
                        {item.available_quantity}
                        <span className="ml-1 text-lg font-semibold text-[var(--text-muted)]">
                          un.
                        </span>
                      </p>
                      <p className="mt-1 text-xs text-[var(--text-muted)]">
                        <span className="inline-flex flex-wrap items-center gap-1.5">
                          Cobertura ~{" "}
                          <span className="font-medium text-[var(--foreground)]">
                            {plan.stockWillLast}
                          </span>
                          <PlanningInfoTrigger
                            content={plan.tooltips.stockWillLast}
                          />
                        </span>
                      </p>
                    </div>

                    <div>
                      <p className="text-xs font-medium uppercase tracking-wide text-[var(--text-muted)]">
                        Iniciar busca / agendamento
                      </p>
                      <p
                        className={`mt-1 text-2xl font-bold leading-tight ${
                          urgent ? "text-amber-900" : "text-[var(--brand)]"
                        }`}
                      >
                        {plan.searchStartsOn ?? "—"}
                      </p>
                      <p className="mt-1 text-xs text-[var(--text-muted)]">
                        <span className="inline-flex items-center gap-1.5">
                          Detalhes
                          <PlanningInfoTrigger content={plan.tooltips.search} />
                        </span>
                      </p>
                    </div>

                    <div>
                      <p className="text-xs font-medium uppercase tracking-wide text-[var(--text-muted)]">
                        Novo estoque ativo até
                      </p>
                      <p className="mt-1 text-2xl font-bold leading-tight text-[var(--brand)]">
                        {plan.activeStockOn ?? "—"}
                      </p>
                      <p className="mt-1 text-xs text-[var(--text-muted)]">
                        <span className="inline-flex items-center gap-1.5">
                          Detalhes
                          <PlanningInfoTrigger
                            content={plan.tooltips.activeStock}
                          />
                        </span>
                      </p>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </TooltipProvider>
  );
}
