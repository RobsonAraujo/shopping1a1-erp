import { cn } from "@/lib/utils";
import type { ParetoRow } from "@/lib/insights/types";

function fmtBrl(n: number): string {
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function fmtPercent(n: number, decimals = 1): string {
  return `${n.toLocaleString("pt-BR", { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}%`;
}

export function ParetoCard({ rows }: { rows: ParetoRow[] }) {
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
            <th className="pb-2 pr-3 text-right font-medium">Receita</th>
            <th className="pb-2 pr-3 text-right font-medium">% receita</th>
            <th className="pb-2 pr-3 text-right font-medium">% acumulado</th>
            <th className="pb-2 text-right font-medium">Unidades</th>
          </tr>
        </thead>
        <tbody>
          {rows.slice(0, 20).map((row, i) => {
            const past80 = row.receitaAcumuladaPercent - row.receitaPercent >= 80;
            return (
              <tr
                key={row.sku}
                className={cn(
                  "border-b border-[var(--border)] last:border-0",
                  past80 ? "opacity-50" : "",
                )}
              >
                <td className="py-2 pr-1 text-[var(--muted-foreground)]">{i + 1}</td>
                <td className="py-2 pr-3 font-mono text-xs">{row.sku}</td>
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
