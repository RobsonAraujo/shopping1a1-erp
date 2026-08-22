import { ChevronRight } from "lucide-react";
import {
  formatFinancialMoney,
  formatFinancialPercent,
} from "@/lib/financial-margin";

const ROWS = [
  {
    sku: "FONE-BT-01",
    vendas: 86,
    unidades: 86,
    receita: 12891.4,
    impOperMedio: 18.42,
    pctOper: 12.3,
  },
  {
    sku: "CABO-USB-C",
    vendas: 214,
    unidades: 428,
    receita: 12797.2,
    impOperMedio: 3.11,
    pctOper: 10.4,
  },
  {
    sku: "CAPA-14",
    vendas: 61,
    unidades: 61,
    receita: 5483.9,
    impOperMedio: 11.08,
    pctOper: 12.3,
  },
  {
    sku: "PANELA-05",
    vendas: 24,
    unidades: 24,
    receita: 4557.6,
    impOperMedio: 22.9,
    pctOper: 12.1,
  },
];

export function DemoTributario() {
  return (
    <div className="overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--card)] shadow-md">
      <div className="border-b border-[var(--border)] px-4 py-3">
        <p className="text-sm font-semibold">Por SKU</p>
        <p className="text-xs text-[var(--muted-foreground)]">
          Relatório tributário · agosto · demonstração
        </p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[40rem] text-sm">
          <thead>
            <tr className="border-b border-[var(--border)] text-left text-xs text-[var(--muted-foreground)]">
              <th className="py-2 pl-4 pr-3 font-medium">SKU</th>
              <th className="py-2 pr-3 text-right font-medium">Vendas</th>
              <th className="py-2 pr-3 text-right font-medium">Unidades</th>
              <th className="py-2 pr-3 text-right font-medium">Receita</th>
              <th className="py-2 pr-3 text-right font-medium">
                Imp. oper. médio
              </th>
              <th className="py-2 pr-3 text-right font-medium">% oper.</th>
              <th className="w-8 py-2" aria-hidden />
            </tr>
          </thead>
          <tbody>
            {ROWS.map((row) => (
              <tr
                key={row.sku}
                className="border-b border-[var(--border)] last:border-0"
              >
                <td className="py-2 pl-4 pr-3 font-medium text-[var(--primary)]">
                  {row.sku}
                </td>
                <td className="py-2 pr-3 text-right tabular-nums">
                  {row.vendas}
                </td>
                <td className="py-2 pr-3 text-right tabular-nums">
                  {row.unidades}
                </td>
                <td className="py-2 pr-3 text-right tabular-nums">
                  {formatFinancialMoney(row.receita)}
                </td>
                <td className="py-2 pr-3 text-right tabular-nums">
                  {formatFinancialMoney(row.impOperMedio)}
                </td>
                <td className="py-2 pr-3 text-right tabular-nums">
                  {formatFinancialPercent(row.pctOper)}
                </td>
                <td className="py-2 pr-3 text-[var(--muted-foreground)]">
                  <ChevronRight className="size-4" aria-hidden />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
