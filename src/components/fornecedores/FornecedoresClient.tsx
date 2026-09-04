"use client";

import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import Image from "next/image";
import { ChevronDown, ChevronRight, Pencil, Plus, Trash2 } from "lucide-react";
import { DndContext, DragOverlay, type DragEndEvent, type DragStartEvent } from "@dnd-kit/core";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { FormInput } from "@/components/ui/form-input";
import { Switch } from "@/components/ui/switch";
import {
  Sheet,
  SheetBody,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetTitle,
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
import { ItemListSearch, itemListSearchEmptyMessage } from "@/components/shared/ItemListSearch";
import { ChipVisual, DraggableChip } from "@/components/shared/DraggableChip";
import { UserFeedback } from "@/components/ui/user-feedback";
import { filterByItemListSearch } from "@/lib/item-list-search";
import { readApiError } from "@/lib/api/api-client-error";
import { useDndSensors } from "@/hooks/use-dnd-sensors";
import { useDropHighlight } from "@/hooks/use-drop-highlight";
import { cn } from "@/lib/utils";

export type SupplierRow = {
  id: string;
  name: string;
  active: boolean;
  productCount: number;
};

/** Sentinela de id pro drop-target da caixa "sem fornecedor" — nunca colide
 * com um id real de fornecedor (cuid). */
const UNASSIGNED_DROP_ID = "unassigned";

type UnassignedProduct = { mlItemId: string; sku: string | null; imageUrl: string | null };
type AssignedProduct = { mlItemId: string; sku: string | null; supplierId: string };
type DraggedProduct = UnassignedProduct | Pick<AssignedProduct, "mlItemId" | "sku">;

type FormState = { name: string; active: boolean };

function emptyForm(): FormState {
  return { name: "", active: true };
}

function ProductChipLabel({ product }: { product: DraggedProduct }) {
  return (
    <>
      {"imageUrl" in product && product.imageUrl ? (
        <Image
          src={product.imageUrl}
          alt=""
          width={20}
          height={20}
          className="size-5 shrink-0 rounded object-cover"
        />
      ) : null}
      {product.sku ?? product.mlItemId}
    </>
  );
}

function DroppableSupplierRow({
  supplier,
  children,
}: {
  supplier: SupplierRow;
  children: React.ReactNode;
}) {
  const { setNodeRef, className } = useDropHighlight(supplier.id);
  return (
    <tr ref={setNodeRef} className={cn("border-b border-[var(--border)] last:border-0", className)}>
      {children}
    </tr>
  );
}

function DroppableUnassignedTray({ children }: { children: React.ReactNode }) {
  const { setNodeRef, className } = useDropHighlight(UNASSIGNED_DROP_ID);
  return (
    <div ref={setNodeRef} className={cn("flex max-h-40 flex-wrap gap-2 overflow-y-auto rounded-lg p-1", className)}>
      {children}
    </div>
  );
}

export function FornecedoresClient() {
  const [suppliers, setSuppliers] = useState<SupplierRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [modal, setModal] = useState<
    { mode: "create"; form: FormState } | { mode: "edit"; id: string; form: FormState } | null
  >(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [pendingDeactivate, setPendingDeactivate] = useState<SupplierRow | null>(null);
  const [unassignedProducts, setUnassignedProducts] = useState<UnassignedProduct[]>([]);
  const [loadingUnassigned, setLoadingUnassigned] = useState(true);
  const [assignedProducts, setAssignedProducts] = useState<AssignedProduct[]>([]);
  const [assignError, setAssignError] = useState<string | null>(null);
  const [productSearchQuery, setProductSearchQuery] = useState("");
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [activeDragId, setActiveDragId] = useState<string | null>(null);
  const sensors = useDndSensors();

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/suppliers");
      if (!res.ok) {
        setError(await readApiError(res, "suppliers_load_failed"));
        return;
      }
      const json = (await res.json()) as { suppliers: SupplierRow[] };
      setSuppliers(json.suppliers);
    } catch {
      setError("Falha de rede ao carregar fornecedores.");
    } finally {
      setLoading(false);
    }
  }, []);

  const loadUnassigned = useCallback(async () => {
    setLoadingUnassigned(true);
    try {
      const res = await fetch("/api/products/unassigned");
      if (!res.ok) {
        setAssignError(await readApiError(res, "unassigned_products_load_failed"));
        return;
      }
      const json = (await res.json()) as { products: UnassignedProduct[] };
      setUnassignedProducts(json.products);
    } catch {
      setAssignError("Falha de rede ao carregar produtos sem fornecedor.");
    } finally {
      setLoadingUnassigned(false);
    }
  }, []);

  const loadAssigned = useCallback(async () => {
    try {
      const res = await fetch("/api/products/assigned");
      if (!res.ok) {
        setAssignError(await readApiError(res, "assigned_products_load_failed"));
        return;
      }
      const json = (await res.json()) as { products: AssignedProduct[] };
      setAssignedProducts(json.products);
    } catch {
      setAssignError("Falha de rede ao carregar produtos vinculados.");
    }
  }, []);

  useEffect(() => {
    void load();
    void loadUnassigned();
    void loadAssigned();
  }, [load, loadUnassigned, loadAssigned]);

  const assignedBySupplierId = useMemo(() => {
    const map = new Map<string, AssignedProduct[]>();
    for (const product of assignedProducts) {
      const list = map.get(product.supplierId) ?? [];
      list.push(product);
      map.set(product.supplierId, list);
    }
    return map;
  }, [assignedProducts]);

  const activeDragProduct = useMemo<DraggedProduct | null>(() => {
    if (!activeDragId) return null;
    return (
      unassignedProducts.find((p) => p.mlItemId === activeDragId) ??
      assignedProducts.find((p) => p.mlItemId === activeDragId) ??
      null
    );
  }, [activeDragId, unassignedProducts, assignedProducts]);

  function toggleExpanded(supplierId: string) {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(supplierId)) next.delete(supplierId);
      else next.add(supplierId);
      return next;
    });
  }

  function locateProduct(
    mlItemId: string,
  ): { supplierId: string | null; product: { mlItemId: string; sku: string | null } } | null {
    const unassigned = unassignedProducts.find((p) => p.mlItemId === mlItemId);
    if (unassigned) return { supplierId: null, product: unassigned };
    const assigned = assignedProducts.find((p) => p.mlItemId === mlItemId);
    if (assigned) return { supplierId: assigned.supplierId, product: assigned };
    return null;
  }

  /** Move o produto (nas listas locais) de `fromSupplierId` pra
   * `toSupplierId` (`null` = caixa de "sem fornecedor"). Chamada tanto pra
   * aplicar o drop otimista quanto, com os parâmetros invertidos, pra
   * desfazer se a chamada à API falhar. */
  function applyMove(
    product: { mlItemId: string; sku: string | null },
    fromSupplierId: string | null,
    toSupplierId: string | null,
  ) {
    if (fromSupplierId === null) {
      setUnassignedProducts((prev) => prev.filter((p) => p.mlItemId !== product.mlItemId));
    } else {
      setAssignedProducts((prev) => prev.filter((p) => p.mlItemId !== product.mlItemId));
      setSuppliers((prev) =>
        prev.map((s) =>
          s.id === fromSupplierId ? { ...s, productCount: Math.max(0, s.productCount - 1) } : s,
        ),
      );
    }

    if (toSupplierId === null) {
      setUnassignedProducts((prev) => [...prev, { ...product, imageUrl: null }]);
    } else {
      setAssignedProducts((prev) => [...prev, { ...product, supplierId: toSupplierId }]);
      setSuppliers((prev) =>
        prev.map((s) => (s.id === toSupplierId ? { ...s, productCount: s.productCount + 1 } : s)),
      );
    }
  }

  function handleDragStart(event: DragStartEvent) {
    setActiveDragId(String(event.active.id));
  }

  async function handleDragEnd(event: DragEndEvent) {
    setActiveDragId(null);
    const mlItemId = String(event.active.id);
    const overId = event.over?.id ? String(event.over.id) : null;
    if (!overId) return;
    const targetSupplierId = overId === UNASSIGNED_DROP_ID ? null : overId;

    const location = locateProduct(mlItemId);
    if (!location || location.supplierId === targetSupplierId) return;
    const { product, supplierId: sourceSupplierId } = location;

    setAssignError(null);
    applyMove(product, sourceSupplierId, targetSupplierId);

    try {
      const res = await fetch(`/api/products/${encodeURIComponent(mlItemId)}/supplier`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ supplierId: targetSupplierId }),
      });
      if (!res.ok) {
        setAssignError(await readApiError(res, "product_supplier_update_failed"));
        applyMove(product, targetSupplierId, sourceSupplierId);
      }
    } catch {
      setAssignError("Falha de rede ao vincular o produto.");
      applyMove(product, targetSupplierId, sourceSupplierId);
    }
  }

  const filteredUnassignedProducts = useMemo(
    () =>
      filterByItemListSearch(unassignedProducts, productSearchQuery, (product) => ({
        sku: product.sku,
        mlItemId: product.mlItemId,
      })),
    [unassignedProducts, productSearchQuery],
  );

  const sortedSuppliers = useMemo(
    () => [...suppliers].sort((a, b) => a.name.localeCompare(b.name, "pt-BR")),
    [suppliers],
  );

  const filteredSuppliers = useMemo(
    () =>
      filterByItemListSearch(sortedSuppliers, searchQuery, (supplier) => ({
        title: supplier.name,
      })),
    [sortedSuppliers, searchQuery],
  );

  async function submit() {
    if (!modal) return;
    const name = modal.form.name.trim();
    if (!name) {
      setFormError("Informe o nome do fornecedor.");
      return;
    }
    setSaving(true);
    setFormError(null);
    try {
      const isEdit = modal.mode === "edit";
      const res = await fetch(
        isEdit ? `/api/suppliers/${encodeURIComponent(modal.id)}` : "/api/suppliers",
        {
          method: isEdit ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(
            isEdit ? { name, active: modal.form.active } : { name },
          ),
        },
      );
      if (!res.ok) {
        setFormError(
          await readApiError(res, isEdit ? "supplier_update_failed" : "supplier_create_failed"),
        );
        return;
      }
      setModal(null);
      await load();
    } catch {
      setFormError("Falha de rede. Tente novamente.");
    } finally {
      setSaving(false);
    }
  }

  async function confirmDeactivate() {
    if (!pendingDeactivate) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/suppliers/${encodeURIComponent(pendingDeactivate.id)}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        setError(await readApiError(res, "supplier_delete_failed"));
        return;
      }
      setPendingDeactivate(null);
      await load();
    } catch {
      setError("Falha de rede ao desativar fornecedor.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <DndContext
      sensors={sensors}
      autoScroll={false}
      onDragStart={handleDragStart}
      onDragEnd={(event) => void handleDragEnd(event)}
      onDragCancel={() => setActiveDragId(null)}
    >
      <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-[var(--muted-foreground)]">
          {sortedSuppliers.length}{" "}
          {sortedSuppliers.length === 1 ? "fornecedor cadastrado" : "fornecedores cadastrados"}
        </p>
        <Button
          type="button"
          size="sm"
          className="gap-2"
          onClick={() => setModal({ mode: "create", form: emptyForm() })}
        >
          <Plus className="size-4" aria-hidden />
          Novo fornecedor
        </Button>
      </div>

      {!loadingUnassigned && unassignedProducts.length > 0 ? (
        <Card className="space-y-2 p-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-[var(--muted-foreground)]">
            Produtos sem fornecedor ({unassignedProducts.length}) — arraste para um
            fornecedor na lista abaixo (ou de volta pra cá, pra desvincular)
          </p>
          <ItemListSearch
            value={productSearchQuery}
            onChange={setProductSearchQuery}
            filteredCount={filteredUnassignedProducts.length}
            totalCount={unassignedProducts.length}
            placeholder="Buscar por SKU…"
            entitySingular="produto"
            entityPlural="produtos"
          />
          <DroppableUnassignedTray>
            {filteredUnassignedProducts.length === 0 ? (
              <p className="py-2 text-xs text-[var(--muted-foreground)]">
                {itemListSearchEmptyMessage(productSearchQuery, "produto")}
              </p>
            ) : (
              filteredUnassignedProducts.map((product) => (
                <DraggableChip key={product.mlItemId} id={product.mlItemId}>
                  <ProductChipLabel product={product} />
                </DraggableChip>
              ))
            )}
          </DroppableUnassignedTray>
        </Card>
      ) : null}

      {assignError ? <UserFeedback>{assignError}</UserFeedback> : null}

      <ItemListSearch
        value={searchQuery}
        onChange={setSearchQuery}
        filteredCount={filteredSuppliers.length}
        totalCount={sortedSuppliers.length}
        placeholder="Buscar fornecedor…"
        entitySingular="fornecedor"
        entityPlural="fornecedores"
      />

      {error ? <UserFeedback>{error}</UserFeedback> : null}

      <Card className="overflow-hidden p-0 shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[32rem] text-sm">
            <thead className="border-b border-[var(--border)] bg-[var(--muted)]/80 text-left text-xs text-[var(--muted-foreground)]">
              <tr>
                <th className="px-4 py-3 font-semibold uppercase tracking-wide">Nome</th>
                <th className="px-4 py-3 text-right font-semibold uppercase tracking-wide">
                  Produtos
                </th>
                <th className="px-4 py-3 text-center font-semibold uppercase tracking-wide">
                  Status
                </th>
                <th className="px-4 py-3 text-right font-semibold uppercase tracking-wide">
                  Ações
                </th>
              </tr>
            </thead>
            <tbody className="bg-[var(--card)]">
              {loading ? (
                <tr>
                  <td colSpan={4} className="px-4 py-10 text-center text-[var(--muted-foreground)]">
                    Carregando…
                  </td>
                </tr>
              ) : filteredSuppliers.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-4 py-10 text-center text-[var(--muted-foreground)]">
                    {sortedSuppliers.length === 0
                      ? "Nenhum fornecedor cadastrado."
                      : itemListSearchEmptyMessage(searchQuery, "fornecedor")}
                  </td>
                </tr>
              ) : (
                filteredSuppliers.map((supplier) => {
                  const isExpanded = expandedIds.has(supplier.id);
                  const supplierProducts = assignedBySupplierId.get(supplier.id) ?? [];
                  return (
                    <Fragment key={supplier.id}>
                      <DroppableSupplierRow supplier={supplier}>
                        <td className="px-4 py-3 font-medium text-[var(--foreground)]">
                          <button
                            type="button"
                            onClick={() => toggleExpanded(supplier.id)}
                            className="flex cursor-pointer items-center gap-1.5 hover:underline"
                          >
                            {isExpanded ? (
                              <ChevronDown className="size-3.5 shrink-0 text-[var(--muted-foreground)]" aria-hidden />
                            ) : (
                              <ChevronRight className="size-3.5 shrink-0 text-[var(--muted-foreground)]" aria-hidden />
                            )}
                            {supplier.name}
                          </button>
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums text-[var(--muted-foreground)]">
                          {supplier.productCount}
                        </td>
                        <td className="px-4 py-3 text-center">
                          <Badge variant={supplier.active ? "secondary" : "warning"}>
                            {supplier.active ? "Ativo" : "Inativo"}
                          </Badge>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex justify-end gap-1">
                            <Button
                              type="button"
                              size="icon-sm"
                              variant="ghost"
                              aria-label={`Editar ${supplier.name}`}
                              onClick={() =>
                                setModal({
                                  mode: "edit",
                                  id: supplier.id,
                                  form: { name: supplier.name, active: supplier.active },
                                })
                              }
                            >
                              <Pencil className="size-4" aria-hidden />
                            </Button>
                            {supplier.active ? (
                              <Button
                                type="button"
                                size="icon-sm"
                                variant="ghost"
                                aria-label={`Desativar ${supplier.name}`}
                                onClick={() => setPendingDeactivate(supplier)}
                              >
                                <Trash2 className="size-4 text-rose-600" aria-hidden />
                              </Button>
                            ) : null}
                          </div>
                        </td>
                      </DroppableSupplierRow>
                      {isExpanded ? (
                        <tr className="border-b border-[var(--border)] bg-[var(--muted)]/20 last:border-0">
                          <td colSpan={4} className="px-4 py-3">
                            {supplierProducts.length === 0 ? (
                              <p className="text-xs text-[var(--muted-foreground)]">
                                Nenhum produto vinculado ainda — arraste um produto da caixa
                                acima.
                              </p>
                            ) : (
                              <div className="flex flex-wrap gap-2">
                                {supplierProducts.map((product) => (
                                  <DraggableChip key={product.mlItemId} id={product.mlItemId}>
                                    <ProductChipLabel product={product} />
                                  </DraggableChip>
                                ))}
                              </div>
                            )}
                          </td>
                        </tr>
                      ) : null}
                    </Fragment>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {modal ? (
        <Sheet open onOpenChange={(next) => !next && setModal(null)}>
          <SheetContent>
            <SheetHeader>
              <SheetTitle>
                {modal.mode === "create" ? "Novo fornecedor" : "Editar fornecedor"}
              </SheetTitle>
            </SheetHeader>
            <SheetBody className="space-y-4">
              <FormInput
                label="Nome"
                value={modal.form.name}
                autoFocus
                onChange={(e) =>
                  setModal((current) =>
                    current ? { ...current, form: { ...current.form, name: e.target.value } } : current,
                  )
                }
              />
              {modal.mode === "edit" ? (
                <div className="flex items-center justify-between gap-4 rounded-lg border border-[var(--border)] bg-[var(--card)] px-4 py-3 shadow-sm">
                  <label htmlFor="supplier-active" className="min-w-0 cursor-pointer">
                    <p className="text-sm font-medium text-[var(--foreground)]">Ativo</p>
                    <p className="mt-0.5 text-xs text-[var(--muted-foreground)]">
                      Fornecedores inativos somem da lista de seleção em Meus produtos.
                    </p>
                  </label>
                  <Switch
                    id="supplier-active"
                    checked={modal.form.active}
                    onCheckedChange={(checked) =>
                      setModal((current) =>
                        current ? { ...current, form: { ...current.form, active: checked } } : current,
                      )
                    }
                  />
                </div>
              ) : null}
              {formError ? <UserFeedback>{formError}</UserFeedback> : null}
            </SheetBody>
            <SheetFooter>
              <Button type="button" variant="outline" onClick={() => setModal(null)}>
                Cancelar
              </Button>
              <Button type="button" disabled={saving} onClick={() => void submit()}>
                {saving ? "Salvando…" : "Salvar"}
              </Button>
            </SheetFooter>
          </SheetContent>
        </Sheet>
      ) : null}

      <AlertDialog
        open={pendingDeactivate != null}
        onOpenChange={(next) => !next && setPendingDeactivate(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Desativar fornecedor?</AlertDialogTitle>
            <AlertDialogDescription>
              {pendingDeactivate
                ? `"${pendingDeactivate.name}" some da lista de seleção em Meus produtos. Produtos já vinculados a ele continuam vinculados.`
                : ""}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={() => void confirmDeactivate()}>
              Desativar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      </div>

      <DragOverlay>
        {activeDragProduct ? (
          <ChipVisual>
            <ProductChipLabel product={activeDragProduct} />
          </ChipVisual>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}
