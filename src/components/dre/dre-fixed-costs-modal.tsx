"use client";

import { useCallback, useEffect, useId, useState } from "react";
import { Pencil, Plus, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
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
  const titleId = useId();
  const [newName, setNewName] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const handleBackdrop = useCallback(
    (e: React.MouseEvent) => {
      if (e.target === e.currentTarget) onClose();
    },
    [onClose],
  );

  if (!open) return null;

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
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={handleBackdrop}
      role="presentation"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="w-full max-w-md rounded-xl border border-[var(--border)] bg-[var(--card)] p-5 shadow-xl"
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 id={titleId} className="text-lg font-semibold text-[var(--primary)]">
              {title}
            </h2>
            <p className="mt-1 text-sm text-[var(--muted-foreground)]">
              {description}
            </p>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            onClick={onClose}
            aria-label="Fechar"
          >
            <X className="size-4" aria-hidden />
          </Button>
        </div>

        <div className="mt-4 flex gap-2">
          <input
            type="text"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="Ex.: Embalagens"
            className="flex-1 rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm"
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
                    className="flex-1 rounded border border-[var(--border)] bg-[var(--background)] px-2 py-1 text-sm"
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

        <div className="mt-5 flex justify-end">
          <Button type="button" variant="outline" onClick={onClose}>
            Fechar
          </Button>
        </div>
      </div>
    </div>
  );
}

/** @deprecated use DreCostItemsModal */
export const DreFixedCostsModal = DreCostItemsModal;
