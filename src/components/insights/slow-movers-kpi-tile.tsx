"use client";

import { TrendingDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { filterSlowMoverRows } from "@/lib/insights/slow-movers";
import { useSlowMoverThreshold } from "@/hooks/use-slow-mover-threshold";
import type { SlowMoverRow } from "@/lib/insights/types";

export function SlowMoversKpiTile({ allRows }: { allRows: SlowMoverRow[] }) {
  const [threshold] = useSlowMoverThreshold();
  const slowCount = filterSlowMoverRows(allRows, threshold).length;
  const tone = slowCount === 0 ? "text-emerald-700 dark:text-emerald-400" : "text-amber-700 dark:text-amber-400";

  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--muted)]/30 px-4 py-3">
      <div className="flex items-center gap-1.5 text-xs font-medium text-[var(--muted-foreground)]">
        <TrendingDown className="size-3.5" aria-hidden />
        Rotação baixa
      </div>
      <div className={cn("mt-1 text-2xl font-bold tracking-tight", tone)}>{slowCount}</div>
      <div className="mt-0.5 text-xs text-[var(--muted-foreground)]">
        cobertura &gt; {threshold}d ou parado
      </div>
    </div>
  );
}
