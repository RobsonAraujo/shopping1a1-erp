"use client";

import { useState } from "react";
import { ItemListSearch, itemListSearchEmptyMessage } from "@/components/item-list-search";
import { SortableTh } from "@/components/ui/sortable-th";
import { useTableSort } from "@/hooks/use-table-sort";
import { filterByItemListSearch } from "@/lib/item-list-search";
import { formatFinancialMoney, formatFinancialPercent } from "@/lib/financial-margin";
import { valueToneClass } from "@/lib/ui/tone";
import type { SimulacaoComparacao, SimulacaoSkuComparacao } from "@/lib/simples-nacional/types";

type SortKey = "receitaTotal" | "lucroRealPercent" | "diferencaPercent";

function getSortValue(row: SimulacaoSkuComparacao, key: SortKey): number {
  return row[key];
}

export function SimplesSimuladorSkuTable({
  comparacao,
}: {
  comparacao: SimulacaoComparacao;
}) {
  const [searchQuery, setSearchQuery] = useState("");

  const filtered = filterByItemListSearch(comparacao.porSku, searchQuery, (row) => ({
    sku: row.sku,
  }));

  const { sort, sortedRows, onSortChange } = useTableSort<SimulacaoSkuComparacao, SortKey>(
    filtered,
    getSortValue,
    { key: "diferencaPercent", direction: "desc" },
  );

  return (
    <div>
      <ItemListSearch
        value={searchQuery}
        onChange={setSearchQuery}
        filteredCount={sortedRows.length}
        totalCount={comparacao.porSku.length}
        placeholder="Buscar por SKU…"
        entitySingular="SKU"
        entityPlural="SKUs"
        className="mb-3"
      />
      <div className="overflow-x-auto">
        <table className="w-full min-w-[36rem] text-sm">
          <thead>
            <tr className="border-b border-[var(--border)] text-left text-xs text-[var(--muted-foreground)]">
              <th className="py-2 pr-3">SKU</th>
              <SortableTh
                label="Faturamento"
                sortKey="receitaTotal"
                sort={sort}
                onSortChange={onSortChange}
              />
              <th className="py-2 pr-3 text-right">% Simples (atual)</th>
              <SortableTh
                label="% Lucro Real (simulado)"
                sortKey="lucroRealPercent"
                sort={sort}
                onSortChange={onSortChange}
              />
              <SortableTh
                label="Diferença"
                sortKey="diferencaPercent"
                sort={sort}
                onSortChange={onSortChange}
              />
            </tr>
          </thead>
          <tbody>
            {sortedRows.length === 0 ? (
              <tr>
                <td colSpan={5} className="py-8 text-center text-sm text-[var(--muted-foreground)]">
                  {itemListSearchEmptyMessage(searchQuery, "SKU")}
                </td>
              </tr>
            ) : (
              sortedRows.map((row) => (
                <tr
                  key={row.sku}
                  className="border-b border-[var(--border)] hover:bg-[var(--muted)]/20"
                >
                  <td className="py-2 pr-3 font-medium">{row.sku}</td>
                  <td className="py-2 pr-3 text-right tabular-nums">
                    {formatFinancialMoney(row.receitaTotal)}
                  </td>
                  <td className="py-2 pr-3 text-right tabular-nums text-[var(--muted-foreground)]">
                    {formatFinancialPercent(comparacao.simplesAliquotaEfetivaPercent)}
                  </td>
                  <td className="py-2 pr-3 text-right tabular-nums">
                    {formatFinancialPercent(row.lucroRealPercent)}
                  </td>
                  <td
                    className={`py-2 pr-3 text-right tabular-nums font-medium ${valueToneClass(-row.diferencaPercent)}`}
                  >
                    {row.diferencaPercent > 0 ? "+" : ""}
                    {formatFinancialPercent(row.diferencaPercent)}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
