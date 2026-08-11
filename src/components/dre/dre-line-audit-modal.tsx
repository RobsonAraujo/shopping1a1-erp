"use client";

import { useMemo, useState } from "react";
import { AlertTriangle, Search } from "lucide-react";
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
import { formatFinancialMoney } from "@/lib/financial-margin";
import type { DreLineBreakdownItem } from "@/lib/dre/dre-calculations";

type DreLineAuditModalProps = {
  open: boolean;
  rowLabel: string;
  title: string;
  description: string;
  amountLabel: string;
  items: DreLineBreakdownItem[];
  /** true quando o valor vem consolidado direto da fatura ML, sem detalhamento por produto possível. */
  unavailable?: boolean;
  /** true quando algum mês do período não tem o detalhamento salvo (sincronizado antes desta funcionalidade). */
  needsResync?: boolean;
  onClose: () => void;
};

function matchesQuery(item: DreLineBreakdownItem, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return (
    item.title.toLowerCase().includes(q) ||
    (item.sku ?? "").toLowerCase().includes(q)
  );
}

export function DreLineAuditModal({
  open,
  rowLabel,
  title,
  description,
  amountLabel,
  items,
  unavailable,
  needsResync,
  onClose,
}: DreLineAuditModalProps) {
  const [query, setQuery] = useState("");

  const filteredItems = useMemo(
    () => items.filter((item) => matchesQuery(item, query)),
    [items, query],
  );

  const totalQuantity = filteredItems.reduce(
    (sum, item) => sum + (item.quantity ?? 0),
    0,
  );
  const totalAmount = filteredItems.reduce((sum, item) => sum + item.amount, 0);
  const hasQuantity = items.some((item) => item.quantity !== null);

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
          <SheetTitle>Auditoria — {rowLabel}</SheetTitle>
          <SheetDescription>
            {title}. {description}
          </SheetDescription>
        </SheetHeader>
        <SheetBody className="flex flex-1 flex-col overflow-hidden">
          {unavailable ? (
            <div className="flex flex-1 items-center justify-center">
              <div className="max-w-md rounded-lg border border-[var(--border)] bg-[var(--muted)]/30 px-4 py-6 text-center text-sm text-[var(--muted-foreground)]">
                <AlertTriangle
                  className="mx-auto mb-2 size-5 text-amber-600"
                  aria-hidden
                />
                Este valor vem consolidado direto da fatura do Mercado Livre.
                O ML não fornece detalhamento por produto para esta linha —
                apenas o total do período.
              </div>
            </div>
          ) : (
            <>
              {needsResync ? (
                <div className="mb-3 flex shrink-0 items-start gap-2 rounded-lg border border-amber-200 bg-amber-50/70 px-3 py-2 text-xs text-amber-900">
                  <AlertTriangle
                    className="mt-0.5 size-3.5 shrink-0"
                    aria-hidden
                  />
                  <span>
                    Este período foi sincronizado antes da auditoria por
                    produto existir. Re-sincronize o(s) mês(es) para ver o
                    detalhamento completo.
                  </span>
                </div>
              ) : null}
              {items.length === 0 ? (
                <p className="text-sm text-[var(--muted-foreground)]">
                  Nenhum item neste período.
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
                        {hasQuantity ? <col className="w-20" /> : null}
                        <col className="w-32" />
                      </colgroup>
                      <thead className="sticky top-0 z-10">
                        <tr className="border-b border-[var(--border)] bg-[var(--muted)] text-[11px] uppercase text-[var(--muted-foreground)]">
                          <th className="px-3 py-2 font-medium">Produto</th>
                          {hasQuantity ? (
                            <th className="px-3 py-2 text-right font-medium">
                              Qtd.
                            </th>
                          ) : null}
                          <th className="px-3 py-2 text-right font-medium">
                            {amountLabel}
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredItems.length === 0 ? (
                          <tr>
                            <td
                              colSpan={hasQuantity ? 3 : 2}
                              className="px-3 py-6 text-center text-[var(--muted-foreground)]"
                            >
                              Nenhum produto encontrado para &quot;{query}
                              &quot;.
                            </td>
                          </tr>
                        ) : (
                          filteredItems.map((item) => (
                            <tr
                              key={item.key}
                              className="border-b border-[var(--border)] last:border-b-0"
                            >
                              <td className="px-3 py-2">
                                <div className="min-w-0">
                                  <p className="truncate font-medium leading-tight">
                                    {item.title || item.sku || "—"}
                                  </p>
                                  {item.sku ? (
                                    <p className="truncate text-[11px] text-[var(--muted-foreground)]">
                                      SKU: {item.sku}
                                    </p>
                                  ) : null}
                                </div>
                              </td>
                              {hasQuantity ? (
                                <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums">
                                  {item.quantity ?? "—"}
                                </td>
                              ) : null}
                              <td className="whitespace-nowrap px-3 py-2 text-right font-semibold tabular-nums">
                                {formatFinancialMoney(item.amount)}
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                      <tfoot>
                        <tr className="sticky bottom-0 border-t border-[var(--border)] bg-[var(--muted)] font-semibold">
                          <td className="px-3 py-2">
                            Total {query ? "(filtrado)" : ""}
                          </td>
                          {hasQuantity ? (
                            <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums">
                              {totalQuantity}
                            </td>
                          ) : null}
                          <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums">
                            {formatFinancialMoney(totalAmount)}
                          </td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                </>
              )}
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
