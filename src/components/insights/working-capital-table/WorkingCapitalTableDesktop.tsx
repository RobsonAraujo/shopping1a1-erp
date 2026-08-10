import { Badge } from "@/components/ui/badge";
import type { WorkingCapitalTableProps } from "@/components/insights/working-capital-table/types";

function fmtBrl(n: number): string {
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function fmtUnits(n: number): string {
  return n.toLocaleString("pt-BR");
}

export function WorkingCapitalTableDesktop({ rows }: WorkingCapitalTableProps) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-[var(--border)] text-left text-xs text-[var(--muted-foreground)]">
            <th className="pb-2 pr-3 font-medium">SKU</th>
            <th className="pb-2 pr-3 font-medium">Fornecedor</th>
            <th className="pb-2 pr-3 text-right font-medium">Unid. necessárias</th>
            <th className="pb-2 pr-3 text-right font-medium">Custo unit.</th>
            <th className="pb-2 pr-3 text-right font-medium">Subtotal</th>
            <th className="pb-2 pr-3 text-right font-medium">Parcelas</th>
            <th className="pb-2 text-right font-medium">Capital efetivo</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.mlItemId} className="border-b border-[var(--border)] last:border-0">
              <td className="max-w-[10rem] truncate py-2 pr-3 font-mono text-xs">
                {row.sku ?? row.mlItemId}
              </td>
              <td className="py-2 pr-3 text-xs">{row.supplier}</td>
              <td className="py-2 pr-3 text-right text-[var(--muted-foreground)]">
                {fmtUnits(row.unitsNeeded)}
              </td>
              <td className="py-2 pr-3 text-right">
                <div className="flex items-center justify-end gap-1">
                  {fmtBrl(row.unitCost)}
                  <Badge variant="muted" className="px-1 py-0 text-[9px]">
                    {row.hasIcmsSt ? "compra+ST" : "NF"}
                  </Badge>
                </div>
              </td>
              <td className="py-2 pr-3 text-right text-[var(--muted-foreground)]">
                {fmtBrl(row.grossCapital)}
              </td>
              <td className="py-2 pr-3 text-right text-[var(--muted-foreground)]">
                {row.installments}x
              </td>
              <td className="py-2 text-right font-medium text-[var(--foreground)]">
                {fmtBrl(row.effectiveCapital)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
