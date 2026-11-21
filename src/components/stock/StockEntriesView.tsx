"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowDownToLine, ChevronDown, Plus } from "lucide-react";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { readApiError } from "@/lib/api/api-client-error";
import { formatMoneyBRLOrDash } from "@/lib/format-money";
import type { StockEntryRow, StockItemOption } from "@/lib/stock/stock-page-data";
import { StockEntryForm } from "@/components/stock/StockEntryForm";
import { formatDate, formatUnits } from "@/components/stock/stock-format";
import { cn } from "@/lib/utils";

const LOT_STATUS = {
  active: { label: "Custo vigente", variant: "success" },
  queued: { label: "Custo programado", variant: "default" },
  depleted: { label: "Esgotado", variant: "muted" },
} as const;

export function StockEntriesView({
  entries,
  items,
  suppliers,
  openForm = false,
}: {
  entries: StockEntryRow[];
  items: StockItemOption[];
  suppliers: Array<{ id: string; name: string }>;
  openForm?: boolean;
}) {
  const router = useRouter();
  const [formOpen, setFormOpen] = useState(openForm);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [reversing, setReversing] = useState<StockEntryRow | null>(null);
  const [busy, setBusy] = useState(false);

  async function reverse(entry: StockEntryRow) {
    setBusy(true);
    try {
      const res = await fetch(`/api/stock/entries/${entry.id}/reverse`, { method: "POST" });
      if (!res.ok) {
        toast.error(await readApiError(res, "stock_action_failed"));
        return;
      }
      toast.success("Entrada estornada.");
      setReversing(null);
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-[var(--muted-foreground)]">
          Toda mercadoria que chegou no galpão. Cada produto de uma entrada vira um lote, com o custo dele.
        </p>
        <Button onClick={() => setFormOpen(true)}>
          <Plus aria-hidden />
          Registrar entrada
        </Button>
      </div>

      {entries.length === 0 ? (
        <Card className="flex flex-col items-center gap-3 rounded-2xl p-10 text-center">
          <span className="flex size-11 items-center justify-center rounded-full bg-[var(--primary)]/10 text-[var(--primary)]">
            <ArrowDownToLine className="size-5" aria-hidden />
          </span>
          <p className="font-medium">Nenhuma entrada ainda</p>
          <p className="max-w-md text-sm text-[var(--muted-foreground)]">
            Quando a próxima compra chegar no galpão, registre aqui. É o único lançamento do dia a dia: vendas e
            envios ao Full o ERP acompanha sozinho.
          </p>
          <Button onClick={() => setFormOpen(true)} className="mt-1">
            Registrar a primeira entrada
          </Button>
        </Card>
      ) : (
        <Card className="overflow-hidden rounded-2xl">
          <ul className="divide-y divide-[var(--border)]">
            {entries.map((entry) => {
              const isOpen = expanded === entry.id;
              return (
                <li key={entry.id}>
                  <button
                    type="button"
                    onClick={() => setExpanded(isOpen ? null : entry.id)}
                    aria-expanded={isOpen}
                    className="flex w-full cursor-pointer items-center gap-3 px-4 py-3 text-left hover:bg-[var(--accent)]/40"
                  >
                    <ChevronDown
                      className={cn("size-4 shrink-0 text-[var(--muted-foreground)] transition-transform", isOpen && "rotate-180")}
                      aria-hidden
                    />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium">
                        {formatDate(entry.arrivedAt)}
                        {entry.supplierName ? ` · ${entry.supplierName}` : ""}
                        {entry.invoiceNumber ? ` · NF ${entry.invoiceNumber}` : ""}
                      </p>
                      <p className="text-xs text-[var(--muted-foreground)]">
                        {entry.lines.length} produto{entry.lines.length === 1 ? "" : "s"} ·{" "}
                        {entry.lines.slice(0, 3).map((l) => l.itemSku ?? l.itemTitle).join(", ")}
                        {entry.lines.length > 3 ? "…" : ""}
                      </p>
                    </div>
                    {entry.status === "reversed" ? <Badge variant="muted">Estornada</Badge> : null}
                    <div className="text-right">
                      <p className="text-sm font-semibold tabular-nums">{formatUnits(entry.units)} un</p>
                      <p className="text-xs tabular-nums text-[var(--muted-foreground)]">{formatMoneyBRLOrDash(entry.value)}</p>
                    </div>
                  </button>
                  {isOpen ? (
                    <div className="space-y-3 bg-[var(--muted)]/15 px-4 pb-4 pt-1">
                      <table className="w-full text-sm">
                        <thead className="text-left text-xs text-[var(--muted-foreground)]">
                          <tr>
                            <th className="py-2 font-medium">Produto</th>
                            <th className="py-2 text-right font-medium">Qtd</th>
                            <th className="py-2 text-right font-medium">Custo/un</th>
                            <th className="py-2 pl-3 text-right font-medium">Lote</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-[var(--border)]">
                          {entry.lines.map((line) => (
                            <tr key={line.lotId}>
                              <td className="py-2">
                                <span className="font-medium">{line.itemTitle}</span>
                                <span className="block text-xs text-[var(--muted-foreground)]">{line.itemSku ?? "Sem SKU"}</span>
                              </td>
                              <td className="py-2 text-right tabular-nums">{formatUnits(line.quantity)}</td>
                              <td className="py-2 text-right tabular-nums">{formatMoneyBRLOrDash(line.unitCost)}</td>
                              <td className="py-2 pl-3 text-right">
                                {entry.status === "reversed" ? (
                                  <Badge variant="muted">Estornado</Badge>
                                ) : (
                                  <Badge variant={LOT_STATUS[line.lotStatus].variant}>{LOT_STATUS[line.lotStatus].label}</Badge>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      {entry.notes ? <p className="text-xs text-[var(--muted-foreground)]">{entry.notes}</p> : null}
                      {entry.canReverse ? (
                        <Button variant="outline" size="sm" onClick={() => setReversing(entry)}>
                          Estornar entrada
                        </Button>
                      ) : entry.status === "active" ? (
                        <p className="text-xs text-[var(--muted-foreground)]">
                          Parte desta entrada já foi vendida: para corrigir, use um ajuste no produto.
                        </p>
                      ) : null}
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </Card>
      )}

      <StockEntryForm open={formOpen} onOpenChange={setFormOpen} items={items} suppliers={suppliers} />

      <AlertDialog open={reversing != null} onOpenChange={(open) => !open && setReversing(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Estornar esta entrada?</AlertDialogTitle>
            <AlertDialogDescription>
              As {formatUnits(reversing?.units ?? 0)} un saem do estoque Em casa e os lotes desta entrada deixam de
              contar. Fica registrado no extrato.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Cancelar</AlertDialogCancel>
            <AlertDialogAction disabled={busy} onClick={() => reversing && void reverse(reversing)}>
              Estornar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
