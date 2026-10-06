"use client";

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import {
  ArrowDownToLine,
  Check,
  Eraser,
  FileSpreadsheet,
  Pencil,
  Plus,
  Square,
} from "lucide-react";
import { toast } from "sonner";
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
import { formatFinancialMoney } from "@/lib/pricing/financial-margin";
import { FIXED_COST_CREDIT_RATE } from "@/lib/tax-report/fixed-cost-credit";
import type { DreFixedCostSuggestion } from "@/lib/tax-report/dre-fixed-cost-import";
import { cn } from "@/lib/utils";

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

function SectionTitle({
  children,
  aside,
}: {
  children: ReactNode;
  aside?: ReactNode;
}) {
  return (
    <div className="mb-2 flex items-center justify-between gap-2">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-[var(--muted-foreground)]">
        {children}
      </h3>
      {aside}
    </div>
  );
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
  const [dreItems, setDreItems] = useState<DreFixedCostSuggestion[]>([]);
  const [dreSelected, setDreSelected] = useState<Set<string>>(new Set());

  const loadDreItems = useCallback(async () => {
    try {
      const res = await fetch(
        `/api/tax-report/dre-fixed-costs?year=${year}&month=${month}`,
      );
      if (!res.ok) return;
      const data = (await res.json()) as { items: DreFixedCostSuggestion[] };
      setDreItems(data.items);
      setDreSelected(new Set());
    } catch {
      // silencioso — a sugestão do DRE é só um atalho de cadastro
    }
  }, [year, month]);

  useEffect(() => {
    if (open) void loadDreItems();
  }, [open, loadDreItems]);

  function notifyChanged() {
    onChanged();
    void loadDreItems();
  }

  function toggleDreItem(id: string) {
    setDreSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function importDreSelection() {
    if (dreSelected.size === 0) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/tax-report/dre-fixed-costs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          year,
          month,
          dreCostItemIds: [...dreSelected],
        }),
      });
      if (!res.ok) {
        const message = await readApiError(res, "tax_dre_fixed_costs_import_failed");
        setError(message);
        onError?.(message);
        return;
      }
      const { created } = (await res.json()) as { created: number };
      notifyChanged();
      toast.success(
        created === 1
          ? "1 custo do DRE incluído no crédito."
          : `${created} custos do DRE incluídos no crédito.`,
      );
    } catch {
      const message = "Falha de rede ao importar custos do DRE.";
      setError(message);
      onError?.(message);
    } finally {
      setBusy(false);
    }
  }

  async function syncAmountFromDre(item: DreFixedCostSuggestion) {
    if (!item.taxItemId) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/tax-report/fixed-cost-values", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          costItemId: item.taxItemId,
          year,
          month,
          amount: item.amount,
        }),
      });
      if (!res.ok) {
        const message = await readApiError(res, "tax_fixed_cost_item_update_failed");
        setError(message);
        onError?.(message);
        return;
      }
      notifyChanged();
      toast.success(`Valor de "${item.name}" atualizado com o DRE.`);
    } catch {
      const message = "Falha de rede ao atualizar valor.";
      setError(message);
      onError?.(message);
    } finally {
      setBusy(false);
    }
  }

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
      notifyChanged();
      toast.success("Gasto fixo adicionado.");
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
      notifyChanged();
      toast.success("Gasto fixo atualizado.");
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
      notifyChanged();
      toast.success("Valor do mês removido.");
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
      notifyChanged();
      toast.success("Gasto fixo encerrado.");
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
  const creditBase = visibleItems
    .filter((item) => item.status === "normal")
    .reduce((sum, item) => sum + (item.amount ?? 0), 0);
  const pendingDreItems = dreItems.filter((item) => item.taxItemId == null);
  const divergentDreItems = dreItems.filter(
    (item) =>
      item.taxItemId != null &&
      item.taxAmount != null &&
      Math.abs(item.taxAmount - item.amount) >= 0.01,
  );
  const dreLinkedTaxIds = useMemo(
    () =>
      new Set(
        dreItems.flatMap((item) => (item.taxItemId ? [item.taxItemId] : [])),
      ),
    [dreItems],
  );
  const selectedTotal = pendingDreItems
    .filter((item) => dreSelected.has(item.dreCostItemId))
    .reduce((sum, item) => sum + item.amount, 0);

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
            <SheetTitle>Custos fixos com crédito</SheetTitle>
            <SheetDescription>
              {monthLabel} · despesas como aluguel e energia geram crédito de
              9,25% de PIS/COFINS no regime não-cumulativo.
            </SheetDescription>
          </SheetHeader>

          <SheetBody className="space-y-5">
            <div className="grid grid-cols-2 gap-2">
              <div className="rounded-xl border border-[var(--border)] bg-[var(--muted)]/30 p-3">
                <p className="text-xs text-[var(--muted-foreground)]">Base do mês</p>
                <p className="mt-0.5 text-lg font-semibold tabular-nums">
                  {formatFinancialMoney(creditBase)}
                </p>
              </div>
              <div className="rounded-xl border border-emerald-200/80 bg-emerald-50/70 p-3 dark:border-emerald-900/60 dark:bg-emerald-950/30">
                <p className="text-xs text-emerald-800 dark:text-emerald-300">
                  Crédito estimado (9,25%)
                </p>
                <p className="mt-0.5 text-lg font-semibold tabular-nums text-emerald-800 dark:text-emerald-300">
                  {formatFinancialMoney(creditBase * FIXED_COST_CREDIT_RATE)}
                </p>
              </div>
            </div>

            {pendingDreItems.length > 0 || divergentDreItems.length > 0 ? (
              <section>
                <SectionTitle
                  aside={
                    <span className="inline-flex items-center gap-1 text-xs text-[var(--muted-foreground)]">
                      <FileSpreadsheet className="size-3.5" aria-hidden />
                      Custos fixos do DRE
                    </span>
                  }
                >
                  Trazer do DRE
                </SectionTitle>
                <p className="mb-2 text-xs text-[var(--muted-foreground)]">
                  Você já lançou estes custos no DRE. Marque só os que geram
                  crédito — aluguel, energia e depreciação, por exemplo, sim;
                  salários e pró-labore, não.
                </p>
                <ul className="space-y-1.5">
                  {pendingDreItems.map((item) => {
                    const checked = dreSelected.has(item.dreCostItemId);
                    return (
                      <li key={item.dreCostItemId}>
                        <button
                          type="button"
                          role="checkbox"
                          aria-checked={checked}
                          disabled={busy}
                          onClick={() => toggleDreItem(item.dreCostItemId)}
                          className={cn(
                            "flex w-full cursor-pointer items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-60",
                            checked
                              ? "border-[var(--primary)]/50 bg-[var(--primary)]/[0.06]"
                              : "border-[var(--border)] hover:bg-[var(--muted)]/40",
                          )}
                        >
                          <span
                            className={cn(
                              "flex size-4 shrink-0 items-center justify-center rounded border",
                              checked
                                ? "border-[var(--primary)] bg-[var(--primary)] text-[var(--primary-foreground)]"
                                : "border-[var(--border)] bg-[var(--background)]",
                            )}
                            aria-hidden
                          >
                            {checked ? <Check className="size-3" /> : null}
                          </span>
                          <span className="min-w-0 flex-1 truncate text-sm font-medium">
                            {item.name}
                          </span>
                          {!item.recurring ? (
                            <Badge variant="outline">Só este mês</Badge>
                          ) : null}
                          <span className="text-sm tabular-nums">
                            {formatFinancialMoney(item.amount)}
                          </span>
                        </button>
                      </li>
                    );
                  })}
                  {divergentDreItems.map((item) => (
                    <li
                      key={item.dreCostItemId}
                      className="flex flex-wrap items-center gap-2 rounded-xl border border-amber-200/80 bg-amber-50/60 px-3 py-2.5 text-sm dark:border-amber-900/60 dark:bg-amber-950/30"
                    >
                      <span className="min-w-0 flex-1">
                        <span className="font-medium">{item.name}</span>
                        <span className="block text-xs text-amber-900/85 dark:text-amber-200/85">
                          Aqui {formatFinancialMoney(item.taxAmount ?? 0)} · no
                          DRE {formatFinancialMoney(item.amount)}
                        </span>
                      </span>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        disabled={busy}
                        onClick={() => void syncAmountFromDre(item)}
                      >
                        Usar valor do DRE
                      </Button>
                    </li>
                  ))}
                </ul>
                {pendingDreItems.length > 0 ? (
                  <div className="mt-2 flex items-center justify-between gap-2">
                    <p className="text-xs text-[var(--muted-foreground)]">
                      {dreSelected.size > 0
                        ? `${dreSelected.size} selecionado${dreSelected.size === 1 ? "" : "s"} · ${formatFinancialMoney(selectedTotal)}`
                        : "Nenhum selecionado"}
                    </p>
                    <Button
                      type="button"
                      size="sm"
                      disabled={busy || dreSelected.size === 0}
                      onClick={() => void importDreSelection()}
                    >
                      <ArrowDownToLine className="size-4" aria-hidden />
                      Incluir no crédito
                    </Button>
                  </div>
                ) : null}
              </section>
            ) : null}

            {error ? (
              <p className="text-sm text-rose-600" role="alert">
                {error}
              </p>
            ) : null}

            <section>
              <SectionTitle>
                Incluídos no crédito{visibleItems.length > 0 ? ` (${visibleItems.length})` : ""}
              </SectionTitle>
            <ul className="space-y-2">
              {visibleItems.length === 0 ? (
                <li className="rounded-xl border border-dashed border-[var(--border)] p-5 text-center text-sm text-[var(--muted-foreground)]">
                  Nenhum custo fixo com crédito em {monthLabel}.
                  {pendingDreItems.length > 0
                    ? " Selecione acima os que vêm do DRE ou cadastre manualmente."
                    : " Cadastre abaixo despesas como aluguel e energia."}
                </li>
              ) : (
                visibleItems.map((item) => {
                  const isEditing = editingId === item.id;
                  return (
                    <li
                      key={item.id}
                      className={cn(
                        "rounded-xl border border-[var(--border)] bg-[var(--card)] p-3",
                        item.status === "excluded_this_month" && "opacity-70",
                      )}
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
                          {!isEditing && dreLinkedTaxIds.has(item.id) ? (
                            <Badge variant="muted">DRE</Badge>
                          ) : null}
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
            </section>

            <section className="rounded-xl border border-dashed border-[var(--border)] p-3">
              <SectionTitle>Adicionar manualmente</SectionTitle>
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
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  onClick={() => void addItem()}
                  disabled={busy || !newName.trim()}
                >
                  <Plus className="size-4" aria-hidden />
                  Adicionar
                </Button>
              </div>
            </section>
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
