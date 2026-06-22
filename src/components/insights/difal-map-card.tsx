import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { DifalMapRow } from "@/lib/insights/types";

function fmtBrl(n: number): string {
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function fmtPercent(n: number): string {
  return `${n.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;
}

export function DifalMapCard({
  rows,
  period,
}: {
  rows: DifalMapRow[];
  period: string;
}) {
  return (
    <Card>
      <CardContent className="p-5">
        <div className="mb-4">
          <h2 className="text-base font-semibold text-[var(--primary)]">
            Margem por estado de destino
          </h2>
          <p className="mt-0.5 text-xs text-[var(--muted-foreground)]">
            Impacto do DIFAL na margem por UF — {period}. Estados com margem negativa indicam venda não lucrativa.
          </p>
        </div>

        {rows.length === 0 ? (
          <p className="py-6 text-center text-sm text-[var(--muted-foreground)]">
            Nenhuma transação com estado de destino no snapshot mais recente.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--border)] text-left text-xs text-[var(--muted-foreground)]">
                  <th className="pb-2 pr-3 font-medium">UF</th>
                  <th className="pb-2 pr-3 text-right font-medium">Receita</th>
                  <th className="pb-2 pr-3 text-right font-medium">Unidades</th>
                  <th className="pb-2 pr-3 text-right font-medium">Transações</th>
                  <th className="pb-2 text-right font-medium">Margem média</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr
                    key={row.uf}
                    className="border-b border-[var(--border)] last:border-0"
                  >
                    <td className="py-2 pr-3 font-semibold">{row.uf}</td>
                    <td className="py-2 pr-3 text-right">{fmtBrl(row.receitaTotal)}</td>
                    <td className="py-2 pr-3 text-right">{row.unidades}</td>
                    <td className="py-2 pr-3 text-right text-[var(--muted-foreground)]">
                      {row.totalTransacoes}
                    </td>
                    <td className="py-2 text-right">
                      <span
                        className={cn(
                          "font-semibold",
                          row.margemMedia < 0
                            ? "text-red-600"
                            : row.margemMedia < 5
                              ? "text-yellow-600"
                              : "text-green-700",
                        )}
                      >
                        {fmtPercent(row.margemMedia)}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
