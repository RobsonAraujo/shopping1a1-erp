"use client";

import { useState } from "react";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
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

export type DreCostSection = "fixed" | "operational" | "investment";

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
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");
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
        body: JSON.stringify({ name, section }),
      });
      if (!res.ok) {
        const message = await readApiError(res, "dre_cost_item_create_failed");
        setError(message);
        onError?.(message);
        return;
      }
      setNewName("");
      onChanged();
    } catch {
      const message = "Falha de rede ao adicionar item.";
      setError(message);
      onError?.(message);
    } finally {
      setBusy(false);
    }
  }

  async function saveRename(id: string) {
    const name = editingName.trim();
    if (!name) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/dre/cost-items/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
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
      const message = "Falha de rede ao renomear item.";
      setError(message);
      onError?.(message);
    } finally {
      setBusy(false);
    }
  }

  async function removeItem(id: string) {
    if (!window.confirm("Remover este item?")) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/dre/cost-items/${id}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const message = await readApiError(res, "dre_cost_item_delete_failed");
        setError(message);
        onError?.(message);
        return;
      }
      onChanged();
    } catch {
      const message = "Falha de rede ao remover item.";
      setError(message);
      onError?.(message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
    >
      <SheetContent className="sm:max-w-md">
        <SheetHeader>
          <SheetTitle>{title}</SheetTitle>
          <SheetDescription>{description}</SheetDescription>
        </SheetHeader>
        <SheetBody>
          <div className="flex gap-2">
            <input
              type="text"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="Ex.: Embalagens"
              className="h-11 flex-1 rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-base sm:h-10 sm:text-sm"
              disabled={busy}
            />
            <Button type="button" size="sm" onClick={() => void addItem()} disabled={busy}>
              <Plus className="size-4" aria-hidden />
              Adicionar
            </Button>
          </div>

          {error ? (
            <p className="mt-3 text-sm text-rose-600" role="alert">
              {error}
            </p>
          ) : null}

          <ul className="mt-4 max-h-64 space-y-2 overflow-y-auto">
            {costItems.length === 0 ? (
              <li className="text-sm text-[var(--muted-foreground)]">
                Nenhum item cadastrado.
              </li>
            ) : (
              costItems.map((item) => (
                <li
                  key={item.id}
                  className="flex items-center justify-between gap-2 rounded-lg border border-[var(--border)] px-3 py-2"
                >
                  {editingId === item.id ? (
                    <input
                      type="text"
                      value={editingName}
                      onChange={(e) => setEditingName(e.target.value)}
                      className="h-11 flex-1 rounded border border-[var(--border)] bg-[var(--background)] px-2 py-1 text-base sm:h-9 sm:text-sm"
                      disabled={busy}
                    />
                  ) : (
                    <span className="text-sm font-medium">{item.name}</span>
                  )}
                  <div className="flex shrink-0 gap-1">
                    {editingId === item.id ? (
                      <Button
                        type="button"
                        size="sm"
                        variant="secondary"
                        disabled={busy}
                        onClick={() => void saveRename(item.id)}
                      >
                        Salvar
                      </Button>
                    ) : (
                      <Button
                        type="button"
                        size="icon-sm"
                        variant="ghost"
                        disabled={busy}
                        aria-label={`Renomear ${item.name}`}
                        onClick={() => {
                          setEditingId(item.id);
                          setEditingName(item.name);
                        }}
                      >
                        <Pencil className="size-4" aria-hidden />
                      </Button>
                    )}
                    <Button
                      type="button"
                      size="icon-sm"
                      variant="ghost"
                      disabled={busy}
                      aria-label={`Remover ${item.name}`}
                      onClick={() => void removeItem(item.id)}
                    >
                      <Trash2 className="size-4 text-rose-600" aria-hidden />
                    </Button>
                  </div>
                </li>
              ))
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
  );
}

/** @deprecated use DreCostItemsModal */
export const DreFixedCostsModal = DreCostItemsModal;
