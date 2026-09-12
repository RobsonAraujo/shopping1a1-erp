import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { ArrowUpRight } from "lucide-react";
import { cn } from "@/lib/utils";

export function DashboardKpiCard({
  title,
  icon: Icon,
  badgeClassName,
  meterFillClassName,
  meterValueClassName,
  value,
  valueLabel,
  meterLabel,
  meterValue,
  meterPercent,
  meterHint,
  pending = false,
  href,
}: {
  title: string;
  icon: LucideIcon;
  badgeClassName: string;
  meterFillClassName: string;
  meterValueClassName: string;
  value?: string;
  valueLabel: string;
  meterLabel?: string;
  meterValue?: string;
  meterPercent?: number | null;
  meterHint?: string;
  pending?: boolean;
  href?: string;
}) {
  const showMeter = pending
    ? Boolean(meterLabel)
    : meterLabel != null && meterPercent != null;

  const body = (
    <>
      <div className="flex items-center">
        <span
          className={cn(
            "relative flex size-8 shrink-0 items-center justify-center rounded-full",
            badgeClassName,
          )}
        >
          <Icon className="size-4" aria-hidden />
        </span>
        <h2 className="ml-2 min-w-0 flex-1 truncate text-lg font-medium text-[var(--foreground)]">
          {title}
        </h2>
        {href ? (
          <ArrowUpRight
            className="size-4 shrink-0 text-[var(--muted-foreground)] transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5"
            aria-hidden
          />
        ) : null}
      </div>
      <div>
        {pending ? (
          <div
            className="mt-4 h-10 w-28 animate-pulse rounded-lg bg-[var(--muted)]"
            aria-hidden
          />
        ) : (
          <p className="mt-4 text-left text-4xl font-bold tabular-nums tracking-tight text-[var(--foreground)]">
            {value}
          </p>
        )}
        <p className="mt-1 text-sm text-[var(--muted-foreground)]">{valueLabel}</p>
        {showMeter ? (
          <div className="mt-4">
            <div className="mb-1.5 flex items-baseline justify-between gap-2">
              <p className="text-xs font-medium text-[var(--muted-foreground)]">
                {meterLabel}
              </p>
              {pending ? (
                <span
                  className="h-4 w-10 animate-pulse rounded bg-[var(--muted)]"
                  aria-hidden
                />
              ) : meterValue ? (
                <p
                  className={cn(
                    "text-sm font-semibold tabular-nums",
                    meterValueClassName,
                  )}
                >
                  {meterValue}
                </p>
              ) : null}
            </div>
            {pending ? (
              <div
                className="h-2 w-full animate-pulse rounded bg-[var(--muted)]"
                aria-hidden
              />
            ) : (
              <div
                className="relative h-2 w-full rounded bg-[var(--muted)]"
                role="progressbar"
                aria-label={meterLabel}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={meterPercent ?? 0}
              >
                <span
                  className={cn(
                    "absolute inset-y-0 left-0 rounded",
                    meterFillClassName,
                  )}
                  style={{
                    width: `${Math.min(100, Math.max(0, meterPercent ?? 0))}%`,
                  }}
                />
              </div>
            )}
            {meterHint ? (
              <p className="mt-1.5 text-xs leading-snug text-[var(--muted-foreground)]">
                {meterHint}
              </p>
            ) : null}
          </div>
        ) : null}
      </div>
    </>
  );

  const className =
    "flex h-full w-full flex-col justify-between rounded-3xl bg-[var(--card)] p-4 shadow-[0_10px_15px_-3px_rgba(0,0,0,0.1),0_4px_6px_-2px_rgba(0,0,0,0.05)] sm:p-5";

  if (href) {
    return (
      <Link href={href} className={cn("group", className)} aria-label={title}>
        {body}
      </Link>
    );
  }

  return (
    <section className={className} aria-label={title} aria-busy={pending || undefined}>
      {body}
    </section>
  );
}
