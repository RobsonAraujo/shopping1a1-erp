"use client";

import { TrendingDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { filterSlowMoverRows } from "@/lib/insights/slow-movers";
import { useSlowMoverThreshold } from "@/hooks/use-slow-mover-threshold";
import type { SlowMoverRow } from "@/lib/insights/types";

export function SlowMoversKpiTile({ allRows }: { allRows: SlowMoverRow[] }) {
  const [threshold] = useSlowMoverThreshold();
  const slowCount = filterSlowMoverRows(allRows, threshold).length;
  const ok = slowCount === 0;

  return (
    <div className="flex min-w-[11rem] flex-1 items-center gap-3 px-4 py-1 first:pl-0">
      <span
        className={cn(
          "flex size-9 shrink-0 items-center justify-center rounded-full",
          ok
            ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
            : "bg-amber-500/10 text-amber-600 dark:text-amber-400",
        )}
      >
        <TrendingDown className="size-4" aria-hidden />
      </span>
      <div className="min-w-0">
        <div className="text-xs font-medium text-[var(--muted-foreground)]">Rotação baixa</div>
        <div
          className={cn(
            "text-xl font-bold tabular-nums tracking-tight",
            ok ? "text-emerald-600 dark:text-emerald-400" : "text-amber-600 dark:text-amber-400",
          )}
        >
          {slowCount}
        </div>
        <div className="truncate text-xs text-[var(--muted-foreground)]">
          cobertura &gt; {threshold}d ou parado
        </div>
      </div>
    </div>
  );
}
