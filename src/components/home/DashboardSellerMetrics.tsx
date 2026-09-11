import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

const RING_SIZE = 64;
const RING_STROKE = 5.5;
const RING_RADIUS = (RING_SIZE - RING_STROKE) / 2;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;

function MetricRing({
  label,
  ariaLabel,
  progress,
  color,
  children,
}: {
  label: string;
  ariaLabel: string;
  progress: number;
  color: string;
  children: ReactNode;
}) {
  const clamped = Math.min(1, Math.max(0, progress));
  const offset = RING_CIRCUMFERENCE * (1 - clamped);

  return (
    <div className="flex flex-col items-center gap-1.5">
      <div
        className="relative"
        style={{ width: RING_SIZE, height: RING_SIZE }}
        aria-label={ariaLabel}
      >
        <svg
          width={RING_SIZE}
          height={RING_SIZE}
          viewBox={`0 0 ${RING_SIZE} ${RING_SIZE}`}
          className="-rotate-90"
          aria-hidden
        >
          <circle
            cx={RING_SIZE / 2}
            cy={RING_SIZE / 2}
            r={RING_RADIUS}
            fill="none"
            stroke="var(--muted)"
            strokeWidth={RING_STROKE}
          />
          <circle
            cx={RING_SIZE / 2}
            cy={RING_SIZE / 2}
            r={RING_RADIUS}
            fill="none"
            stroke={color}
            strokeWidth={RING_STROKE}
            strokeLinecap="round"
            strokeDasharray={RING_CIRCUMFERENCE}
            strokeDashoffset={offset}
          />
        </svg>
        <span className="absolute inset-0 flex items-center justify-center text-center text-[var(--foreground)]">
          {children}
        </span>
      </div>
      <span className="text-[11px] font-medium uppercase tracking-[0.12em] text-[var(--muted-foreground)]">
        {label}
      </span>
    </div>
  );
}

function formatSalesLabel(count: number): string {
  if (count >= 1_000_000) {
    return `${(count / 1_000_000).toLocaleString("pt-BR", {
      maximumFractionDigits: 1,
    })} mi`;
  }
  if (count >= 100_000) {
    return `${(count / 1_000).toLocaleString("pt-BR", {
      maximumFractionDigits: 0,
    })} mil`;
  }
  return count.toLocaleString("pt-BR");
}

function SalesMark({ completed }: { completed: number }) {
  const full = completed.toLocaleString("pt-BR");
  const label = formatSalesLabel(completed);

  return (
    <MetricRing
      label="Vendas"
      ariaLabel={`${full} vendas`}
      progress={1}
      color="var(--primary)"
    >
      <span
        className={cn(
          "font-semibold tabular-nums leading-none tracking-tight",
          label.length > 5 ? "text-[11px]" : "text-[13px]",
        )}
        title={`${full} vendas`}
      >
        {label}
      </span>
    </MetricRing>
  );
}

function PercentRing({
  percent,
  label,
  tone,
}: {
  percent: number;
  label: string;
  tone: "good" | "bad";
}) {
  const clamped = Math.min(100, Math.max(0, percent));

  return (
    <MetricRing
      label={label}
      ariaLabel={`${label} ${clamped}%`}
      progress={clamped / 100}
      color={tone === "good" ? "#059669" : "#e11d48"}
    >
      <span className="text-[13px] font-semibold tabular-nums leading-none">
        {clamped}%
      </span>
    </MetricRing>
  );
}

export function DashboardSellerMetrics({
  completed,
  satisfactionPercent,
  cancelPercent,
}: {
  completed: number | null;
  satisfactionPercent: number | null;
  cancelPercent: number | null;
}) {
  if (
    completed == null &&
    satisfactionPercent == null &&
    cancelPercent == null
  ) {
    return null;
  }

  return (
    <div className="flex shrink-0 items-start gap-4 sm:gap-5">
      {completed != null ? <SalesMark completed={completed} /> : null}
      {satisfactionPercent != null ? (
        <PercentRing
          percent={satisfactionPercent}
          label="Satisfação"
          tone="good"
        />
      ) : null}
      {cancelPercent != null ? (
        <PercentRing
          percent={cancelPercent}
          label="Cancel."
          tone="bad"
        />
      ) : null}
    </div>
  );
}
