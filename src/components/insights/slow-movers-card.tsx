"use client";

import { useState } from "react";
import type { SlowMoverRow } from "@/lib/insights/types";
import { DEFAULT_SLOW_MOVER_THRESHOLD_DAYS } from "@/lib/insights/slow-movers";
import { SlowMoversTable } from "@/components/insights/slow-movers-table";

export function SlowMoversCard({ allRows }: { allRows: SlowMoverRow[] }) {
  const [threshold, setThreshold] = useState(DEFAULT_SLOW_MOVER_THRESHOLD_DAYS);

  const rows = allRows.filter((r) => {
    if (r.performanceTier === "zero") return true;
    return r.coverageDays !== null && r.coverageDays > threshold;
  });

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm text-[var(--muted-foreground)]">Threshold:</span>
        <input
          type="number"
          min={1}
          max={365}
          value={threshold}
          onChange={(e) => setThreshold(Math.max(1, Number(e.target.value)))}
          className="h-10 w-20 rounded-md border border-[var(--border)] bg-[var(--background)] px-2 py-1 text-base focus:outline-none focus:ring-1 focus:ring-[var(--primary)] sm:h-8 sm:text-sm"
        />
        <span className="text-sm text-[var(--muted-foreground)]">dias</span>
      </div>

      {rows.length === 0 ? (
        <p className="py-4 text-center text-sm text-[var(--muted-foreground)]">
          Nenhum produto acima de {threshold} dias de cobertura.
        </p>
      ) : (
        <SlowMoversTable rows={rows} threshold={threshold} />
      )}
    </div>
  );
}
