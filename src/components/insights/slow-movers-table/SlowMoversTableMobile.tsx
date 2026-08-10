import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
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

export function SlowMoversTableMobile({ rows, threshold }: SlowMoversTableProps) {
  return (
    <ul className="space-y-3">
      {rows.map((row) => (
        <li key={row.mlItemId}>
          <Card className="p-4 shadow-sm">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <a
                  href={`/dashboard/items/${row.mlItemId}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block truncate text-sm font-medium text-[var(--primary)] hover:underline"
                  title={row.title}
                >
                  {row.title}
                </a>
                <p className="mt-0.5 truncate font-mono text-xs text-[var(--muted-foreground)]">
                  {row.sku ?? "—"}
                </p>
                {row.catalogListing && (
                  <a
                    href={`/dashboard/catalog-report/${row.mlItemId}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-1 inline-block"
                  >
                    <Badge variant="secondary" className="text-[10px] px-1 py-0 hover:opacity-80">
                      catálogo ↗
                    </Badge>
                  </a>
                )}
              </div>
              <Badge
                variant={row.performanceTier === "zero" ? "destructive" : "secondary"}
                className="shrink-0 text-[10px]"
              >
                {TIER_LABELS[row.performanceTier] ?? row.performanceTier}
              </Badge>
            </div>

            <div className="mt-3 grid grid-cols-3 gap-2 border-t border-[var(--border)] pt-3 text-xs">
              <div>
                <div className="text-[var(--muted-foreground)]">Cobertura</div>
                <div
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
                </div>
              </div>
              <div>
                <div className="text-[var(--muted-foreground)]">Média/dia</div>
                <div>{row.dailyAvg > 0 ? fmt(row.dailyAvg) : "—"}</div>
              </div>
              <div>
                <div className="text-[var(--muted-foreground)]">Estoque</div>
                <div>{row.totalStock}</div>
              </div>
            </div>
          </Card>
        </li>
      ))}
    </ul>
  );
}
