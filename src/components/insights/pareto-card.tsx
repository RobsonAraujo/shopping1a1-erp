import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { ParetoRow } from "@/lib/insights/types";
import { paretoConcentration } from "@/lib/insights/pareto";

function fmtBrl(n: number): string {
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function fmtPercent(n: number, decimals = 1): string {
  return `${n.toLocaleString("pt-BR", { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}%`;
}

export function ParetoCard({
  rows,
  period,
}: {
  rows: ParetoRow[];
  period: string;
}) {
  const { top3Percent, skusFor80Percent } = paretoConcentration(rows);
  const highConcentration = top3Percent > 60;

  return (
    <Card>
      <CardContent className="p-5">
        <div className="mb-4 flex flex-wrap items-start gap-3">
          <div>
            <h2 className="text-base font-semibold text-[var(--primary)]">
              Concentração de receita (Pareto)
            </h2>
            <p className="mt-0.5 text-xs text-[var(--muted-foreground)]">
              {period} — {skusFor80Percent} SKU{skusFor80Percent !== 1 ? "s" : ""} respondem por 80% da receita.
            </p>
          </div>
          {highConcentration && (
            <Badge variant="warning" className="ml-auto text-xs">
              Top 3 = {fmtPercent(top3Percent, 0)} da receita
            </Badge>
          )}
        </div>

        {rows.length === 0 ? (
          <p className="py-6 text-center text-sm text-[var(--muted-foreground)]">
            Nenhum dado de receita por SKU no snapshot mais recente.
          </p>
        ) : (
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
                      <td className="py-2 pr-1 text-[var(--muted-foreground)]">
                        {i + 1}
                      </td>
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
        )}
      </CardContent>
    </Card>
  );
}
