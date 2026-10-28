"use client";

import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { itemListSearchEmptyMessage } from "@/components/shared/ItemListSearch";
import { TaxReportTipIcon } from "@/components/relatorio-tributario/TaxReportTransactionTable";
import { SortableTh } from "@/components/ui/sortable-th";
import { formatFinancialMoney, formatFinancialPercent } from "@/lib/pricing/financial-margin";
import {
  skuImpostoOperacionalMedio,
  skuImpostoOperacionalPercentual,
  skuImpostoOperacionalTotal,
} from "@/lib/tax-report/imposto-operacional";
import type { TaxReportSkuTableProps } from "@/components/relatorio-tributario/tax-report-sku-table/types";

export function TaxReportSkuTableDesktop({
  rows,
  searchQuery,
  skuPathFor,
  sort,
  onSortChange,
}: TaxReportSkuTableProps) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[52rem] text-sm">
        <thead>
          <tr className="border-b border-[var(--border)] text-left text-xs text-[var(--muted-foreground)]">
            <th className="py-2 pr-3">SKU</th>
            <SortableTh
              label="Vendas"
              sortKey="quantidadeVendas"
              sort={sort}
              onSortChange={onSortChange}
            />
            <SortableTh
              label="Unidades"
              sortKey="unidadesVendidas"
              sort={sort}
              onSortChange={onSortChange}
            />
            <SortableTh
              label="Receita"
              sortKey="receitaTotal"
              sort={sort}
              onSortChange={onSortChange}
            />
            <SortableTh
              label="Imp. oper. médio"
              hint={<TaxReportTipIcon label="Imp. oper. médio" tip="Média de PIS/COFINS + ICMS por venda." />}
              sortKey="impostoOperacionalMedio"
              sort={sort}
              onSortChange={onSortChange}
            />
            <SortableTh
              label="% oper."
              hint={<TaxReportTipIcon label="% oper." tip="Imposto operacional total do SKU sobre a receita." />}
              sortKey="impostoOperacionalPercentual"
              sort={sort}
              onSortChange={onSortChange}
            />
            <th className="py-2 w-8" aria-hidden />
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td
                colSpan={7}
                className="py-8 text-center text-sm text-[var(--muted-foreground)]"
              >
                {itemListSearchEmptyMessage(searchQuery, "SKU")}
              </td>
            </tr>
          ) : (
            rows.map((row) => (
              <tr
                key={row.mlItemId ?? row.sku}
                className="border-b border-[var(--border)] hover:bg-[var(--muted)]/20"
              >
                <td className="py-2 pr-3 font-medium">
                  <Link
                    href={skuPathFor(row.mlItemId ?? row.sku)}
                    className="inline-flex flex-col gap-0.5 text-[var(--primary)] hover:underline"
                  >
                    <span>{row.sku}</span>
                    {(row.skuAliases?.length ?? 0) > 0 ? (
                      <span className="text-[10px] font-normal text-[var(--muted-foreground)]">
                        SKU Associados: {row.skuAliases?.join(", ")}
                      </span>
                    ) : null}
                  </Link>
                </td>
                <td className="py-2 pr-3 text-right tabular-nums">
                  {row.quantidadeVendas}
                </td>
                <td className="py-2 pr-3 text-right tabular-nums">
                  {row.unidadesVendidas}
                </td>
                <td className="py-2 pr-3 text-right tabular-nums">
                  {formatFinancialMoney(row.receitaTotal)}
                </td>
                <td className="py-2 pr-3 text-right tabular-nums">
                  {formatFinancialMoney(skuImpostoOperacionalMedio(row))}
                </td>
                <td className="py-2 pr-3 text-right tabular-nums">
                  {formatFinancialPercent(skuImpostoOperacionalPercentual(row))}
                </td>
                <td className="py-2 text-[var(--muted-foreground)]">
                  <Link
                    href={skuPathFor(row.mlItemId ?? row.sku)}
                    aria-label={`Ver vendas de ${row.sku}`}
                  >
                    <ChevronRight className="size-4" />
                  </Link>
                </td>
              </tr>
            ))
          )}
        </tbody>
        {rows.length > 0 ? <TaxReportSkuTotalRow rows={rows} searchQuery={searchQuery} /> : null}
      </table>
    </div>
  );
}

/**
 * Total das linhas da tabela — o % é a média ponderada pelo valor das vendas
 * (imposto ÷ receita), o mesmo do "Imposto do mês" quando não há filtro.
 */
function TaxReportSkuTotalRow({
  rows,
  searchQuery,
}: Pick<TaxReportSkuTableProps, "rows" | "searchQuery">) {
  const vendas = rows.reduce((sum, row) => sum + row.quantidadeVendas, 0);
  const unidades = rows.reduce((sum, row) => sum + row.unidadesVendidas, 0);
  const receita = rows.reduce((sum, row) => sum + row.receitaTotal, 0);
  const imposto = rows.reduce((sum, row) => sum + skuImpostoOperacionalTotal(row), 0);
  return (
    <tfoot>
      <tr className="border-t-2 border-[var(--border)] font-semibold">
        <td className="py-2 pr-3">Total{searchQuery.trim() ? " (filtrado)" : ""}</td>
        <td className="py-2 pr-3 text-right tabular-nums">{vendas}</td>
        <td className="py-2 pr-3 text-right tabular-nums">{unidades}</td>
        <td className="py-2 pr-3 text-right tabular-nums">
          {formatFinancialMoney(receita)}
        </td>
        <td className="py-2 pr-3 text-right tabular-nums">
          {formatFinancialMoney(vendas > 0 ? imposto / vendas : null)}
        </td>
        <td className="py-2 pr-3 text-right tabular-nums">
          {formatFinancialPercent(receita > 0 ? (imposto / receita) * 100 : null)}
        </td>
        <td className="py-2" aria-hidden />
      </tr>
    </tfoot>
  );
}
