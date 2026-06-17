"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Pencil, Plus, RefreshCw, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  MaskedMoneyField,
  MaskedPercentField,
} from "@/components/financial-cost-input-fields";
import { readApiError } from "@/lib/api-client-error";
import type { ProductView } from "@/lib/product-data";
import { formatFinancialMoney, formatFinancialPercent } from "@/lib/financial-margin";
import { cn } from "@/lib/utils";

type ProductsResponse = {
  products: ProductView[];
  pisCofinsPercent: number;
};

type ProductFormState = {
  sku: string;
  ncm: string;
  unitCostNf: number | null;
  purchaseIcmsPercent: number | null;
  hasIcmsSt: boolean;
  purchaseCostWithSt: number | null;
  ipiPercent: number | null;
  extraCosts: number | null;
  isMonophasic: boolean;
  saleIcmsPercent: number | null;
};

function emptyForm(sku = ""): ProductFormState {
  return {
    sku,
    ncm: "",
    unitCostNf: null,
    purchaseIcmsPercent: null,
    hasIcmsSt: false,
    purchaseCostWithSt: null,
    ipiPercent: 0,
    extraCosts: 0,
    isMonophasic: false,
    saleIcmsPercent: null,
  };
}

function formFromProduct(product: ProductView): ProductFormState {
  return {
    sku: product.sku,
    ncm: product.ncm ?? "",
    unitCostNf: product.unitCostNf,
    purchaseIcmsPercent: product.purchaseIcmsPercent,
    hasIcmsSt: product.hasIcmsSt,
    purchaseCostWithSt: product.purchaseCostWithSt,
    ipiPercent: product.ipiPercent,
    extraCosts: product.extraCosts,
    isMonophasic: product.isMonophasic,
    saleIcmsPercent: product.saleIcmsPercent,
  };
}

function ProductFormModal({
  initial,
  title,
  onClose,
  onSaved,
}: {
  initial: ProductFormState;
  title: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [form, setForm] = useState(initial);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isEdit = Boolean(initial.sku && initial.unitCostNf !== null);

  useEffect(() => {
    setForm(initial);
  }, [initial]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function submit() {
    setSaving(true);
    setError(null);
    try {
      const url = isEdit
        ? `/api/products/${encodeURIComponent(form.sku)}`
        : "/api/products";
      const res = await fetch(url, {
        method: isEdit ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      if (!res.ok) {
        setError(
          await readApiError(res, isEdit ? "product_update_failed" : "product_create_failed"),
        );
        return;
      }
      onSaved();
      onClose();
    } catch {
      setError("Falha de rede. Tente novamente.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      role="presentation"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="fixed inset-0 bg-black/50" aria-hidden />
      <div className="relative z-10 flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--card)] shadow-lg">
        <div className="border-b border-[var(--border)] px-5 py-4">
          <h2 className="text-lg font-semibold">{title}</h2>
        </div>
        <div className="overflow-y-auto px-5 py-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1 sm:col-span-2">
              <label className="block text-sm font-medium">SKU</label>
              <input
                value={form.sku}
                disabled={isEdit}
                onChange={(e) => setForm((f) => ({ ...f, sku: e.target.value }))}
                className="w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm disabled:opacity-60"
              />
            </div>
            <div className="space-y-1 sm:col-span-2">
              <label className="block text-sm font-medium">NCM</label>
              <input
                value={form.ncm}
                onChange={(e) => setForm((f) => ({ ...f, ncm: e.target.value }))}
                className="w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm"
              />
            </div>
            <MaskedMoneyField
              id="unit-cost-nf"
              label="Custo unitário NF"
              value={form.unitCostNf}
              onValueChange={(v) => setForm((f) => ({ ...f, unitCostNf: v }))}
            />
            <MaskedPercentField
              id="purchase-icms"
              label="ICMS da compra"
              value={form.purchaseIcmsPercent}
              onValueChange={(v) =>
                setForm((f) => ({ ...f, purchaseIcmsPercent: v }))
              }
            />
            <label className="flex items-center gap-2 text-sm sm:col-span-2">
              <input
                type="checkbox"
                checked={form.hasIcmsSt}
                onChange={(e) =>
                  setForm((f) => ({ ...f, hasIcmsSt: e.target.checked }))
                }
              />
              ICMS-ST
            </label>
            {form.hasIcmsSt ? (
              <MaskedMoneyField
                id="purchase-cost-st"
                label="Custo de compra somado ICMS-ST"
                value={form.purchaseCostWithSt}
                onValueChange={(v) =>
                  setForm((f) => ({ ...f, purchaseCostWithSt: v }))
                }
              />
            ) : null}
            <MaskedPercentField
              id="ipi"
              label="IPI"
              value={form.ipiPercent}
              onValueChange={(v) => setForm((f) => ({ ...f, ipiPercent: v }))}
            />
            <MaskedMoneyField
              id="extra-costs"
              label="Custos extras"
              value={form.extraCosts}
              onValueChange={(v) => setForm((f) => ({ ...f, extraCosts: v }))}
            />
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={form.isMonophasic}
                onChange={(e) =>
                  setForm((f) => ({ ...f, isMonophasic: e.target.checked }))
                }
              />
              Monofásico
            </label>
            <MaskedPercentField
              id="sale-icms"
              label="Imposto venda ICMS"
              value={form.saleIcmsPercent}
              onValueChange={(v) =>
                setForm((f) => ({ ...f, saleIcmsPercent: v }))
              }
            />
          </div>
          {error ? (
            <p className="mt-4 text-sm text-red-700">{error}</p>
          ) : null}
        </div>
        <div className="flex justify-end gap-2 border-t border-[var(--border)] px-5 py-4">
          <Button type="button" variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="button" disabled={saving} onClick={() => void submit()}>
            {saving ? "Salvando…" : "Salvar"}
          </Button>
        </div>
      </div>
    </div>
  );
}

export function ProductsClient() {
  const [data, setData] = useState<ProductsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pisCofinsDraft, setPisCofinsDraft] = useState<number | null>(null);
  const [savingTax, setSavingTax] = useState(false);
  const [modal, setModal] = useState<
    | { mode: "create"; form: ProductFormState }
    | { mode: "edit"; form: ProductFormState }
    | null
  >(null);
  const [importing, setImporting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/products");
      if (!res.ok) {
        setError(await readApiError(res, "products_load_failed"));
        return;
      }
      const json = (await res.json()) as ProductsResponse;
      setData(json);
      setPisCofinsDraft(json.pisCofinsPercent);
    } catch {
      setError("Falha de rede ao carregar produtos.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const products = data?.products ?? [];

  const sortedProducts = useMemo(
    () =>
      [...products].sort((a, b) =>
        a.sku.localeCompare(b.sku, "pt-BR", { sensitivity: "base" }),
      ),
    [products],
  );

  async function savePisCofins() {
    if (pisCofinsDraft === null) return;
    setSavingTax(true);
    setError(null);
    try {
      const res = await fetch("/api/company-tax-settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pisCofinsPercent: pisCofinsDraft }),
      });
      if (!res.ok) {
        setError(await readApiError(res, "tax_settings_update_failed"));
        return;
      }
      await load();
    } catch {
      setError("Falha de rede ao salvar PIS/COFINS.");
    } finally {
      setSavingTax(false);
    }
  }

  async function importSkus() {
    setImporting(true);
    setError(null);
    try {
      const res = await fetch("/api/products/suggestions");
      if (!res.ok) {
        setError(await readApiError(res, "products_suggestions_failed"));
        return;
      }
      const json = (await res.json()) as { suggestions: string[] };
      if (json.suggestions.length === 0) {
        setError("Nenhum SKU novo encontrado nos anúncios.");
        return;
      }
      setModal({
        mode: "create",
        form: emptyForm(json.suggestions[0]),
      });
    } catch {
      setError("Falha de rede ao importar SKUs.");
    } finally {
      setImporting(false);
    }
  }

  async function deleteProduct(sku: string) {
    if (!confirm(`Remover cadastro do SKU ${sku}?`)) return;
    try {
      const res = await fetch(`/api/products/${encodeURIComponent(sku)}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        setError(await readApiError(res, "product_delete_failed"));
        return;
      }
      await load();
    } catch {
      setError("Falha de rede ao remover produto.");
    }
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">PIS/COFINS da empresa</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap items-end gap-3">
          <div className="min-w-[12rem] flex-1">
            <MaskedPercentField
              id="company-pis-cofins"
              label="Alíquota PIS/COFINS (%)"
              value={pisCofinsDraft}
              onValueChange={setPisCofinsDraft}
            />
          </div>
          <Button
            type="button"
            variant="outline"
            disabled={savingTax || pisCofinsDraft === null}
            onClick={() => void savePisCofins()}
          >
            Salvar alíquota
          </Button>
          <p className="w-full text-xs text-[var(--muted-foreground)]">
            Usada no cálculo de crédito na compra e no imposto para precificar,
            exceto em produtos monofásicos.
          </p>
        </CardContent>
      </Card>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-[var(--muted-foreground)]">
          {sortedProducts.length}{" "}
          {sortedProducts.length === 1 ? "produto" : "produtos"} cadastrados
        </p>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="gap-2"
            disabled={loading || importing}
            onClick={() => void importSkus()}
          >
            <RefreshCw
              className={cn("size-4", importing && "animate-spin")}
              aria-hidden
            />
            Importar SKU dos anúncios
          </Button>
          <Button
            type="button"
            size="sm"
            className="gap-2"
            onClick={() =>
              setModal({ mode: "create", form: emptyForm() })
            }
          >
            <Plus className="size-4" aria-hidden />
            Novo produto
          </Button>
        </div>
      </div>

      {error ? (
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-900">
          {error}
        </p>
      ) : null}

      <div className="overflow-x-auto rounded-xl border border-[var(--border)]">
        <table className="w-full min-w-[56rem] text-sm">
          <thead className="bg-[var(--muted)]/30 text-left text-xs text-[var(--muted-foreground)]">
            <tr>
              <th className="px-3 py-2 font-medium">SKU</th>
              <th className="px-3 py-2 font-medium">NCM</th>
              <th className="px-3 py-2 font-medium text-right">
                Custo precificação
              </th>
              <th className="px-3 py-2 font-medium text-right">Imposto %</th>
              <th className="px-3 py-2 font-medium text-center">ST</th>
              <th className="px-3 py-2 font-medium text-center">Mono</th>
              <th className="px-3 py-2 font-medium text-right">Ações</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={7} className="px-3 py-8 text-center text-[var(--muted-foreground)]">
                  Carregando…
                </td>
              </tr>
            ) : sortedProducts.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-3 py-8 text-center text-[var(--muted-foreground)]">
                  Nenhum produto cadastrado. Importe SKUs dos anúncios ou crie um novo.
                </td>
              </tr>
            ) : (
              sortedProducts.map((product) => (
                <tr
                  key={product.sku}
                  className="border-t border-[var(--border)] hover:bg-[var(--muted)]/10"
                >
                  <td className="px-3 py-2 font-medium">{product.sku}</td>
                  <td className="px-3 py-2 text-[var(--muted-foreground)]">
                    {product.ncm ?? "—"}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {product.pricingCost !== null
                      ? formatFinancialMoney(product.pricingCost)
                      : "—"}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {product.taxPercent !== null
                      ? formatFinancialPercent(product.taxPercent)
                      : "—"}
                  </td>
                  <td className="px-3 py-2 text-center">
                    {product.hasIcmsSt ? "Sim" : "Não"}
                  </td>
                  <td className="px-3 py-2 text-center">
                    {product.isMonophasic ? "Sim" : "Não"}
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex justify-end gap-1">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        aria-label={`Editar ${product.sku}`}
                        onClick={() =>
                          setModal({
                            mode: "edit",
                            form: formFromProduct(product),
                          })
                        }
                      >
                        <Pencil className="size-4" aria-hidden />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        aria-label={`Remover ${product.sku}`}
                        onClick={() => void deleteProduct(product.sku)}
                      >
                        <Trash2 className="size-4" aria-hidden />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {modal ? (
        <ProductFormModal
          initial={modal.form}
          title={modal.mode === "create" ? "Novo produto" : `Editar ${modal.form.sku}`}
          onClose={() => setModal(null)}
          onSaved={() => void load()}
        />
      ) : null}
    </div>
  );
}
