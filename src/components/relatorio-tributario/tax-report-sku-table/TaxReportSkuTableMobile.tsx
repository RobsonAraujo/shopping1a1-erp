"use client";

import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { Card } from "@/components/ui/card";
import { itemListSearchEmptyMessage } from "@/components/item-list-search";
import { formatFinancialMoney, formatFinancialPercent } from "@/lib/financial-margin";
import {
  skuImpostoOperacionalMedio,
  skuImpostoOperacionalPercentual,
} from "@/lib/tax-report/imposto-operacional";
import type { TaxReportSkuTableProps } from "@/components/relatorio-tributario/tax-report-sku-table/types";

export function TaxReportSkuTableMobile({
  rows,
  searchQuery,
  totalCount,
  skuPathFor,
}: TaxReportSkuTableProps) {
  if (rows.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-[var(--muted-foreground)]">
        {totalCount === 0
          ? "Nenhum SKU encontrado neste período."
          : itemListSearchEmptyMessage(searchQuery, "SKU")}
      </p>
    );
  }

  return (
    <ul className="space-y-3">
      {rows.map((row) => (
        <li key={row.mlItemId ?? row.sku}>
          <Link href={skuPathFor(row.mlItemId ?? row.sku)} className="block">
            <Card className="p-4 shadow-sm transition-colors hover:bg-[var(--muted)]/20">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-[var(--primary)]">
                    {row.sku}
                  </p>
                  {(row.skuAliases?.length ?? 0) > 0 ? (
                    <p className="mt-0.5 truncate text-[11px] text-[var(--muted-foreground)]">
                      SKU Associados: {row.skuAliases?.join(", ")}
                    </p>
                  ) : null}
                </div>
                <ChevronRight
                  className="mt-0.5 size-4 shrink-0 text-[var(--muted-foreground)]"
                  aria-hidden
                />
              </div>

              <div className="mt-3 grid grid-cols-2 gap-3 border-t border-[var(--border)] pt-3">
                <div>
                  <p className="text-[11px] uppercase tracking-wide text-[var(--muted-foreground)]">
                    Vendas / Unidades
                  </p>
                  <p className="mt-0.5 text-sm font-medium tabular-nums">
                    {row.quantidadeVendas} / {row.unidadesVendidas}
                  </p>
                </div>
                <div>
                  <p className="text-[11px] uppercase tracking-wide text-[var(--muted-foreground)]">
                    Receita
                  </p>
                  <p className="mt-0.5 text-sm font-medium tabular-nums">
                    {formatFinancialMoney(row.receitaTotal)}
                  </p>
                </div>
                <div>
                  <p className="text-[11px] uppercase tracking-wide text-[var(--muted-foreground)]">
                    Imp. oper. médio
                  </p>
                  <p className="mt-0.5 text-sm font-medium tabular-nums">
                    {formatFinancialMoney(skuImpostoOperacionalMedio(row))}
                  </p>
                </div>
                <div>
                  <p className="text-[11px] uppercase tracking-wide text-[var(--muted-foreground)]">
                    % oper.
                  </p>
                  <p className="mt-0.5 text-sm font-medium tabular-nums">
                    {formatFinancialPercent(skuImpostoOperacionalPercentual(row))}
                  </p>
                </div>
              </div>
            </Card>
          </Link>
        </li>
      ))}
    </ul>
  );
}
