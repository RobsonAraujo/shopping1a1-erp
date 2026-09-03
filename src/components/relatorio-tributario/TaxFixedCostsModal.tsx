"use client";

import { useState } from "react";
import { Eraser, Pencil, Plus, Square } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { FormInput } from "@/components/ui/form-input";
import { Switch } from "@/components/ui/switch";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Sheet,
  SheetBody,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
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
import { MaskedMoneyField } from "@/components/shared/FinancialCostInputFields";
import { readApiError } from "@/lib/api/api-client-error";

export type TaxFixedCostItemStatus = "normal" | "excluded_this_month" | "ended";

export type TaxFixedCostItemRow = {
  id: string;
  name: string;
  sortOrder: number;
  recurring: boolean;
  amount: number | null;
  isExplicit: boolean;
  status: TaxFixedCostItemStatus;
};

type TaxFixedCostsModalProps = {
  open: boolean;
  year: number;
  month: number;
  items: TaxFixedCostItemRow[];
  onClose: () => void;
  onChanged: () => void;
  onError?: (message: string) => void;
};

const MONTH_NAMES_PT = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
] as const;

function monthLabelFor(year: number, month: number): string {
  return `${MONTH_NAMES_PT[month - 1] ?? month} de ${year}`;
}

export function TaxFixedCostsModal({
  open,
  year,
  month,
  items,
  onClose,
  onChanged,
  onError,
}: TaxFixedCostsModalProps) {
  const [newName, setNewName] = useState("");
  const [newAmount, setNewAmount] = useState<number | null>(null);
  const [newRecurring, setNewRecurring] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");
  const [editingAmount, setEditingAmount] = useState<number | null>(null);
  const [editingRecurring, setEditingRecurring] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendingAction, setPendingAction] = useState<
    | { type: "remove-month"; item: TaxFixedCostItemRow }
    | { type: "end-item"; item: TaxFixedCostItemRow }
    | null
  >(null);

  async function addItem() {
    const name = newName.trim();
    if (!name) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/tax-report/fixed-cost-items", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          recurring: newRecurring,
          amount: newAmount,
          year,
          month,
        }),
      });
      if (!res.ok) {
        const message = await readApiError(res, "tax_fixed_cost_item_create_failed");
        setError(message);
        onError?.(message);
        return;
      }
      setNewName("");
      setNewAmount(null);
      setNewRecurring(true);
      onChanged();
    } catch {
      const message = "Falha de rede ao adicionar gasto fixo.";
      setError(message);
      onError?.(message);
    } finally {
      setBusy(false);
    }
  }

  async function saveEdits(id: string) {
    const name = editingName.trim();
    if (!name) return;
    setBusy(true);
    setError(null);
    try {
      const [patchRes, amountRes] = await Promise.all([
        fetch(`/api/tax-report/fixed-cost-items/${id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name, recurring: editingRecurring }),
        }),
        fetch("/api/tax-report/fixed-cost-values", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            costItemId: id,
            year,
            month,
            amount: editingAmount,
          }),
        }),
      ]);
      if (!patchRes.ok || !amountRes.ok) {
        const message = await readApiError(
          patchRes.ok ? amountRes : patchRes,
          "tax_fixed_cost_item_update_failed",
        );
        setError(message);
        onError?.(message);
        return;
      }
      setEditingId(null);
      onChanged();
    } catch {
      const message = "Falha de rede ao salvar alterações.";
      setError(message);
      onError?.(message);
    } finally {
      setBusy(false);
    }
  }

  function cancelEdit() {
    setEditingId(null);
    setEditingName("");
    setEditingAmount(null);
    setEditingRecurring(true);
  }

  async function removeMonthValue(item: TaxFixedCostItemRow) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/tax-report/fixed-cost-items/${item.id}/exclude-month`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ year, month }),
        },
      );
      if (!res.ok) {
        const message = await readApiError(res, "tax_fixed_cost_month_exclude_failed");
        setError(message);
        onError?.(message);
        return;
      }
      onChanged();
    } catch {
      const message = "Falha de rede ao remover valor do mês.";
      setError(message);
      onError?.(message);
    } finally {
      setBusy(false);
    }
  }

  async function endItem(item: TaxFixedCostItemRow) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/tax-report/fixed-cost-items/${item.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ end: { year, month } }),
      });
      if (!res.ok) {
        const message = await readApiError(res, "tax_fixed_cost_item_end_failed");
        setError(message);
        onError?.(message);
        return;
      }
      onChanged();
    } catch {
      const message = "Falha de rede ao encerrar gasto fixo.";
      setError(message);
      onError?.(message);
    } finally {
      setBusy(false);
    }
  }

  function confirmPendingAction() {
    if (!pendingAction) return;
    if (pendingAction.type === "remove-month") {
      void removeMonthValue(pendingAction.item);
    } else {
      void endItem(pendingAction.item);
    }
    setPendingAction(null);
  }

  const monthLabel = monthLabelFor(year, month);
  const visibleItems = items.filter(
    (item) =>
      item.status !== "ended" && (item.recurring || item.amount != null),
  );

  return (
    <>
      <Sheet
        open={open}
        onOpenChange={(next) => {
          if (!next) onClose();
        }}
      >
        <SheetContent className="sm:max-w-xl">
          <SheetHeader>
            <SheetTitle>Custos fixos (crédito PIS/COFINS)</SheetTitle>
            <SheetDescription>
              Editando: {monthLabel}
              <br />
              Gastos como aluguel geram crédito de 9,25% de PIS/COFINS.
            </SheetDescription>
          </SheetHeader>

          <SheetBody className="space-y-3">
            <div className="rounded-lg border border-[var(--border)] bg-[var(--background)] p-3">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--muted-foreground)]">
                Novo gasto fixo — {monthLabel}
              </p>
              <div className="flex flex-wrap items-end gap-3">
                <FormInput
                  label="Nome"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="Ex.: Aluguel"
                  disabled={busy}
                  className="min-w-[10rem] flex-1"
                />
                <MaskedMoneyField
                  id="new-fixed-cost-amount"
                  label={`Valor em ${monthLabel}`}
                  value={newAmount}
                  onValueChange={setNewAmount}
                />
                <div className="flex items-center gap-2 pb-2">
                  <Switch
                    id="new-fixed-cost-recurring"
                    checked={newRecurring}
                    onCheckedChange={setNewRecurring}
                    disabled={busy}
                  />
                  <label
                    htmlFor="new-fixed-cost-recurring"
                    className="text-sm text-[var(--foreground)]"
                  >
                    Repete todo mês
                  </label>
                </div>
                <Button type="button" size="sm" onClick={() => void addItem()} disabled={busy}>
                  <Plus className="size-4" aria-hidden />
                  Adicionar
                </Button>
              </div>
            </div>

            {error ? (
              <p className="text-sm text-rose-600" role="alert">
                {error}
              </p>
            ) : null}

            <ul className="space-y-2">
              {visibleItems.length === 0 ? (
                <li className="rounded-lg border border-dashed border-[var(--border)] p-4 text-center text-sm text-[var(--muted-foreground)]">
                  Nenhum gasto fixo cadastrado.
                </li>
              ) : (
                visibleItems.map((item) => {
                  const isEditing = editingId === item.id;
                  return (
                    <li
                      key={item.id}
                      className="rounded-lg border border-[var(--border)] p-3"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
                          {isEditing ? (
                            <FormInput
                              value={editingName}
                              onChange={(e) => setEditingName(e.target.value)}
                              disabled={busy}
                              className="flex-1"
                            />
                          ) : (
                            <span className="truncate text-sm font-medium">
                              {item.name}
                            </span>
                          )}
                          <Badge variant={item.recurring ? "secondary" : "outline"}>
                            {item.recurring ? "Recorrente" : "Só este mês"}
                          </Badge>
                          {item.amount != null && !item.isExplicit ? (
                            <Badge variant="muted">Herdado</Badge>
                          ) : null}
                          {item.status === "excluded_this_month" ? (
                            <Badge variant="warning">Removido este mês</Badge>
                          ) : null}
                        </div>
                        <div className="flex shrink-0 gap-1">
                          {isEditing ? (
                            <>
                              <Button
                                type="button"
                                size="sm"
                                variant="ghost"
                                disabled={busy}
                                onClick={cancelEdit}
                              >
                                Cancelar
                              </Button>
                              <Button
                                type="button"
                                size="sm"
                                variant="secondary"
                                disabled={busy}
                                onClick={() => void saveEdits(item.id)}
                              >
                                Salvar
                              </Button>
                            </>
                          ) : (
                            <Button
                              type="button"
                              size="icon-sm"
                              variant="ghost"
                              disabled={busy}
                              aria-label={`Editar ${item.name}`}
                              onClick={() => {
                                setEditingId(item.id);
                                setEditingName(item.name);
                                setEditingAmount(item.amount);
                                setEditingRecurring(item.recurring);
                              }}
                            >
                              <Pencil className="size-4" aria-hidden />
                            </Button>
                          )}
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                type="button"
                                size="icon-sm"
                                variant="ghost"
                                disabled={busy}
                                aria-label={`Remover valor de ${item.name} em ${monthLabel}`}
                                onClick={() =>
                                  setPendingAction({ type: "remove-month", item })
                                }
                              >
                                <Eraser className="size-4 text-amber-600" aria-hidden />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>
                              Remover valor deste mês ({monthLabel}) — os outros
                              meses não são afetados.
                            </TooltipContent>
                          </Tooltip>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                type="button"
                                size="icon-sm"
                                variant="ghost"
                                disabled={busy}
                                aria-label={`Encerrar ${item.name}`}
                                onClick={() =>
                                  setPendingAction({ type: "end-item", item })
                                }
                              >
                                <Square className="size-4 text-rose-600" aria-hidden />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>
                              Encerrar gasto fixo a partir de {monthLabel} — meses
                              anteriores continuam normais.
                            </TooltipContent>
                          </Tooltip>
                        </div>
                      </div>

                      <div className="mt-3 flex flex-wrap items-end gap-3">
                        <MaskedMoneyField
                          id={`amount-${item.id}`}
                          label={`Valor em ${monthLabel}`}
                          value={isEditing ? editingAmount : item.amount}
                          onValueChange={setEditingAmount}
                          readOnly={!isEditing}
                        />
                        {isEditing ? (
                          <div className="flex items-center gap-2 pb-2">
                            <Switch
                              id={`recurring-${item.id}`}
                              checked={editingRecurring}
                              onCheckedChange={setEditingRecurring}
                              disabled={busy}
                            />
                            <label
                              htmlFor={`recurring-${item.id}`}
                              className="text-xs text-[var(--muted-foreground)]"
                            >
                              Repete todo mês
                            </label>
                          </div>
                        ) : null}
                      </div>
                    </li>
                  );
                })
              )}
            </ul>
          </SheetBody>

          <SheetFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Fechar
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>

      <AlertDialog
        open={pendingAction != null}
        onOpenChange={(open) => {
          if (!open) setPendingAction(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {pendingAction?.type === "remove-month"
                ? "Remover valor deste mês?"
                : "Encerrar gasto fixo?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {pendingAction?.type === "remove-month"
                ? `Remover o valor de "${pendingAction.item.name}" em ${monthLabel}? Os outros meses não são afetados.`
                : pendingAction
                  ? `Encerrar "${pendingAction.item.name}" a partir de ${monthLabel}? Meses anteriores não são afetados.`
                  : ""}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={confirmPendingAction}
            >
              {pendingAction?.type === "remove-month" ? "Remover" : "Encerrar"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
