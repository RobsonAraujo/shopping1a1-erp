"use client";

import { Info } from "lucide-react";
import type { SlowMoverRow } from "@/lib/insights/types";
import { DEFAULT_SLOW_MOVER_THRESHOLD_DAYS, MIN_LISTING_AGE_DAYS } from "@/lib/insights/slow-movers";
import { SlowMoversTable } from "@/components/insights/slow-movers-table";
import { usePersistedJson } from "@/hooks/use-persisted-json";

const THRESHOLD_STORAGE_KEY = "insights.slowMovers.threshold";

export function SlowMoversCard({ allRows }: { allRows: SlowMoverRow[] }) {
  const [threshold, setThreshold] = usePersistedJson(
    THRESHOLD_STORAGE_KEY,
    DEFAULT_SLOW_MOVER_THRESHOLD_DAYS,
  );

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
          onChange={(e) => {
            const raw = e.target.value;
            if (raw === "") return;
            const parsed = Number(raw);
            if (Number.isNaN(parsed)) return;
            setThreshold(Math.max(1, parsed));
          }}
          className="h-10 w-20 rounded-md border border-[var(--border)] bg-[var(--background)] px-2 py-1 text-base focus:outline-none focus:ring-1 focus:ring-[var(--primary)] sm:h-8 sm:text-sm"
        />
        <span className="text-sm text-[var(--muted-foreground)]">dias</span>
      </div>

      <p className="flex items-center gap-1.5 text-xs text-[var(--muted-foreground)]">
        <Info className="size-3.5 shrink-0" />
        Mostrando apenas anúncios com mais de {MIN_LISTING_AGE_DAYS} dias de vida.
      </p>

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
