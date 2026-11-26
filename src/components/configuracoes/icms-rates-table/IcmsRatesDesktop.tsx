"use client";

import { SortableTh } from "@/components/ui/sortable-th";
import type { IcmsRatesTableViewProps } from "./types";

function pct(value: number): string {
  return `${(value * 100).toFixed(2)}%`;
}

export function IcmsRatesDesktop({ rows, sort, onSortChange }: IcmsRatesTableViewProps) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[28rem] text-sm">
        <thead>
          <tr className="border-b border-[var(--border)] text-left text-xs text-[var(--muted-foreground)]">
            <SortableTh label="UF" sortKey="uf" sort={sort} onSortChange={onSortChange} align="left" />
            <SortableTh
              label="Base %"
              sortKey="aliquotaBase"
              sort={sort}
              onSortChange={onSortChange}
              align="left"
            />
            <SortableTh label="FCP %" sortKey="fcp" sort={sort} onSortChange={onSortChange} align="left" />
            <th className="py-2">Total</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr
              key={row.uf}
              className="border-b border-[var(--border)] hover:bg-[var(--muted)]/30"
            >
              <td className="py-2 pr-3 font-medium">{row.uf}</td>
              <td className="py-2 pr-3 tabular-nums">{pct(row.aliquotaBase)}</td>
              <td className="py-2 pr-3 tabular-nums">{pct(row.fcp)}</td>
              <td className="py-2 tabular-nums font-medium">
                {pct(row.aliquotaBase + row.fcp)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
