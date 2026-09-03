"use client";

import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { itemListSearchEmptyMessage } from "@/components/item-list-search";
import { TaxReportHeaderWithTip } from "@/components/relatorio-tributario/tax-report-transaction-table";
import { SortableTh } from "@/components/ui/sortable-th";
import { formatFinancialMoney, formatFinancialPercent } from "@/lib/financial-margin";
import {
  skuImpostoOperacionalMedio,
  skuImpostoOperacionalPercentual,
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
              label={
                <TaxReportHeaderWithTip
                  label="Imp. oper. médio"
                  tip="Média de PIS/COFINS + ICMS por venda."
                />
              }
              sortKey="impostoOperacionalMedio"
              sort={sort}
              onSortChange={onSortChange}
            />
            <SortableTh
              label={
                <TaxReportHeaderWithTip
                  label="% oper."
                  tip="Imposto operacional total do SKU sobre a receita."
                />
              }
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
      </table>
    </div>
  );
}
