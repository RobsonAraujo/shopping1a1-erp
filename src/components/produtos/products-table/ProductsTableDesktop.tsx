"use client";

import { Pencil, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { PlanningInfoTrigger } from "@/components/planning-info-trigger";
import { itemListSearchEmptyMessage } from "@/components/item-list-search";
import { SortableTh } from "@/components/ui/sortable-th";
import { formatFinancialMoney, formatFinancialPercent } from "@/lib/financial-margin";
import type { ProductsTableProps } from "@/components/produtos/products-table/types";

export function ProductsTableDesktop({
  loading,
  sortedProducts,
  filteredProducts,
  searchQuery,
  sort,
  onSortChange,
  formatPricingCostExplainer,
  taxPercentExplainer,
  showFiscalFlags = true,
  onEdit,
  onDelete,
}: ProductsTableProps) {
  const columnCount = showFiscalFlags ? 8 : 5;
  return (
    <Card className="overflow-hidden p-0 shadow-sm">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[56rem] text-sm">
          <thead className="border-b border-[var(--border)] bg-[var(--muted)]/80 text-left text-xs text-[var(--muted-foreground)]">
            <tr>
              <SortableTh
                label="SKU"
                sortKey="sku"
                sort={sort}
                onSortChange={onSortChange}
                align="left"
                className="px-4 py-3 font-semibold uppercase tracking-wide"
              />
              <SortableTh
                label="NCM"
                sortKey="ncm"
                sort={sort}
                onSortChange={onSortChange}
                align="left"
                className="px-4 py-3 font-semibold uppercase tracking-wide"
              />
              <SortableTh
                label="Custo precificação"
                sortKey="pricingCost"
                sort={sort}
                onSortChange={onSortChange}
                align="right"
                className="px-4 py-3 font-semibold uppercase tracking-wide"
              />
              <SortableTh
                label="Imposto %"
                sortKey="taxPercent"
                sort={sort}
                onSortChange={onSortChange}
                align="right"
                className="px-4 py-3 font-semibold uppercase tracking-wide"
              />
              {showFiscalFlags ? (
                <>
                  <th className="px-4 py-3 text-center font-semibold uppercase tracking-wide">ST</th>
                  <th className="px-4 py-3 text-center font-semibold uppercase tracking-wide">Mono</th>
                  <th className="px-4 py-3 text-center font-semibold uppercase tracking-wide">
                    Import.
                  </th>
                </>
              ) : null}
              <th className="px-4 py-3 text-right font-semibold uppercase tracking-wide">Ações</th>
            </tr>
          </thead>
          <tbody className="bg-[var(--card)]">
            {loading ? (
              <tr>
                <td colSpan={columnCount} className="px-4 py-10 text-center text-[var(--muted-foreground)]">
                  Carregando…
                </td>
              </tr>
            ) : filteredProducts.length === 0 ? (
              <tr>
                <td colSpan={columnCount} className="px-4 py-10 text-center text-[var(--muted-foreground)]">
                  {sortedProducts.length === 0
                    ? "Nenhum produto cadastrado. Importe SKUs dos anúncios ou crie um novo."
                    : itemListSearchEmptyMessage(searchQuery, "produto")}
                </td>
              </tr>
            ) : (
              filteredProducts.map((product) => (
                <tr
                  key={product.sku}
                  className="border-t border-[var(--border)] transition-colors hover:bg-[var(--muted)]/25"
                >
                  <td className="px-4 py-3 font-medium">{product.sku}</td>
                  <td className="px-4 py-3 text-[var(--muted-foreground)]">
                    {product.ncm ?? "—"}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    <div className="flex items-center justify-end gap-1">
                      {product.pricingCost !== null
                        ? formatFinancialMoney(product.pricingCost)
                        : "—"}
                      <PlanningInfoTrigger content={formatPricingCostExplainer(product)} />
                    </div>
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    <div className="flex items-center justify-end gap-1">
                      {product.taxPercent !== null
                        ? formatFinancialPercent(product.taxPercent)
                        : "—"}
                      <PlanningInfoTrigger content={taxPercentExplainer(product)} />
                    </div>
                  </td>
                  {showFiscalFlags ? (
                    <>
                      <td className="px-4 py-3 text-center">
                        <Badge
                          variant={product.hasIcmsSt ? "success" : "muted"}
                          dot={product.hasIcmsSt}
                          className="min-w-[2.5rem]"
                        >
                          {product.hasIcmsSt ? "Sim" : "Não"}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <Badge
                          variant={product.isMonophasic ? "success" : "muted"}
                          dot={product.isMonophasic}
                          className="min-w-[2.5rem]"
                        >
                          {product.isMonophasic ? "Sim" : "Não"}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <Badge
                          variant={product.isImported ? "success" : "muted"}
                          dot={product.isImported}
                          className="min-w-[2.5rem]"
                        >
                          {product.isImported ? "Sim" : "Não"}
                        </Badge>
                      </td>
                    </>
                  ) : null}
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-1">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        aria-label={`Editar ${product.sku}`}
                        onClick={() => onEdit(product)}
                      >
                        <Pencil className="size-4" aria-hidden />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        aria-label={`Remover ${product.sku}`}
                        onClick={() => onDelete(product.sku)}
                      >
                        <Trash2 className="size-4" aria-hidden />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
