"use client";

import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { SlowMoverRow } from "@/lib/insights/types";
import { DEFAULT_SLOW_MOVER_THRESHOLD_DAYS } from "@/lib/insights/slow-movers";

const TIER_LABELS: Record<string, string> = {
  alta: "Alta",
  media: "Média",
  baixa: "Baixa",
  zero: "Sem vendas",
};

function fmt(n: number, decimals = 1): string {
  return n.toLocaleString("pt-BR", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

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
          className="w-20 rounded-md border border-[var(--border)] bg-[var(--background)] px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-[var(--primary)]"
        />
        <span className="text-sm text-[var(--muted-foreground)]">dias</span>
      </div>

      {rows.length === 0 ? (
        <p className="py-4 text-center text-sm text-[var(--muted-foreground)]">
          Nenhum produto acima de {threshold} dias de cobertura.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--border)] text-left text-xs text-[var(--muted-foreground)]">
                <th className="pb-2 pr-3 font-medium">Produto</th>
                <th className="pb-2 pr-3 font-medium">SKU</th>
                <th className="pb-2 pr-3 text-right font-medium">Cobertura</th>
                <th className="pb-2 pr-3 text-right font-medium">Média/dia</th>
                <th className="pb-2 pr-3 text-right font-medium">Estoque</th>
                <th className="pb-2 font-medium">Rotação</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr
                  key={row.mlItemId}
                  className="border-b border-[var(--border)] last:border-0"
                >
                  <td className="py-2 pr-3 max-w-[200px] truncate" title={row.title}>
                    {row.title}
                  </td>
                  <td className="py-2 pr-3 font-mono text-xs text-[var(--muted-foreground)]">
                    {row.sku ?? "—"}
                  </td>
                  <td className="py-2 pr-3 text-right">
                    <span
                      className={cn(
                        "font-semibold",
                        row.coverageDays === null || row.performanceTier === "zero"
                          ? "text-red-600"
                          : row.coverageDays > threshold * 2
                            ? "text-orange-600"
                            : "text-yellow-600",
                      )}
                    >
                      {row.coverageDays !== null ? `${Math.floor(row.coverageDays)} d` : "∞"}
                    </span>
                  </td>
                  <td className="py-2 pr-3 text-right text-[var(--muted-foreground)]">
                    {row.dailyAvg > 0 ? fmt(row.dailyAvg) : "—"}
                  </td>
                  <td className="py-2 pr-3 text-right">{row.totalStock}</td>
                  <td className="py-2">
                    <Badge
                      variant={row.performanceTier === "zero" ? "destructive" : "secondary"}
                      className="text-[10px]"
                    >
                      {TIER_LABELS[row.performanceTier] ?? row.performanceTier}
                    </Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
