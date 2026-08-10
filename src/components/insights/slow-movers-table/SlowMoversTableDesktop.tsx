import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { SlowMoversTableProps } from "@/components/insights/slow-movers-table/types";

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

export function SlowMoversTableDesktop({ rows, threshold }: SlowMoversTableProps) {
  return (
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
              <td className="py-2 pr-3 max-w-[220px]">
                <a
                  href={`/dashboard/items/${row.mlItemId}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block truncate font-medium text-[var(--primary)] hover:underline"
                  title={row.title}
                >
                  {row.title}
                </a>
                {row.catalogListing && (
                  <a
                    href={`/dashboard/catalog-report/${row.mlItemId}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-0.5 inline-block"
                  >
                    <Badge variant="secondary" className="text-[10px] px-1 py-0 hover:opacity-80">
                      catálogo ↗
                    </Badge>
                  </a>
                )}
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
  );
}
