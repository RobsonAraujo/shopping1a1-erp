"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Pencil, Plus, RefreshCw, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
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

function FormSwitchRow({
  id,
  label,
  description,
  checked,
  onCheckedChange,
  className,
}: {
  id: string;
  label: string;
  description?: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex items-center justify-between gap-4 rounded-lg border border-[var(--border)] bg-[var(--card)] px-4 py-3 shadow-sm",
        className,
      )}
    >
      <label htmlFor={id} className="min-w-0 cursor-pointer">
        <p className="text-sm font-medium text-[var(--foreground)]">{label}</p>
        {description ? (
          <p className="mt-0.5 text-xs text-[var(--muted-foreground)]">
            {description}
          </p>
        ) : null}
      </label>
      <Switch
        id={id}
        checked={checked}
        onCheckedChange={onCheckedChange}
        aria-label={label}
      />
    </div>
  );
}

function ProductSkuAliasesEditor({ canonicalSku }: { canonicalSku: string }) {
  const [aliases, setAliases] = useState<string[]>([]);
  const [draft, setDraft] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadAliases = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/products/${encodeURIComponent(canonicalSku)}/aliases`,
      );
      if (!res.ok) {
        setError(await readApiError(res, "product_aliases_load_failed"));
        return;
      }
      const json = (await res.json()) as { aliases: string[] };
      setAliases(json.aliases);
    } catch {
      setError("Falha ao carregar SKUs associados.");
    } finally {
      setLoading(false);
    }
  }, [canonicalSku]);

  useEffect(() => {
    void loadAliases();
  }, [loadAliases]);

  async function addAlias() {
    const aliasSku = draft.trim();
    if (!aliasSku) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/products/${encodeURIComponent(canonicalSku)}/aliases`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ aliasSku }),
        },
      );
      if (!res.ok) {
        setError(await readApiError(res, "product_alias_create_failed"));
        return;
      }
      const json = (await res.json()) as { aliases: string[] };
      setAliases(json.aliases);
      setDraft("");
    } catch {
      setError("Falha ao associar SKU.");
    } finally {
      setSaving(false);
    }
  }

  async function removeAlias(aliasSku: string) {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/products/${encodeURIComponent(canonicalSku)}/aliases/${encodeURIComponent(aliasSku)}`,
        { method: "DELETE" },
      );
      if (!res.ok) {
        setError(await readApiError(res, "product_alias_delete_failed"));
        return;
      }
      const json = (await res.json()) as { aliases: string[] };
      setAliases(json.aliases);
    } catch {
      setError("Falha ao remover associação.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mt-2 space-y-3 rounded-lg border border-[var(--border)] bg-[var(--muted)]/10 p-4 sm:col-span-2">
      <div>
        <p className="text-sm font-medium">SKUs equivalentes / anteriores</p>
        <p className="mt-1 text-xs text-[var(--muted-foreground)]">
          Use quando renomear o SKU no Mercado Livre. Vendas antigas continuam
          com o nome original, mas entram nos totais deste cadastro.
        </p>
      </div>

      {loading ? (
        <p className="text-xs text-[var(--muted-foreground)]">Carregando…</p>
      ) : aliases.length > 0 ? (
        <ul className="space-y-2">
          {aliases.map((alias) => (
            <li
              key={alias}
              className="flex items-start justify-between gap-3 rounded-md border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm"
            >
              <span className="min-w-0 break-all">{alias}</span>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-8 shrink-0 px-2 text-[var(--muted-foreground)]"
                disabled={saving}
                onClick={() => void removeAlias(alias)}
                aria-label={`Remover alias ${alias}`}
              >
                <X className="size-4" />
              </Button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-xs text-[var(--muted-foreground)]">
          Nenhum SKU anterior associado.
        </p>
      )}

      <div className="flex flex-wrap gap-2">
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="SKU antigo ou alternativo"
          className="min-w-[12rem] flex-1 rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm"
          disabled={saving}
        />
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={saving || !draft.trim()}
          onClick={() => void addAlias()}
        >
          Associar SKU
        </Button>
      </div>

      {error ? <p className="text-xs text-red-700">{error}</p> : null}
    </div>
  );
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
            <FormSwitchRow
              id="has-icms-st"
              label="ICMS-ST"
              description="Substituição tributária na compra — usa o custo com ST no cálculo."
              checked={form.hasIcmsSt}
              onCheckedChange={(checked) =>
                setForm((f) => ({ ...f, hasIcmsSt: checked }))
              }
              className="sm:col-span-2"
            />
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
            <FormSwitchRow
              id="is-monophasic"
              label="Monofásico"
              description="Sem PIS/COFINS no crédito de compra nem na precificação."
              checked={form.isMonophasic}
              onCheckedChange={(checked) =>
                setForm((f) => ({ ...f, isMonophasic: checked }))
              }
              className="sm:col-span-2"
            />
            <MaskedPercentField
              id="sale-icms"
              label="Imposto venda ICMS"
              value={form.saleIcmsPercent}
              onValueChange={(v) =>
                setForm((f) => ({ ...f, saleIcmsPercent: v }))
              }
            />
          </div>
          {isEdit ? <ProductSkuAliasesEditor canonicalSku={form.sku} /> : null}
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
  const [editingPisCofins, setEditingPisCofins] = useState(false);
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
      setEditingPisCofins(false);
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
      setEditingPisCofins(false);
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
        <CardContent>
          {editingPisCofins ? (
            <div className="flex flex-wrap items-end gap-3">
              <div className="min-w-[12rem] flex-1">
                <MaskedPercentField
                  id="company-pis-cofins"
                  label="Alíquota PIS/COFINS (%)"
                  value={pisCofinsDraft}
                  onValueChange={setPisCofinsDraft}
                />
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  disabled={savingTax || pisCofinsDraft === null}
                  onClick={() => void savePisCofins()}
                >
                  {savingTax ? "Salvando…" : "Salvar"}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  disabled={savingTax}
                  onClick={() => {
                    setPisCofinsDraft(data?.pisCofinsPercent ?? null);
                    setEditingPisCofins(false);
                  }}
                >
                  Cancelar
                </Button>
              </div>
            </div>
          ) : (
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <p className="text-sm text-[var(--muted-foreground)]">
                  Alíquota PIS/COFINS
                </p>
                <p className="mt-1 text-2xl font-semibold tabular-nums text-[var(--foreground)]">
                  {loading && data === null
                    ? "—"
                    : formatFinancialPercent(data?.pisCofinsPercent ?? null)}
                </p>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="gap-2"
                disabled={loading}
                onClick={() => {
                  setPisCofinsDraft(data?.pisCofinsPercent ?? null);
                  setEditingPisCofins(true);
                }}
              >
                <Pencil className="size-4" aria-hidden />
                Editar
              </Button>
            </div>
          )}
          <p className="mt-3 text-xs text-[var(--muted-foreground)]">
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

      <Card className="overflow-hidden p-0 shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[56rem] text-sm">
            <thead className="border-b border-[var(--border)] bg-[var(--muted)]/80 text-left text-xs text-[var(--muted-foreground)]">
              <tr>
                <th className="px-4 py-3 font-semibold uppercase tracking-wide">
                  SKU
                </th>
                <th className="px-4 py-3 font-semibold uppercase tracking-wide">
                  NCM
                </th>
                <th className="px-4 py-3 text-right font-semibold uppercase tracking-wide">
                  Custo precificação
                </th>
                <th className="px-4 py-3 text-right font-semibold uppercase tracking-wide">
                  Imposto %
                </th>
                <th className="px-4 py-3 text-center font-semibold uppercase tracking-wide">
                  ST
                </th>
                <th className="px-4 py-3 text-center font-semibold uppercase tracking-wide">
                  Mono
                </th>
                <th className="px-4 py-3 text-right font-semibold uppercase tracking-wide">
                  Ações
                </th>
              </tr>
            </thead>
            <tbody className="bg-[var(--card)]">
              {loading ? (
                <tr>
                  <td
                    colSpan={7}
                    className="px-4 py-10 text-center text-[var(--muted-foreground)]"
                  >
                    Carregando…
                  </td>
                </tr>
              ) : sortedProducts.length === 0 ? (
                <tr>
                  <td
                    colSpan={7}
                    className="px-4 py-10 text-center text-[var(--muted-foreground)]"
                  >
                    Nenhum produto cadastrado. Importe SKUs dos anúncios ou crie
                    um novo.
                  </td>
                </tr>
              ) : (
                sortedProducts.map((product) => (
                  <tr
                    key={product.sku}
                    className="border-t border-[var(--border)] transition-colors hover:bg-[var(--muted)]/25"
                  >
                    <td className="px-4 py-3 font-medium">{product.sku}</td>
                    <td className="px-4 py-3 text-[var(--muted-foreground)]">
                      {product.ncm ?? "—"}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">
                      {product.pricingCost !== null
                        ? formatFinancialMoney(product.pricingCost)
                        : "—"}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">
                      {product.taxPercent !== null
                        ? formatFinancialPercent(product.taxPercent)
                        : "—"}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <Badge
                        variant={product.hasIcmsSt ? "secondary" : "muted"}
                        className="min-w-[2.5rem]"
                      >
                        {product.hasIcmsSt ? "Sim" : "Não"}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <Badge
                        variant={product.isMonophasic ? "secondary" : "muted"}
                        className="min-w-[2.5rem]"
                      >
                        {product.isMonophasic ? "Sim" : "Não"}
                      </Badge>
                    </td>
                    <td className="px-4 py-3">
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
      </Card>

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
