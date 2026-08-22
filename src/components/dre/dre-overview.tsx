"use client";

import type { ReactNode } from "react";
import { X } from "lucide-react";
import {
  formatFinancialMoney,
  formatFinancialPercent,
} from "@/lib/financial-margin";
import { dreMonthShortLabel } from "@/lib/dre/dre-table-rows";
import type { DreMonthView, DreYearView } from "@/lib/dre/dre-year-data";
import { cn } from "@/lib/utils";

function SparkBars({
  values,
  selectedMonth,
}: {
  values: Array<number | null>;
  selectedMonth: number | null;
}) {
  const finite = values.filter((v): v is number => v != null && Number.isFinite(v));
  const max = Math.max(0.01, ...finite.map((v) => Math.abs(v)));

  return (
    <div
      className="flex h-10 items-end gap-px"
      aria-hidden
    >
      {values.map((value, index) => {
        const month = index + 1;
        const mag = value == null ? 0 : Math.abs(value) / max;
        const negative = (value ?? 0) < 0;
        return (
          <div
            key={month}
            className={cn(
              "min-h-px flex-1 rounded-sm transition-colors",
              value == null
                ? "bg-[var(--border)]"
                : negative
                  ? "bg-rose-400/80"
                  : "bg-[var(--primary)]/70",
              selectedMonth === month && "bg-[var(--primary)]",
            )}
            style={{ height: `${Math.max(12, mag * 100)}%` }}
          />
        );
      })}
    </div>
  );
}

function KpiCard({
  label,
  value,
  hint,
  period,
  spark,
}: {
  label: string;
  value: string;
  hint?: string;
  period: string;
  spark?: ReactNode;
}) {
  return (
    <div className="flex min-h-[7.5rem] flex-col justify-between rounded-2xl border border-[var(--border)] bg-[var(--card)] p-4">
      <div className="flex items-start justify-between gap-2">
        <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-[var(--muted-foreground)]">
          {label}
        </p>
        <span className="rounded-full bg-[var(--muted)] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[var(--muted-foreground)]">
          {period}
        </span>
      </div>
      <div>
        <p className="mt-3 text-[1.65rem] font-semibold leading-none tracking-tight tabular-nums text-[var(--foreground)]">
          {value}
        </p>
        {hint ? (
          <p className="mt-1.5 text-xs text-[var(--muted-foreground)]">{hint}</p>
        ) : null}
      </div>
      {spark ? <div className="mt-3">{spark}</div> : null}
    </div>
  );
}

export function DreOverview({
  data,
  selectedMonth,
  onSelectMonth,
}: {
  data: DreYearView;
  selectedMonth: number | null;
  onSelectMonth: (month: number | null) => void;
}) {
  const monthView: DreMonthView | null =
    selectedMonth !== null
      ? (data.months.find((m) => m.month === selectedMonth) ?? null)
      : null;
  const totals = monthView?.totals ?? data.yearTotals;
  const period =
    monthView != null ? dreMonthShortLabel(monthView.month) : String(data.year);
  const syncedCount = data.months.filter((m) => m.syncedAt).length;
  const profitSeries = data.months.map((m) => m.totals?.lucroOperacional ?? null);
  const revenueSeries = data.months.map((m) => m.totals?.totalEntrada ?? null);

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-[var(--muted-foreground)]">
          {monthView ? (
            <>
              Visão de{" "}
              <span className="font-medium text-[var(--foreground)]">
                {monthView.label}
              </span>
            </>
          ) : (
            <>Totais acumulados de {data.year}</>
          )}
        </p>
        {monthView ? (
          <button
            type="button"
            className="inline-flex cursor-pointer items-center gap-1 rounded-full border border-[var(--border)] bg-[var(--card)] px-2.5 py-1 text-xs font-medium text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
            onClick={() => onSelectMonth(null)}
          >
            <X className="size-3" aria-hidden />
            Ver o ano
          </button>
        ) : null}
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          label="Faturamento"
          period={period}
          value={formatFinancialMoney(totals?.totalEntrada ?? null)}
          spark={
            <SparkBars values={revenueSeries} selectedMonth={selectedMonth} />
          }
        />
        <KpiCard
          label="Margem de contribuição"
          period={period}
          value={formatFinancialMoney(totals?.margemContribuicao ?? null)}
          hint={formatFinancialPercent(totals?.margemContribuicaoPercent ?? null)}
        />
        <KpiCard
          label="Lucro operacional"
          period={period}
          value={formatFinancialMoney(totals?.lucroOperacional ?? null)}
          hint={formatFinancialPercent(totals?.lucroOperacionalPercent ?? null)}
          spark={
            <SparkBars values={profitSeries} selectedMonth={selectedMonth} />
          }
        />
        <KpiCard
          label="Sincronização"
          period="ano"
          value={`${syncedCount} / 12`}
          hint="Meses com dados importados do Mercado Livre"
        />
      </div>

      <div className="flex gap-1 overflow-x-auto pb-1">
        {data.months.map((month) => {
          const active = selectedMonth === month.month;
          return (
            <button
              key={month.month}
              type="button"
              disabled={month.isFutureMonth}
              onClick={() =>
                onSelectMonth(active ? null : month.month)
              }
              className={cn(
                "shrink-0 cursor-pointer rounded-full px-2.5 py-1 text-[11px] font-semibold tracking-wide transition-colors",
                month.isFutureMonth && "cursor-not-allowed opacity-35",
                active
                  ? "bg-[var(--primary)] text-white"
                  : month.syncedAt
                    ? "bg-[var(--card)] text-[var(--foreground)] ring-1 ring-[var(--border)] hover:ring-[var(--primary)]/40"
                    : "bg-[var(--muted)] text-[var(--muted-foreground)]",
              )}
            >
              {dreMonthShortLabel(month.month)}
            </button>
          );
        })}
      </div>
    </section>
  );
}
