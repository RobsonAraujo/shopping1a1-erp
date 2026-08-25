"use client";

import type { ReactNode } from "react";
import { ArrowDownRight, ArrowUpRight, CheckCircle2, Layers, TrendingUp, Wallet, X } from "lucide-react";
import {
  formatFinancialMoney,
  formatFinancialPercent,
} from "@/lib/financial-margin";
import { dreMonthShortLabel } from "@/lib/dre/dre-table-rows";
import type { DreMonthView, DreYearView } from "@/lib/dre/dre-year-data";
import { cn } from "@/lib/utils";

type SparkTone = "primary" | "sky" | "emerald";

const SPARK_COLORS: Record<SparkTone, string> = {
  primary: "#1b2d6f",
  sky: "#0284c7",
  emerald: "#059669",
};

function Sparkline({
  values,
  selectedMonth,
  tone = "primary",
}: {
  values: Array<number | null>;
  selectedMonth: number | null;
  tone?: SparkTone;
}) {
  const width = 240;
  const height = 56;
  const pad = 4;
  const finite = values.filter(
    (v): v is number => v != null && Number.isFinite(v),
  );

  if (finite.length < 2) {
    return <div className="h-14 w-full" aria-hidden />;
  }

  const min = Math.min(0, ...finite);
  const max = Math.max(0.01, ...finite);
  const range = max - min || 1;
  const stepX = (width - pad * 2) / (values.length - 1);

  const points = values.map((v, index) => {
    if (v == null || !Number.isFinite(v)) return null;
    return {
      x: pad + index * stepX,
      y: pad + (1 - (v - min) / range) * (height - pad * 2),
      month: index + 1,
    };
  });

  const segments: Array<Array<{ x: number; y: number }>> = [];
  let current: Array<{ x: number; y: number }> = [];
  for (const point of points) {
    if (point == null) {
      if (current.length > 1) segments.push(current);
      current = [];
      continue;
    }
    current.push(point);
  }
  if (current.length > 1) segments.push(current);

  const linePath = segments
    .map(
      (seg) =>
        "M " + seg.map((p) => `${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(" L "),
    )
    .join(" ");

  const zeroY = pad + (1 - (0 - min) / range) * (height - pad * 2);
  const areaPath = segments
    .map((seg) => {
      const start = seg[0];
      const end = seg[seg.length - 1];
      return `M ${start.x.toFixed(1)} ${zeroY.toFixed(1)} L ${seg
        .map((p) => `${p.x.toFixed(1)} ${p.y.toFixed(1)}`)
        .join(" L ")} L ${end.x.toFixed(1)} ${zeroY.toFixed(1)} Z`;
    })
    .join(" ");

  const color = SPARK_COLORS[tone];
  const gradientId = `dre-spark-${tone}`;

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      className="h-14 w-full"
      aria-hidden
    >
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.22" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={areaPath} fill={`url(#${gradientId})`} stroke="none" />
      <path
        d={linePath}
        fill="none"
        stroke={color}
        strokeWidth={1.75}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {points.map((p) =>
        p && p.month === selectedMonth ? (
          <circle
            key={p.month}
            cx={p.x}
            cy={p.y}
            r={3.25}
            fill={color}
            stroke="white"
            strokeWidth={1.5}
          />
        ) : null,
      )}
    </svg>
  );
}

function trendPercent(
  series: Array<number | null>,
  selectedMonth: number | null,
): number | null {
  if (selectedMonth == null) return null;
  const currentIndex = selectedMonth - 1;
  const current = series[currentIndex];
  if (current == null || !Number.isFinite(current)) return null;
  let prevIndex = currentIndex - 1;
  while (prevIndex >= 0 && series[prevIndex] == null) prevIndex--;
  if (prevIndex < 0) return null;
  const prev = series[prevIndex];
  if (prev == null || prev === 0) return null;
  return ((current - prev) / Math.abs(prev)) * 100;
}

function TrendBadge({ delta }: { delta: number | null }) {
  if (delta == null || !Number.isFinite(delta)) return null;
  const positive = delta >= 0;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[11px] font-semibold tabular-nums",
        positive
          ? "bg-emerald-50 text-emerald-700"
          : "bg-rose-50 text-rose-700",
      )}
      title="Variação vs. mês anterior"
    >
      {positive ? (
        <ArrowUpRight className="size-3" aria-hidden />
      ) : (
        <ArrowDownRight className="size-3" aria-hidden />
      )}
      {Math.abs(delta).toFixed(1)}%
    </span>
  );
}

const ICON_TONE_CLASS: Record<SparkTone, string> = {
  primary: "bg-[var(--primary)]/10 text-[var(--primary)]",
  sky: "bg-sky-50 text-sky-600",
  emerald: "bg-emerald-50 text-emerald-600",
};

function KpiCard({
  icon,
  tone,
  label,
  value,
  hint,
  period,
  trend,
  spark,
  footer,
}: {
  icon: ReactNode;
  tone: SparkTone;
  label: string;
  value: string;
  hint?: string;
  period: string;
  trend?: number | null;
  spark?: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <div className="group flex flex-col justify-between rounded-2xl border border-[var(--border)] bg-[var(--card)] p-5 transition-shadow hover:shadow-[0_1px_2px_rgba(15,18,31,0.04),0_8px_24px_-16px_rgba(15,18,31,0.18)]">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2.5">
          <span
            className={cn(
              "flex size-9 shrink-0 items-center justify-center rounded-xl",
              ICON_TONE_CLASS[tone],
            )}
          >
            {icon}
          </span>
          <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--muted-foreground)]">
            {label}
          </p>
        </div>
        <span className="shrink-0 rounded-full bg-[var(--muted)] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[var(--muted-foreground)]">
          {period}
        </span>
      </div>

      <div className="mt-4 flex items-end justify-between gap-2">
        <p className="text-[1.85rem] font-semibold leading-none tracking-tight tabular-nums text-[var(--foreground)]">
          {value}
        </p>
        <TrendBadge delta={trend ?? null} />
      </div>
      {hint ? (
        <p className="mt-1.5 text-xs text-[var(--muted-foreground)]">{hint}</p>
      ) : null}

      {spark ? <div className="mt-4 -mb-1">{spark}</div> : null}
      {footer ? <div className="mt-4">{footer}</div> : null}
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
  const syncComplete = syncedCount === 12;
  const profitSeries = data.months.map((m) => m.totals?.lucroOperacional ?? null);
  const revenueSeries = data.months.map((m) => m.totals?.totalEntrada ?? null);
  const marginSeries = data.months.map(
    (m) => m.totals?.margemContribuicao ?? null,
  );

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
          icon={<Wallet className="size-4" aria-hidden />}
          tone="primary"
          label="Faturamento"
          period={period}
          value={formatFinancialMoney(totals?.totalEntrada ?? null)}
          trend={trendPercent(revenueSeries, selectedMonth)}
          spark={
            <Sparkline
              values={revenueSeries}
              selectedMonth={selectedMonth}
              tone="primary"
            />
          }
        />
        <KpiCard
          icon={<Layers className="size-4" aria-hidden />}
          tone="sky"
          label="Margem de contribuição"
          period={period}
          value={formatFinancialMoney(totals?.margemContribuicao ?? null)}
          hint={`${formatFinancialPercent(totals?.margemContribuicaoPercent ?? null)} da receita`}
          trend={trendPercent(marginSeries, selectedMonth)}
          spark={
            <Sparkline
              values={marginSeries}
              selectedMonth={selectedMonth}
              tone="sky"
            />
          }
        />
        <KpiCard
          icon={<TrendingUp className="size-4" aria-hidden />}
          tone="emerald"
          label="Lucro operacional"
          period={period}
          value={formatFinancialMoney(totals?.lucroOperacional ?? null)}
          hint={`${formatFinancialPercent(totals?.lucroOperacionalPercent ?? null)} da receita`}
          trend={trendPercent(profitSeries, selectedMonth)}
          spark={
            <Sparkline
              values={profitSeries}
              selectedMonth={selectedMonth}
              tone="emerald"
            />
          }
        />
        <KpiCard
          icon={
            syncComplete ? (
              <CheckCircle2 className="size-4" aria-hidden />
            ) : (
              <Layers className="size-4" aria-hidden />
            )
          }
          tone={syncComplete ? "emerald" : "primary"}
          label="Sincronização"
          period="ano"
          value={`${syncedCount} / 12`}
          hint="Meses com dados importados do Mercado Livre"
          footer={
            <div
              className="h-1.5 w-full overflow-hidden rounded-full bg-[var(--muted)]"
              aria-hidden
            >
              <div
                className={cn(
                  "h-full rounded-full transition-[width]",
                  syncComplete ? "bg-emerald-500" : "bg-[var(--primary)]",
                )}
                style={{ width: `${(syncedCount / 12) * 100}%` }}
              />
            </div>
          }
        />
      </div>

      <div className="flex gap-1.5 overflow-x-auto pb-1">
        {data.months.map((month) => {
          const active = selectedMonth === month.month;
          return (
            <button
              key={month.month}
              type="button"
              onClick={() => onSelectMonth(active ? null : month.month)}
              className={cn(
                "shrink-0 cursor-pointer rounded-lg px-3 py-1.5 text-[11px] font-semibold tracking-wide transition-colors",
                month.isFutureMonth && "opacity-60",
                active
                  ? "bg-[var(--primary)] text-white shadow-sm"
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
