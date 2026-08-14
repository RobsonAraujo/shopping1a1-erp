"use client";

import { Badge } from "@/components/ui/badge";
import { SortableTh } from "@/components/ui/sortable-th";
import { useTableSort } from "@/hooks/use-table-sort";
import { cn } from "@/lib/utils";
import type { ParetoCurve, ParetoRow } from "@/lib/insights/types";

type ParetoSortKey =
  | "receitaTotal"
  | "receitaPercent"
  | "receitaAcumuladaPercent"
  | "unidadesVendidas"
  | "curve";

function sortValue(row: ParetoRow, key: ParetoSortKey): number {
  if (key === "curve") return row.curve.charCodeAt(0);
  return row[key];
}

const CURVE_LABEL: Record<ParetoCurve, string> = {
  A: "Curva A",
  B: "Curva B",
  C: "Curva C",
};

const CURVE_BADGE_CLASS: Record<ParetoCurve, string> = {
  A: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300",
  B: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300",
  C: "bg-[var(--muted)] text-[var(--muted-foreground)]",
};

function fmtBrl(n: number): string {
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function fmtPercent(n: number, decimals = 1): string {
  return `${n.toLocaleString("pt-BR", { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}%`;
}

export function ParetoCard({ rows }: { rows: ParetoRow[] }) {
  // Ordem padrão preserva a lógica de Pareto (maior receita primeiro, acumulando %).
  const { sort, sortedRows, onSortChange } = useTableSort<ParetoRow, ParetoSortKey>(rows, sortValue, {
    key: "receitaTotal",
    direction: "desc",
  });

  if (rows.length === 0) {
    return (
      <p className="py-4 text-center text-sm text-[var(--muted-foreground)]">
        Nenhum dado de receita por SKU no snapshot mais recente.
      </p>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-[var(--border)] text-left text-xs text-[var(--muted-foreground)]">
            <th className="pb-2 pr-1 font-medium">#</th>
            <th className="pb-2 pr-3 font-medium">SKU</th>
            <SortableTh
              label="Curva"
              sortKey="curve"
              sort={sort}
              onSortChange={onSortChange}
              align="left"
            />
            <SortableTh label="Receita" sortKey="receitaTotal" sort={sort} onSortChange={onSortChange} />
            <SortableTh
              label="% receita"
              sortKey="receitaPercent"
              sort={sort}
              onSortChange={onSortChange}
            />
            <SortableTh
              label="% acumulado"
              sortKey="receitaAcumuladaPercent"
              sort={sort}
              onSortChange={onSortChange}
            />
            <SortableTh
              label="Unidades"
              sortKey="unidadesVendidas"
              sort={sort}
              onSortChange={onSortChange}
              className="pr-0"
            />
          </tr>
        </thead>
        <tbody>
          {sortedRows.slice(0, 20).map((row, i) => {
            return (
              <tr
                key={row.sku}
                className={cn(
                  "border-b border-[var(--border)] last:border-0",
                  row.curve === "C" ? "opacity-60" : "",
                )}
              >
                <td className="py-2 pr-1 text-[var(--muted-foreground)]">{i + 1}</td>
                <td className="py-2 pr-3 font-mono text-xs">{row.sku}</td>
                <td className="py-2 pr-3">
                  <Badge variant="secondary" className={cn("text-[10px]", CURVE_BADGE_CLASS[row.curve])}>
                    {CURVE_LABEL[row.curve]}
                  </Badge>
                </td>
                <td className="py-2 pr-3 text-right">{fmtBrl(row.receitaTotal)}</td>
                <td className="py-2 pr-3 text-right font-medium">
                  {fmtPercent(row.receitaPercent)}
                </td>
                <td className="py-2 pr-3 text-right">
                  <span
                    className={cn(
                      row.receitaAcumuladaPercent <= 80
                        ? "font-semibold text-[var(--primary)]"
                        : "text-[var(--muted-foreground)]",
                    )}
                  >
                    {fmtPercent(row.receitaAcumuladaPercent)}
                  </span>
                </td>
                <td className="py-2 text-right text-[var(--muted-foreground)]">
                  {row.unidadesVendidas}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {rows.length > 20 && (
        <p className="mt-2 text-right text-xs text-[var(--muted-foreground)]">
          +{rows.length - 20} SKUs restantes
        </p>
      )}
    </div>
  );
}
