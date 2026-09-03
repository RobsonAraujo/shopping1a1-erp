"use client";

import { useMemo, useState } from "react";
import { AlertTriangle, Ban, Search } from "lucide-react";
import {
  Sheet,
  SheetBody,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { FormInput } from "@/components/ui/form-input";
import { SortableTh } from "@/components/ui/sortable-th";
import { useTableSort } from "@/hooks/use-table-sort";
import {
  formatFinancialMoney,
  formatFinancialPercent,
} from "@/lib/pricing/financial-margin";
import { cn } from "@/lib/utils";
import type { DreTaxBreakdownItem } from "@/lib/dre/dre-calculations";

type DreTaxAuditSortKey =
  | "title"
  | "quantity"
  | "revenue"
  | "taxPercent"
  | "totalTax";

type DreTaxAuditModalProps = {
  open: boolean;
  title: string;
  items: DreTaxBreakdownItem[];
  /** true quando algum mês do período não tem o detalhamento salvo (sincronizado antes desta funcionalidade). */
  needsResync?: boolean;
  onClose: () => void;
};

function matchesQuery(item: DreTaxBreakdownItem, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return (
    item.title.toLowerCase().includes(q) ||
    (item.sku ?? "").toLowerCase().includes(q)
  );
}

export function DreTaxAuditModal({
  open,
  title,
  items,
  needsResync,
  onClose,
}: DreTaxAuditModalProps) {
  const [query, setQuery] = useState("");

  const filteredItems = useMemo(
    () => items.filter((item) => matchesQuery(item, query)),
    [items, query],
  );

  const { sort, sortedRows, onSortChange } = useTableSort<
    DreTaxBreakdownItem,
    DreTaxAuditSortKey
  >(
    filteredItems,
    (item, key) => {
      switch (key) {
        case "title":
          return item.title || item.sku || "";
        case "quantity":
          return item.quantity;
        case "revenue":
          return item.revenue;
        case "taxPercent":
          return item.taxPercent ?? 0;
        case "totalTax":
          return item.totalTax;
      }
    },
    { key: "totalTax", direction: "desc" },
  );

  const totalQuantity = filteredItems.reduce(
    (sum, item) => sum + item.quantity,
    0,
  );
  const totalRevenue = filteredItems.reduce(
    (sum, item) => sum + item.revenue,
    0,
  );
  const totalTax = filteredItems.reduce((sum, item) => sum + item.totalTax, 0);
  const cancelledItems = items.filter((item) => (item.cancelledQuantity ?? 0) > 0);
  const cancelledQuantityTotal = items.reduce(
    (sum, item) => sum + (item.cancelledQuantity ?? 0),
    0,
  );
  const cancelledRevenueTotal = items.reduce(
    (sum, item) => sum + (item.cancelledRevenue ?? 0),
    0,
  );
  const cancelledTax = items.reduce(
    (sum, item) => sum + (item.cancelledTax ?? 0),
    0,
  );

  return (
    <Sheet
      open={open}
      onOpenChange={(next) => {
        if (!next) {
          setQuery("");
          onClose();
        }
      }}
    >
      <SheetContent className="flex h-[92vh] flex-col sm:max-h-[92vh] sm:w-[95vw] sm:max-w-4xl">
        <SheetHeader>
          <SheetTitle>Auditoria — Imposto ML</SheetTitle>
          <SheetDescription>
            {title}. Para cada anúncio: valor de venda × % de imposto (ICMS/ST)
            apurado no relatório tributário do produto naquele mês.
          </SheetDescription>
        </SheetHeader>
        <SheetBody className="flex flex-1 flex-col overflow-hidden">
          {cancelledItems.length > 0 ? (
            <div className="mb-3 flex shrink-0 items-start gap-2 rounded-lg border border-[var(--border)] bg-[var(--muted)]/40 px-3 py-2 text-xs leading-relaxed text-[var(--muted-foreground)]">
              <Ban className="mt-0.5 size-3.5 shrink-0" aria-hidden />
              <span>
                {cancelledItems.length} produto(s) / {cancelledQuantityTotal}{" "}
                un. canceladas/devolvidas neste período. A row Canceladas /
                devolvidas mostra o valor de venda (
                {formatFinancialMoney(cancelledRevenueTotal)}); o imposto
                excluído da soma abaixo é {formatFinancialMoney(cancelledTax)}.
                Marcados com{" "}
                <Ban
                  className="inline size-3 -translate-y-px"
                  aria-hidden
                />{" "}
                abaixo, na linha do próprio produto. A receita desses
                pedidos entra em Faturamento ML, mas esse imposto não é
                somado no total abaixo pois o produto não foi enviado.
              </span>
            </div>
          ) : null}
          {needsResync ? (
            <div className="mb-3 flex shrink-0 items-start gap-2 rounded-lg border border-amber-200 bg-amber-50/70 px-3 py-2 text-xs text-amber-900">
              <AlertTriangle className="mt-0.5 size-3.5 shrink-0" aria-hidden />
              <span>
                Este período foi sincronizado antes da auditoria por produto
                existir. Re-sincronize o(s) mês(es) para ver o detalhamento
                completo.
              </span>
            </div>
          ) : null}
          {items.length === 0 ? (
            <p className="text-sm text-[var(--muted-foreground)]">
              Nenhum item vendido neste período.
            </p>
          ) : (
            <>
              <div className="relative mb-3 shrink-0">
                <Search
                  className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[var(--muted-foreground)]"
                  aria-hidden
                />
                <FormInput
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Buscar por produto ou SKU..."
                  inputClassName="pl-9"
                  aria-label="Buscar produto"
                />
              </div>
              <div className="flex-1 overflow-y-auto overflow-x-hidden rounded-lg border border-[var(--border)]">
                <table className="w-full table-fixed text-left text-[12.5px]">
                  <colgroup>
                    <col />
                    <col className="w-16" />
                    <col className="w-32" />
                    <col className="w-20" />
                    <col className="w-32" />
                  </colgroup>
                  <thead className="sticky top-0 z-10">
                    <tr className="border-b border-[var(--border)] bg-[var(--muted)] text-[11px] uppercase text-[var(--muted-foreground)]">
                      <SortableTh
                        label="Produto"
                        sortKey="title"
                        sort={sort}
                        onSortChange={onSortChange}
                        align="left"
                        className="px-3 py-2"
                      />
                      <SortableTh
                        label="Qtd."
                        sortKey="quantity"
                        sort={sort}
                        onSortChange={onSortChange}
                        className="px-3 py-2"
                      />
                      <SortableTh
                        label="Faturamento"
                        sortKey="revenue"
                        sort={sort}
                        onSortChange={onSortChange}
                        className="px-3 py-2"
                      />
                      <SortableTh
                        label="% Imposto"
                        sortKey="taxPercent"
                        sort={sort}
                        onSortChange={onSortChange}
                        className="px-3 py-2"
                      />
                      <SortableTh
                        label="Imposto total"
                        sortKey="totalTax"
                        sort={sort}
                        onSortChange={onSortChange}
                        className="px-3 py-2"
                      />
                    </tr>
                  </thead>
                  <tbody>
                    {filteredItems.length === 0 ? (
                      <tr>
                        <td
                          colSpan={5}
                          className="px-3 py-6 text-center text-[var(--muted-foreground)]"
                        >
                          Nenhum produto encontrado para &quot;{query}&quot;.
                        </td>
                      </tr>
                    ) : (
                      sortedRows.map((item) => {
                        const cancelledQuantity = item.cancelledQuantity ?? 0;
                        const cancelledRevenueForItem =
                          item.cancelledRevenue ?? 0;
                        const cancelledTaxForItem = item.cancelledTax ?? 0;
                        const fullyCancelled =
                          item.quantity === 0 && cancelledQuantity > 0;
                        const displayQuantity = fullyCancelled
                          ? cancelledQuantity
                          : item.quantity;
                        const displayRevenue = fullyCancelled
                          ? cancelledRevenueForItem
                          : item.revenue;
                        const displayTaxPercent = fullyCancelled
                          ? cancelledRevenueForItem > 0
                            ? (cancelledTaxForItem / cancelledRevenueForItem) *
                              100
                            : null
                          : item.taxPercent;
                        const displayTotalTax = fullyCancelled
                          ? cancelledTaxForItem
                          : item.totalTax;
                        return (
                          <tr
                            key={item.key}
                            className={cn(
                              "border-b border-[var(--border)] last:border-b-0",
                              fullyCancelled && "opacity-60",
                            )}
                          >
                            <td className="px-3 py-2">
                              <div className="flex items-start gap-1.5">
                                {fullyCancelled ? (
                                  <Ban
                                    className="mt-0.5 size-3.5 shrink-0 text-[var(--muted-foreground)]"
                                    aria-hidden
                                  />
                                ) : item.missingTax ? (
                                  <AlertTriangle
                                    className="mt-0.5 size-3.5 shrink-0 text-amber-600"
                                    aria-hidden
                                  />
                                ) : null}
                                <div className="min-w-0">
                                  <p className="truncate font-medium leading-tight">
                                    {item.title || item.sku || "—"}
                                  </p>
                                  {item.sku ? (
                                    <p className="truncate text-[11px] text-[var(--muted-foreground)]">
                                      SKU: {item.sku}
                                    </p>
                                  ) : null}
                                  {fullyCancelled ? (
                                    <p className="text-[11px] font-medium text-[var(--muted-foreground)]">
                                      Cancelado · não entra no total ·{" "}
                                      {cancelledQuantity} un.
                                    </p>
                                  ) : item.missingTax ? (
                                    <p className="text-[11px] text-amber-700">
                                      Sem % de imposto apurado no mês
                                    </p>
                                  ) : null}
                                  {!fullyCancelled && cancelledQuantity > 0 ? (
                                    <p className="mt-0.5 flex items-center gap-1 text-[11px] font-medium text-[var(--muted-foreground)]">
                                      <Ban className="size-3 shrink-0" aria-hidden />+
                                      {cancelledQuantity} un. cancelados (
                                      {formatFinancialMoney(cancelledTaxForItem)}
                                      ) · não contam no total
                                    </p>
                                  ) : null}
                                </div>
                              </div>
                            </td>
                            <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums">
                              {displayQuantity}
                            </td>
                            <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums">
                              {formatFinancialMoney(displayRevenue)}
                            </td>
                            <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums">
                              {formatFinancialPercent(displayTaxPercent)}
                            </td>
                            <td className="whitespace-nowrap px-3 py-2 text-right font-semibold tabular-nums">
                              {formatFinancialMoney(displayTotalTax)}
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                  <tfoot>
                    <tr className="sticky bottom-0 border-t border-[var(--border)] bg-[var(--muted)] font-semibold">
                      <td className="px-3 py-2">
                        Total {query ? "(filtrado)" : ""}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums">
                        {totalQuantity}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums">
                        {formatFinancialMoney(totalRevenue)}
                      </td>
                      <td className="px-3 py-2" />
                      <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums">
                        {formatFinancialMoney(totalTax)}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </>
          )}
        </SheetBody>
        <SheetFooter>
          <Button type="button" variant="outline" onClick={onClose}>
            Fechar
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
