"use client";

import { useState } from "react";
import { Pencil, Plus, Trash2 } from "lucide-react";
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
import { FormInput } from "@/components/ui/form-input";
import { Switch } from "@/components/ui/switch";
import {
  Sheet,
  SheetBody,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { readApiError } from "@/lib/api-client-error";
import type { DreCostItemView } from "@/lib/dre/dre-year-data";

export type DreCostSection =
  | "fixed"
  | "operational"
  | "investment"
  | "nonOperationalOut"
  | "nonOperationalIn";

type DreCostItemsModalProps = {
  open: boolean;
  section: DreCostSection;
  title: string;
  description: string;
  costItems: DreCostItemView[];
  onClose: () => void;
  onChanged: () => void;
  onError?: (message: string) => void;
};

export function DreCostItemsModal({
  open,
  section,
  title,
  description,
  costItems,
  onClose,
  onChanged,
  onError,
}: DreCostItemsModalProps) {
  const [newName, setNewName] = useState("");
  const [newRecurring, setNewRecurring] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");
  const [editingRecurring, setEditingRecurring] = useState(true);
  const [pendingDelete, setPendingDelete] = useState<DreCostItemView | null>(
    null,
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function addItem() {
    const name = newName.trim();
    if (!name) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/dre/cost-items", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, section, recurring: newRecurring }),
      });
      if (!res.ok) {
        const message = await readApiError(res, "dre_cost_item_create_failed");
        setError(message);
        onError?.(message);
        return;
      }
      setNewName("");
      setNewRecurring(true);
      onChanged();
    } catch {
      const message = "Falha de rede ao adicionar item.";
      setError(message);
      onError?.(message);
    } finally {
      setBusy(false);
    }
  }

  async function saveEdit(id: string) {
    const name = editingName.trim();
    if (!name) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/dre/cost-items/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, recurring: editingRecurring }),
      });
      if (!res.ok) {
        const message = await readApiError(res, "dre_cost_item_update_failed");
        setError(message);
        onError?.(message);
        return;
      }
      setEditingId(null);
      onChanged();
    } catch {
      const message = "Falha de rede ao atualizar item.";
      setError(message);
      onError?.(message);
    } finally {
      setBusy(false);
    }
  }

  async function confirmRemoveItem() {
    const item = pendingDelete;
    if (!item) return;
    setPendingDelete(null);
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/dre/cost-items/${item.id}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const message = await readApiError(res, "dre_cost_item_delete_failed");
        setError(message);
        onError?.(message);
        return;
      }
      if (editingId === item.id) setEditingId(null);
      onChanged();
    } catch {
      const message = "Falha de rede ao remover item.";
      setError(message);
      onError?.(message);
    } finally {
      setBusy(false);
    }
  }

  const namePlaceholder =
    section === "fixed"
      ? "Ex.: Aluguel"
      : section === "operational"
        ? "Ex.: Embalagens"
        : section === "investment"
          ? "Ex.: Marketing institucional"
          : section === "nonOperationalOut"
            ? "Ex.: Multa, prejuízo com processo"
            : "Ex.: Venda de imobilizado, reembolso";

  return (
    <>
      <Sheet
        open={open}
        onOpenChange={(next) => {
          if (!next) onClose();
        }}
      >
        <SheetContent className="sm:max-w-2xl">
          <SheetHeader>
            <SheetTitle>{title}</SheetTitle>
            <SheetDescription>{description}</SheetDescription>
          </SheetHeader>
          <SheetBody>
            <div className="mb-4 rounded-lg border border-[var(--border)] bg-[var(--muted)]/30 px-4 py-3 text-xs leading-relaxed text-[var(--muted-foreground)]">
              <p>
                <span className="font-medium text-[var(--foreground)]">
                  Passo 1:
                </span>{" "}
                cadastre o nome do item e diga se ele se repete todo mês.
              </p>
              <p className="mt-1">
                <span className="font-medium text-[var(--foreground)]">
                  Passo 2:
                </span>{" "}
                na tabela do DRE, dê dois cliques na célula do mês para
                informar o valor.
              </p>
              <p className="mt-1">
                <span className="font-medium text-[var(--foreground)]">
                  Passo 3:
                </span>{" "}
                {newRecurring
                  ? "se o item for recorrente, o valor se replica automaticamente nos meses seguintes. Você pode alterar qualquer mês com dois cliques — a partir daí a nova série continua."
                  : "se o item não se repete, o valor vale só naquele mês. Os meses seguintes ficam vazios até você informar outro valor."}
              </p>
            </div>

            <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
              <FormInput
                id="dre-cost-new-name"
                label="Nome"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder={namePlaceholder}
                disabled={busy}
                className="min-w-0 flex-1"
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    void addItem();
                  }
                }}
              />
              <div className="flex h-10 shrink-0 items-center gap-2 sm:pb-0.5">
                <Switch
                  id="dre-cost-new-recurring"
                  checked={newRecurring}
                  onCheckedChange={setNewRecurring}
                  disabled={busy}
                />
                <label
                  htmlFor="dre-cost-new-recurring"
                  className="whitespace-nowrap text-sm text-[var(--foreground)]"
                >
                  Repete todo mês
                </label>
              </div>
              <Button
                type="button"
                size="sm"
                className="h-10 shrink-0 sm:w-auto"
                onClick={() => void addItem()}
                disabled={busy}
              >
                <Plus className="size-4" aria-hidden />
                Cadastrar
              </Button>
            </div>

            {error ? (
              <p className="mt-3 text-sm text-rose-600" role="alert">
                {error}
              </p>
            ) : null}

            <div className="mt-5">
              <div className="mb-2 flex items-center justify-between gap-2">
                <p className="text-xs font-semibold uppercase tracking-wide text-[var(--muted-foreground)]">
                  Itens cadastrados
                </p>
                <p className="text-xs text-[var(--muted-foreground)]">
                  {costItems.length}{" "}
                  {costItems.length === 1 ? "item" : "itens"}
                </p>
              </div>
              <ul className="max-h-[min(24rem,50vh)] space-y-2 overflow-y-auto">
                {costItems.length === 0 ? (
                  <li className="rounded-lg border border-dashed border-[var(--border)] px-4 py-6 text-center text-sm text-[var(--muted-foreground)]">
                    Nenhum item cadastrado.
                  </li>
                ) : (
                  costItems.map((item) => {
                    const isEditing = editingId === item.id;
                    return (
                      <li
                        key={item.id}
                        className="rounded-lg border border-[var(--border)] px-4 py-3"
                      >
                        {isEditing ? (
                          <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
                            <FormInput
                              id={`dre-cost-name-${item.id}`}
                              label="Nome"
                              value={editingName}
                              onChange={(e) => setEditingName(e.target.value)}
                              disabled={busy}
                              className="min-w-0 flex-1"
                            />
                            <div className="flex h-10 shrink-0 items-center gap-2">
                              <Switch
                                id={`dre-cost-recurring-${item.id}`}
                                checked={editingRecurring}
                                onCheckedChange={setEditingRecurring}
                                disabled={busy}
                              />
                              <label
                                htmlFor={`dre-cost-recurring-${item.id}`}
                                className="whitespace-nowrap text-sm text-[var(--muted-foreground)]"
                              >
                                Repete todo mês
                              </label>
                            </div>
                            <div className="flex shrink-0 gap-1">
                              <Button
                                type="button"
                                size="sm"
                                variant="secondary"
                                className="h-10"
                                disabled={busy}
                                onClick={() => void saveEdit(item.id)}
                              >
                                Salvar
                              </Button>
                              <Button
                                type="button"
                                size="icon-sm"
                                variant="ghost"
                                className="h-10 w-10"
                                disabled={busy}
                                aria-label={`Remover ${item.name}`}
                                onClick={() => setPendingDelete(item)}
                              >
                                <Trash2
                                  className="size-4 text-rose-600"
                                  aria-hidden
                                />
                              </Button>
                            </div>
                          </div>
                        ) : (
                          <div className="flex items-center gap-3">
                            <span className="min-w-0 flex-1 truncate text-sm font-medium">
                              {item.name}
                            </span>
                            <Badge
                              variant={
                                item.recurring ? "secondary" : "outline"
                              }
                              className="shrink-0"
                            >
                              {item.recurring ? "Recorrente" : "Só no mês"}
                            </Badge>
                            <div className="flex shrink-0 gap-1">
                              <Button
                                type="button"
                                size="icon-sm"
                                variant="ghost"
                                disabled={busy}
                                aria-label={`Editar ${item.name}`}
                                onClick={() => {
                                  setEditingId(item.id);
                                  setEditingName(item.name);
                                  setEditingRecurring(item.recurring);
                                }}
                              >
                                <Pencil className="size-4" aria-hidden />
                              </Button>
                              <Button
                                type="button"
                                size="icon-sm"
                                variant="ghost"
                                disabled={busy}
                                aria-label={`Remover ${item.name}`}
                                onClick={() => setPendingDelete(item)}
                              >
                                <Trash2
                                  className="size-4 text-rose-600"
                                  aria-hidden
                                />
                              </Button>
                            </div>
                          </div>
                        )}
                      </li>
                    );
                  })
                )}
              </ul>
            </div>
          </SheetBody>
          <SheetFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Fechar
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>

      <AlertDialog
        open={pendingDelete !== null}
        onOpenChange={(next) => {
          if (!next) setPendingDelete(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover este item?</AlertDialogTitle>
            <AlertDialogDescription>
              {pendingDelete
                ? `Remover "${pendingDelete.name}"? Ele deixa de aparecer no DRE. Valores já informados nos meses não entram mais no cálculo.`
                : ""}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={busy}
              onClick={() => void confirmRemoveItem()}
            >
              Remover
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

/** @deprecated use DreCostItemsModal */
export const DreFixedCostsModal = DreCostItemsModal;
