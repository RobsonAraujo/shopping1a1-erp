"use client";

import Image from "next/image";
import { useCallback, useEffect, useId, useMemo, useState } from "react";
import { useApiResource } from "@/hooks/use-api-resource";
import { ImageOff, Pencil, Plus, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { FormInput } from "@/components/ui/form-input";
import { Popover, PopoverAnchor, PopoverContent } from "@/components/ui/popover";
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
import { readApiError } from "@/lib/api-client-error";
import { cn } from "@/lib/utils";
import type { KitCandidate } from "@/app/api/kits/candidates/route";

export type KitItemRow = { sku: string; quantity: number };
export type KitRow = {
  mlItemId: string;
  title: string | null;
  items: KitItemRow[];
};

type KitsModalProps = {
  open: boolean;
  onClose: () => void;
};

type FormItemRow = { sku: string; quantity: string };

function emptyFormItems(): FormItemRow[] {
  return [{ sku: "", quantity: "1" }];
}

type SkuComboboxFieldProps = {
  value: string;
  onValueChange: (value: string) => void;
  options: string[];
  disabled?: boolean;
  className?: string;
};

function SkuComboboxField({
  value,
  onValueChange,
  options,
  disabled,
  className,
}: SkuComboboxFieldProps) {
  const [open, setOpen] = useState(false);
  const query = value.trim().toLowerCase();
  const filtered = query
    ? options.filter((sku) => sku.toLowerCase().includes(query)).slice(0, 20)
    : options.slice(0, 20);

  return (
    <Popover open={open && filtered.length > 0} onOpenChange={setOpen}>
      <PopoverAnchor asChild>
        <FormInput
          label="SKU"
          value={value}
          onChange={(e) => {
            onValueChange(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          disabled={disabled}
          autoComplete="off"
          placeholder="Buscar SKU cadastrado…"
          className={className}
        />
      </PopoverAnchor>
      <PopoverContent
        align="start"
        sideOffset={4}
        className="w-[var(--radix-popover-trigger-width)] max-w-none p-0"
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        <ul className="max-h-48 overflow-y-auto py-1">
          {filtered.map((sku) => (
            <li key={sku}>
              <button
                type="button"
                className="block w-full cursor-pointer truncate px-3 py-1.5 text-left text-sm hover:bg-[var(--accent)]/40"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  onValueChange(sku);
                  setOpen(false);
                }}
              >
                {sku}
              </button>
            </li>
          ))}
        </ul>
      </PopoverContent>
    </Popover>
  );
}

export function KitsModal({ open, onClose }: KitsModalProps) {
  const titleId = useId();
  const [kits, setKits] = useState<KitRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [candidates, setCandidates] = useState<KitCandidate[]>([]);
  const [candidatesLoading, setCandidatesLoading] = useState(false);
  const [candidatesError, setCandidatesError] = useState<string | null>(null);

  const productsResource = useApiResource<{ products: { sku: string }[] }>(
    "/api/products",
    { enabled: open, fallbackError: "products_load_failed" },
  );
  const productSkus = useMemo(
    () =>
      (productsResource.data?.products ?? [])
        .map((p) => p.sku)
        .sort((a, b) => a.localeCompare(b, "pt-BR")),
    [productsResource.data],
  );

  const [editingMlItemId, setEditingMlItemId] = useState<string | null>(null);
  const [mlItemId, setMlItemId] = useState("");
  const [title, setTitle] = useState("");
  const [formItems, setFormItems] = useState<FormItemRow[]>(emptyFormItems());
  const [pendingDelete, setPendingDelete] = useState<KitRow | null>(null);

  const loadKits = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/kits");
      if (!res.ok) throw new Error(await readApiError(res, "Falha ao carregar kits."));
      const data = (await res.json()) as { kits: KitRow[] };
      setKits(data.kits);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha ao carregar kits.");
    } finally {
      setLoading(false);
    }
  }, []);

  const loadCandidates = useCallback(async () => {
    setCandidatesLoading(true);
    setCandidatesError(null);
    try {
      const res = await fetch("/api/kits/candidates");
      if (!res.ok) {
        throw new Error(
          await readApiError(res, "Falha ao carregar anúncios-kit do Mercado Livre."),
        );
      }
      const data = (await res.json()) as { candidates: KitCandidate[] };
      setCandidates(data.candidates);
    } catch (e) {
      setCandidatesError(
        e instanceof Error ? e.message : "Falha ao carregar anúncios-kit do Mercado Livre.",
      );
    } finally {
      setCandidatesLoading(false);
    }
  }, []);

  useEffect(() => {
    if (open) {
      void loadKits();
      void loadCandidates();
    }
  }, [open, loadKits, loadCandidates]);

  function resetForm() {
    setEditingMlItemId(null);
    setMlItemId("");
    setTitle("");
    setFormItems(emptyFormItems());
  }

  function selectCandidate(candidate: KitCandidate) {
    setEditingMlItemId(null);
    setMlItemId(candidate.mlItemId);
    setTitle(candidate.title);
    setFormItems(emptyFormItems());
  }

  function startEdit(kit: KitRow) {
    setEditingMlItemId(kit.mlItemId);
    setMlItemId(kit.mlItemId);
    setTitle(kit.title ?? "");
    setFormItems(
      kit.items.length > 0
        ? kit.items.map((item) => ({
            sku: item.sku,
            quantity: String(item.quantity),
          }))
        : emptyFormItems(),
    );
  }

  function updateFormItem(index: number, patch: Partial<FormItemRow>) {
    setFormItems((prev) =>
      prev.map((row, i) => (i === index ? { ...row, ...patch } : row)),
    );
  }

  function addFormItem() {
    setFormItems((prev) => [...prev, { sku: "", quantity: "1" }]);
  }

  function removeFormItem(index: number) {
    setFormItems((prev) => prev.filter((_, i) => i !== index));
  }

  async function saveKit() {
    setError(null);
    const items = formItems
      .map((row) => ({ sku: row.sku.trim(), quantity: Number(row.quantity) }))
      .filter((row) => row.sku && Number.isFinite(row.quantity) && row.quantity > 0);

    if (!mlItemId.trim() || items.length === 0) {
      setError("Informe o ID do anúncio e ao menos um SKU componente com quantidade válida.");
      return;
    }

    setBusy(true);
    try {
      const isEditing = editingMlItemId !== null;
      const res = await fetch(
        isEditing ? `/api/kits/${encodeURIComponent(editingMlItemId!)}` : "/api/kits",
        {
          method: isEditing ? "PUT" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            mlItemId: mlItemId.trim(),
            title: title.trim() || null,
            items,
          }),
        },
      );
      if (!res.ok) throw new Error(await readApiError(res, "Falha ao salvar kit."));
      resetForm();
      await Promise.all([loadKits(), loadCandidates()]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha ao salvar kit.");
    } finally {
      setBusy(false);
    }
  }

  async function confirmDelete() {
    if (!pendingDelete) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/kits/${encodeURIComponent(pendingDelete.mlItemId)}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error(await readApiError(res, "Falha ao excluir kit."));
      setPendingDelete(null);
      if (editingMlItemId === pendingDelete.mlItemId) resetForm();
      await Promise.all([loadKits(), loadCandidates()]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha ao excluir kit.");
    } finally {
      setBusy(false);
    }
  }

  function handleBackdrop(e: React.MouseEvent<HTMLDivElement>) {
    if (e.target === e.currentTarget) onClose();
  }

  if (!open) return null;

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
        className="flex max-h-[90vh] w-full max-w-2xl flex-col rounded-xl border border-[var(--border)] bg-[var(--card)] shadow-xl"
      >
        <div className="flex items-start justify-between gap-3 border-b border-[var(--border)] p-5">
          <div>
            <h2 id={titleId} className="text-lg font-semibold text-[var(--primary)]">
              Kits sem SKU
            </h2>
            <p className="mt-1 text-xs text-[var(--muted-foreground)]">
              Anúncios &quot;kit&quot; do Mercado Livre não têm SKU próprio. Cadastre aqui os
              SKUs componentes para que Lucratividade calcule o custo/imposto certo.
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

        <div className="space-y-3 overflow-y-auto p-5">
          <div className="rounded-lg border border-[var(--border)] bg-[var(--background)] p-3">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--muted-foreground)]">
              Seus anúncios-kit sem cadastro
            </p>
            {candidatesError ? (
              <p className="text-sm text-rose-600" role="alert">
                {candidatesError}
              </p>
            ) : candidatesLoading ? (
              <p className="text-sm text-[var(--muted-foreground)]">Buscando anúncios…</p>
            ) : candidates.length === 0 ? (
              <p className="text-sm text-[var(--muted-foreground)]">
                Nenhum anúncio-kit sem cadastro encontrado no momento.
              </p>
            ) : (
              <div className="flex max-h-40 flex-col gap-1 overflow-y-auto">
                {candidates.map((candidate) => (
                  <button
                    key={candidate.mlItemId}
                    type="button"
                    disabled={busy}
                    onClick={() => selectCandidate(candidate)}
                    className={cn(
                      "flex cursor-pointer items-center gap-2 rounded-lg border p-2 text-left text-sm transition-colors hover:bg-[var(--accent)]/40",
                      mlItemId === candidate.mlItemId && editingMlItemId === null
                        ? "border-[var(--primary)] bg-[var(--accent)]/30"
                        : "border-[var(--border)]",
                    )}
                  >
                    {candidate.imageUrl ? (
                      <Image
                        src={candidate.imageUrl}
                        alt={candidate.title}
                        width={32}
                        height={32}
                        className="size-8 shrink-0 rounded-md object-cover"
                      />
                    ) : (
                      <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-[var(--muted)] text-[var(--muted-foreground)]">
                        <ImageOff className="size-4" aria-hidden />
                      </span>
                    )}
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium">{candidate.title}</span>
                      <span className="block truncate text-xs text-[var(--muted-foreground)]">
                        {candidate.mlItemId}
                      </span>
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="rounded-lg border border-[var(--border)] bg-[var(--background)] p-3">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--muted-foreground)]">
              {editingMlItemId ? `Editando kit ${editingMlItemId}` : "Novo kit"}
            </p>
            <div className="flex flex-wrap items-end gap-3">
              <FormInput
                label="ID do anúncio (ex.: MLB1234567890)"
                value={mlItemId}
                onChange={(e) => setMlItemId(e.target.value)}
                disabled={busy || editingMlItemId !== null}
                className="min-w-[14rem] flex-1"
              />
              <FormInput
                label="Título (opcional)"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                disabled={busy}
                className="min-w-[14rem] flex-1"
              />
            </div>

            <p className="mt-3 mb-1 text-xs font-medium text-[var(--muted-foreground)]">
              SKUs componentes
            </p>
            <div className="space-y-2">
              {formItems.map((row, index) => (
                <div key={index} className="flex flex-wrap items-end gap-2">
                  <SkuComboboxField
                    value={row.sku}
                    onValueChange={(sku) => updateFormItem(index, { sku })}
                    options={productSkus}
                    disabled={busy}
                    className="min-w-[10rem] flex-1"
                  />
                  <FormInput
                    label="Quantidade"
                    type="number"
                    value={row.quantity}
                    onChange={(e) => updateFormItem(index, { quantity: e.target.value })}
                    disabled={busy}
                    className="w-24"
                  />
                  <Button
                    type="button"
                    size="icon-sm"
                    variant="ghost"
                    disabled={busy || formItems.length === 1}
                    aria-label="Remover SKU"
                    onClick={() => removeFormItem(index)}
                  >
                    <Trash2 className="size-4" aria-hidden />
                  </Button>
                </div>
              ))}
            </div>

            <div className="mt-3 flex flex-wrap gap-2">
              <Button type="button" size="sm" variant="outline" disabled={busy} onClick={addFormItem}>
                <Plus className="size-4" aria-hidden />
                Adicionar SKU
              </Button>
              <Button type="button" size="sm" disabled={busy} onClick={() => void saveKit()}>
                {editingMlItemId ? "Salvar alterações" : "Cadastrar kit"}
              </Button>
              {editingMlItemId ? (
                <Button type="button" size="sm" variant="ghost" disabled={busy} onClick={resetForm}>
                  Cancelar edição
                </Button>
              ) : null}
            </div>
          </div>

          {error ? (
            <p className="text-sm text-rose-600" role="alert">
              {error}
            </p>
          ) : null}

          <ul className="space-y-2">
            {loading ? (
              <li className="rounded-lg border border-dashed border-[var(--border)] p-4 text-center text-sm text-[var(--muted-foreground)]">
                Carregando…
              </li>
            ) : kits.length === 0 ? (
              <li className="rounded-lg border border-dashed border-[var(--border)] p-4 text-center text-sm text-[var(--muted-foreground)]">
                Nenhum kit cadastrado.
              </li>
            ) : (
              kits.map((kit) => (
                <li key={kit.mlItemId} className="rounded-lg border border-[var(--border)] p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">
                        {kit.title ?? kit.mlItemId}
                      </p>
                      {kit.title ? (
                        <p className="truncate text-xs text-[var(--muted-foreground)]">
                          {kit.mlItemId}
                        </p>
                      ) : null}
                    </div>
                    <div className="flex shrink-0 gap-1">
                      <Button
                        type="button"
                        size="icon-sm"
                        variant="ghost"
                        disabled={busy}
                        aria-label={`Editar kit ${kit.mlItemId}`}
                        onClick={() => startEdit(kit)}
                      >
                        <Pencil className="size-4" aria-hidden />
                      </Button>
                      <Button
                        type="button"
                        size="icon-sm"
                        variant="ghost"
                        disabled={busy}
                        aria-label={`Excluir kit ${kit.mlItemId}`}
                        onClick={() => setPendingDelete(kit)}
                      >
                        <Trash2 className="size-4 text-rose-600" aria-hidden />
                      </Button>
                    </div>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {kit.items.map((item) => (
                      <Badge key={item.sku} variant="secondary">
                        {item.sku} × {item.quantity}
                      </Badge>
                    ))}
                  </div>
                </li>
              ))
            )}
          </ul>
        </div>

        <div className="flex justify-end border-t border-[var(--border)] p-4">
          <Button type="button" variant="outline" onClick={onClose}>
            Fechar
          </Button>
        </div>
      </div>

      <AlertDialog
        open={pendingDelete != null}
        onOpenChange={(nextOpen) => {
          if (!nextOpen) setPendingDelete(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir kit?</AlertDialogTitle>
            <AlertDialogDescription>
              {pendingDelete
                ? `Excluir a composição cadastrada para "${pendingDelete.title ?? pendingDelete.mlItemId}"? O anúncio volta a aparecer em Lucratividade sem custo/imposto calculado.`
                : ""}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={() => void confirmDelete()}>
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
