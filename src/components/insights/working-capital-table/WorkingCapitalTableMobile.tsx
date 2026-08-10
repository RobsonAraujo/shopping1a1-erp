import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import type { WorkingCapitalTableProps } from "@/components/insights/working-capital-table/types";

function fmtBrl(n: number): string {
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function fmtUnits(n: number): string {
  return n.toLocaleString("pt-BR");
}

export function WorkingCapitalTableMobile({ rows }: WorkingCapitalTableProps) {
  return (
    <ul className="space-y-3">
      {rows.map((row) => (
        <li key={row.mlItemId}>
          <Card className="p-4 shadow-sm">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate font-mono text-sm font-medium">
                  {row.sku ?? row.mlItemId}
                </p>
                <p className="mt-0.5 text-xs text-[var(--muted-foreground)]">
                  {row.supplier}
                </p>
              </div>
              <div className="shrink-0 text-right">
                <div className="text-base font-semibold text-[var(--foreground)]">
                  {fmtBrl(row.effectiveCapital)}
                </div>
                <div className="text-xs text-[var(--muted-foreground)]">
                  {row.installments}x
                </div>
              </div>
            </div>

            <div className="mt-3 grid grid-cols-3 gap-2 border-t border-[var(--border)] pt-3 text-xs">
              <div>
                <div className="text-[var(--muted-foreground)]">Unid.</div>
                <div>{fmtUnits(row.unitsNeeded)}</div>
              </div>
              <div>
                <div className="text-[var(--muted-foreground)]">Custo unit.</div>
                <div className="flex items-center gap-1">
                  {fmtBrl(row.unitCost)}
                  <Badge variant="muted" className="px-1 py-0 text-[9px]">
                    {row.hasIcmsSt ? "compra+ST" : "NF"}
                  </Badge>
                </div>
              </div>
              <div>
                <div className="text-[var(--muted-foreground)]">Subtotal</div>
                <div>{fmtBrl(row.grossCapital)}</div>
              </div>
            </div>
          </Card>
        </li>
      ))}
    </ul>
  );
}
