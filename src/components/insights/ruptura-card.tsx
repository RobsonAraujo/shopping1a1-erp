import { cn } from "@/lib/utils";
import type { RupturaRow } from "@/lib/insights/types";

function fmt(n: number, decimals = 1): string {
  return n.toLocaleString("pt-BR", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

export function RupturaCard({ rows }: { rows: RupturaRow[] }) {
  if (rows.length === 0) {
    return (
      <p className="py-4 text-center text-sm text-[var(--muted-foreground)]">
        Nenhuma ruptura iminente detectada.
      </p>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-[var(--border)] text-left text-xs text-[var(--muted-foreground)]">
            <th className="pb-2 pr-3 font-medium">Produto</th>
            <th className="pb-2 pr-3 font-medium">SKU</th>
            <th className="pb-2 pr-3 text-right font-medium">Cobertura</th>
            <th className="pb-2 pr-3 text-right font-medium">Lead time</th>
            <th className="pb-2 pr-3 text-right font-medium">Estoque</th>
            <th className="pb-2 text-right font-medium">Média/dia</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const days = Math.floor(row.coverageDays ?? 0);
            const critical = days <= 7;
            return (
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
                      critical ? "text-red-600" : "text-yellow-600",
                    )}
                  >
                    {days} d
                  </span>
                </td>
                <td className="py-2 pr-3 text-right text-[var(--muted-foreground)]">
                  {row.purchaseLeadTimeDays} d
                </td>
                <td className="py-2 pr-3 text-right">{row.totalStock}</td>
                <td className="py-2 text-right text-[var(--muted-foreground)]">
                  {row.dailyAvg > 0 ? fmt(row.dailyAvg) : "—"}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
