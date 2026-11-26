"use client";

import type { IcmsRateRow } from "@/lib/tax-report/types";

function pct(value: number): string {
  return `${(value * 100).toFixed(2)}%`;
}

export function IcmsRatesMobile({ rows }: { rows: IcmsRateRow[] }) {
  return (
    <div className="space-y-2">
      {rows.map((row) => (
        <div
          key={row.uf}
          className="flex items-center justify-between gap-3 rounded-xl border border-[var(--border)] px-3.5 py-3"
        >
          <div className="min-w-0">
            <p className="text-sm font-semibold">{row.uf}</p>
            <p className="mt-0.5 text-xs text-[var(--muted-foreground)] tabular-nums">
              Base {pct(row.aliquotaBase)} · FCP {pct(row.fcp)}
            </p>
          </div>
          <span className="shrink-0 text-sm font-semibold tabular-nums">
            {pct(row.aliquotaBase + row.fcp)}
          </span>
        </div>
      ))}
    </div>
  );
}
