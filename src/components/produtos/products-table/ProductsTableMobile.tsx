"use client";

import { Pencil, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { PlanningInfoTrigger } from "@/components/planning-info-trigger";
import { itemListSearchEmptyMessage } from "@/components/item-list-search";
import { formatFinancialMoney, formatFinancialPercent } from "@/lib/financial-margin";
import type { ProductsTableProps } from "@/components/produtos/products-table/types";

function FlagBadge({ label, active }: { label: string; active: boolean }) {
  if (!active) return null;
  return (
    <Badge variant="success" dot className="text-[10px]">
      {label}
    </Badge>
  );
}

export function ProductsTableMobile({
  loading,
  sortedProducts,
  filteredProducts,
  searchQuery,
  formatPricingCostExplainer,
  taxPercentExplainer,
  showFiscalFlags = true,
  onEdit,
  onDelete,
}: ProductsTableProps) {
  if (loading) {
    return (
      <Card className="px-4 py-10 text-center text-sm text-[var(--muted-foreground)]">
        Carregando…
      </Card>
    );
  }

  if (filteredProducts.length === 0) {
    return (
      <Card className="px-4 py-10 text-center text-sm text-[var(--muted-foreground)]">
        {sortedProducts.length === 0
          ? "Nenhum produto cadastrado. Importe SKUs dos anúncios ou crie um novo."
          : itemListSearchEmptyMessage(searchQuery, "produto")}
      </Card>
    );
  }

  return (
    <ul className="space-y-3">
      {filteredProducts.map((product) => (
        <li key={product.sku}>
          <Card className="p-4 shadow-sm">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-[var(--foreground)]">
                  {product.sku}
                </p>
                <p className="mt-0.5 text-xs text-[var(--muted-foreground)]">
                  NCM {product.ncm ?? "—"}
                </p>
              </div>
              <div className="flex shrink-0 gap-1">
                <Button
                  type="button"
                  variant="outline"
                  size="icon-sm"
                  aria-label={`Editar ${product.sku}`}
                  onClick={() => onEdit(product)}
                >
                  <Pencil className="size-4" aria-hidden />
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="icon-sm"
                  aria-label={`Remover ${product.sku}`}
                  onClick={() => onDelete(product.sku)}
                >
                  <Trash2 className="size-4" aria-hidden />
                </Button>
              </div>
            </div>

            <div className="mt-3 grid grid-cols-2 gap-3 border-t border-[var(--border)] pt-3">
              <div>
                <p className="text-[11px] uppercase tracking-wide text-[var(--muted-foreground)]">
                  Custo precificação
                </p>
                <div className="mt-0.5 flex items-center gap-1 text-sm font-medium tabular-nums">
                  {product.pricingCost !== null
                    ? formatFinancialMoney(product.pricingCost)
                    : "—"}
                  <PlanningInfoTrigger content={formatPricingCostExplainer(product)} />
                </div>
              </div>
              <div>
                <p className="text-[11px] uppercase tracking-wide text-[var(--muted-foreground)]">
                  Imposto %
                </p>
                <div className="mt-0.5 flex items-center gap-1 text-sm font-medium tabular-nums">
                  {product.taxPercent !== null
                    ? formatFinancialPercent(product.taxPercent)
                    : "—"}
                  <PlanningInfoTrigger content={taxPercentExplainer(product)} />
                </div>
              </div>
            </div>

            {showFiscalFlags &&
            (product.hasIcmsSt || product.isMonophasic || product.isImported) ? (
              <div className="mt-3 flex flex-wrap gap-1.5">
                <FlagBadge label="ICMS-ST" active={product.hasIcmsSt} />
                <FlagBadge label="Monofásico" active={product.isMonophasic} />
                <FlagBadge label="Importado" active={product.isImported} />
              </div>
            ) : null}
          </Card>
        </li>
      ))}
    </ul>
  );
}
