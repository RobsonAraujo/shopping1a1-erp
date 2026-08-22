"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Boxes, Pencil, Plus, RefreshCw, X } from "lucide-react";
import { KitsModal } from "@/components/produtos/kits-modal";
import { ItemListSearch } from "@/components/item-list-search";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import {
  Sheet,
  SheetBody,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { ProductsTable } from "@/components/produtos/products-table";
import { UserFeedback } from "@/components/ui/user-feedback";
import type { ProductSortKey } from "@/components/produtos/products-table/types";
import { useTableSort } from "@/hooks/use-table-sort";
import {
  MaskedMoneyField,
  MaskedPercentField,
} from "@/components/financial-cost-input-fields";
import { readApiError } from "@/lib/api-client-error";
import { filterByItemListSearch } from "@/lib/item-list-search";
import type { ProductView } from "@/lib/product-data";
import { formatFinancialMoney, formatFinancialPercent } from "@/lib/financial-margin";
import { TAX_REPORT_MONTH_NAMES } from "@/lib/tax-report/routes";
import { cn } from "@/lib/utils";

type TaxRegime = "LUCRO_REAL" | "LUCRO_PRESUMIDO" | "SIMPLES";

type ProductsResponse = {
  products: ProductView[];
  pisCofinsPercent: number;
  taxRegime: TaxRegime;
  simplesAliquotaEfetivaPercent: number | null;
  taxReportGeneratedAt: string | null;
};

const DATE_TIME_FORMATTER = new Intl.DateTimeFormat("pt-BR", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
});

function formatPricingCostExplainer(product: ProductView): string {
  const base = product.hasIcmsSt
    ? product.purchaseCostWithSt ?? 0
    : product.unitCostNf;
  const baseLabel = product.hasIcmsSt
    ? "Custo unitário NF + ICMS-ST"
    : "Custo unitário NF";
  const ipiText =
    product.ipiPercent > 0
      ? ` + IPI ${formatFinancialPercent(product.ipiPercent)}`
      : " (IPI 0%)";
  const resultText =
    product.pricingCost !== null
      ? ` = ${formatFinancialMoney(product.pricingCost)}`
      : "";
  return `${baseLabel} (${formatFinancialMoney(base)})${ipiText}${resultText}.`;
}

function daysSince(iso: string): number {
  const diffMs = Date.now() - new Date(iso).getTime();
  return Math.max(0, Math.floor(diffMs / (1000 * 60 * 60 * 24)));
}

function taxReportPeriodLabel(year: number, month: number): string {
  return `${TAX_REPORT_MONTH_NAMES[month - 1] ?? month}/${year}`;
}

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
  isImported: boolean;
  saleIcmsPercent: number | null;
  pmaPrice: number | null;
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
    isImported: false,
    saleIcmsPercent: null,
    pmaPrice: null,
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
    isImported: product.isImported,
    saleIcmsPercent: product.saleIcmsPercent,
    pmaPrice: product.pmaPrice,
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
          className="h-11 min-w-[12rem] flex-1 rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-base sm:h-10 sm:text-sm"
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

      {error ? <UserFeedback className="mt-2">{error}</UserFeedback> : null}
    </div>
  );
}

const SIMPLES_HIDDEN_FIELD_KEYS = [
  "purchaseIcmsPercent",
  "hasIcmsSt",
  "purchaseCostWithSt",
  "ipiPercent",
  "isMonophasic",
  "isImported",
  "saleIcmsPercent",
] as const;

function ProductFormModal({
  initial,
  title,
  taxRegime,
  onClose,
  onSaved,
}: {
  initial: ProductFormState;
  title: string;
  taxRegime: TaxRegime;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [form, setForm] = useState(initial);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isEdit = Boolean(initial.sku && initial.unitCostNf !== null);
  const isSimples = taxRegime === "SIMPLES";

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
      const payload: Record<string, unknown> = { ...form };
      if (isSimples) {
        for (const key of SIMPLES_HIDDEN_FIELD_KEYS) delete payload[key];
      }
      const res = await fetch(url, {
        method: isEdit ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
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
    <Sheet
      open
      onOpenChange={(nextOpen) => {
        if (!nextOpen) onClose();
      }}
    >
      <SheetContent className="sm:max-w-2xl">
        <SheetHeader>
          <SheetTitle>{title}</SheetTitle>
        </SheetHeader>
        <SheetBody>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1 sm:col-span-2">
              <label className="block text-sm font-medium">SKU</label>
              <input
                value={form.sku}
                disabled={isEdit}
                onChange={(e) => setForm((f) => ({ ...f, sku: e.target.value }))}
                className="h-11 w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-base disabled:opacity-60 sm:h-10 sm:text-sm"
              />
            </div>
            <div className="space-y-1 sm:col-span-2">
              <label className="block text-sm font-medium">NCM</label>
              <input
                value={form.ncm}
                onChange={(e) => setForm((f) => ({ ...f, ncm: e.target.value }))}
                className="h-11 w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-base sm:h-10 sm:text-sm"
              />
            </div>
            <MaskedMoneyField
              id="unit-cost-nf"
              label="Custo unitário NF"
              value={form.unitCostNf}
              onValueChange={(v) => setForm((f) => ({ ...f, unitCostNf: v }))}
            />
            <MaskedMoneyField
              id="extra-costs"
              label="Custos extras"
              value={form.extraCosts}
              onValueChange={(v) => setForm((f) => ({ ...f, extraCosts: v }))}
            />
            {isSimples ? (
              <p className="text-xs leading-relaxed text-[var(--muted-foreground)] sm:col-span-2">
                Campos fiscais de Lucro Real (ICMS compra/venda, ICMS-ST, IPI,
                monofásico, importado) não se aplicam ao Simples Nacional e
                ficam ocultos. Se este produto já teve esses dados cadastrados
                antes (ex.: empresa migrou de Lucro Real), eles continuam
                salvos e voltam a aparecer se o regime mudar de novo.
              </p>
            ) : (
              <>
                <div>
                  <MaskedPercentField
                    id="purchase-icms"
                    label="ICMS da compra"
                    value={form.purchaseIcmsPercent}
                    onValueChange={(v) =>
                      setForm((f) => ({ ...f, purchaseIcmsPercent: v }))
                    }
                  />
                  {form.hasIcmsSt ? (
                    <p className="mt-1 text-xs text-[var(--muted-foreground)]">
                      Para produtos com ICMS-ST, esse valor só vira crédito nas
                      vendas interestaduais em que o ICMS-ST for tratado como
                      recuperável (config. tributária).
                    </p>
                  ) : null}
                </div>
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
                <FormSwitchRow
                  id="is-imported"
                  label="Produto importado"
                  description="Em vendas interestaduais, usa alíquota de ICMS interestadual de 4% (Resolução do Senado 13/2012)."
                  checked={form.isImported}
                  onCheckedChange={(checked) =>
                    setForm((f) => ({ ...f, isImported: checked }))
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
              </>
            )}
            <MaskedMoneyField
              id="pma-price"
              label="PMA (preço máximo autorizado de venda)"
              value={form.pmaPrice}
              onValueChange={(v) => setForm((f) => ({ ...f, pmaPrice: v }))}
            />
          </div>
          {isEdit ? <ProductSkuAliasesEditor canonicalSku={form.sku} /> : null}
          {error ? (
            <UserFeedback className="mt-4">{error}</UserFeedback>
          ) : null}
        </SheetBody>
        <SheetFooter>
          <Button type="button" variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="button" disabled={saving} onClick={() => void submit()}>
            {saving ? "Salvando…" : "Salvar"}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
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
  const [kitsModalOpen, setKitsModalOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

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

  const sortedProducts = useMemo(() => {
    const list = data?.products ?? [];
    return [...list].sort((a, b) =>
      a.sku.localeCompare(b.sku, "pt-BR", { sensitivity: "base" }),
    );
  }, [data?.products]);

  const searchedProducts = useMemo(
    () =>
      filterByItemListSearch(sortedProducts, searchQuery, (product) => ({
        sku: product.sku,
        extra: [product.ncm],
      })),
    [sortedProducts, searchQuery],
  );

  const {
    sort: productsSort,
    sortedRows: filteredProducts,
    onSortChange: onProductsSortChange,
  } = useTableSort<ProductView, ProductSortKey>(
    searchedProducts,
    (product, key) => {
      switch (key) {
        case "sku":
          return product.sku;
        case "ncm":
          return product.ncm ?? "";
        case "pricingCost":
          return product.pricingCost ?? Number.NEGATIVE_INFINITY;
        case "taxPercent":
          return product.taxPercent ?? Number.NEGATIVE_INFINITY;
        default:
          return "";
      }
    },
    { key: "sku", direction: "asc" },
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
          <CardTitle className="text-base">
            {data?.taxRegime === "SIMPLES"
              ? "Alíquota efetiva do Simples Nacional"
              : "PIS/COFINS da empresa"}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {data?.taxRegime === "SIMPLES" ? (
            <div>
              <p className="text-sm text-[var(--muted-foreground)]">
                Alíquota efetiva do DAS
              </p>
              <p className="mt-1 text-2xl font-semibold tabular-nums text-[var(--foreground)]">
                {loading && data === null
                  ? "—"
                  : formatFinancialPercent(data.simplesAliquotaEfetivaPercent)}
              </p>
              <p className="mt-3 text-xs text-[var(--muted-foreground)]">
                {data.simplesAliquotaEfetivaPercent == null
                  ? "Ainda não configurada — Imposto e margem ficam indisponíveis até configurar. "
                  : ""}
                Edite em{" "}
                <Link
                  href="/dashboard/configuracoes/empresa"
                  className="font-medium text-[var(--primary)] underline underline-offset-2"
                >
                  Configurações &gt; Empresa
                </Link>
                .
              </p>
            </div>
          ) : editingPisCofins ? (
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
          {data?.taxRegime !== "SIMPLES" ? (
            <p className="mt-3 text-xs text-[var(--muted-foreground)]">
              Usada no cálculo de crédito na compra e no imposto para
              precificar, exceto em produtos monofásicos.
            </p>
          ) : null}
        </CardContent>
      </Card>

      {data?.taxRegime !== "SIMPLES" && data?.taxReportGeneratedAt ? (
        <p className="text-xs text-[var(--muted-foreground)]">
          Coluna Imposto calculada a partir do relatório tributário gerado em{" "}
          {DATE_TIME_FORMATTER.format(new Date(data.taxReportGeneratedAt))}{" "}
          ({daysSince(data.taxReportGeneratedAt)} dia(s) atrás). Se houve
          vendas ou mudanças fiscais recentes,{" "}
          <Link
            href="/dashboard/relatorio-tributario"
            className="font-medium text-[var(--primary)] underline underline-offset-2"
          >
            recalcule o relatório tributário
          </Link>
          .
        </p>
      ) : null}

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
            variant="outline"
            size="sm"
            className="gap-2"
            onClick={() => setKitsModalOpen(true)}
          >
            <Boxes className="size-4" aria-hidden />
            Kits sem SKU
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

      <KitsModal open={kitsModalOpen} onClose={() => setKitsModalOpen(false)} />

      <ItemListSearch
        value={searchQuery}
        onChange={setSearchQuery}
        filteredCount={filteredProducts.length}
        totalCount={sortedProducts.length}
        placeholder="Buscar por SKU ou NCM…"
        entitySingular="produto"
        entityPlural="produtos"
      />

      {error ? (
        <UserFeedback>{error}</UserFeedback>
      ) : null}

      <ProductsTable
        loading={loading}
        sortedProducts={sortedProducts}
        filteredProducts={filteredProducts}
        searchQuery={searchQuery}
        sort={productsSort}
        onSortChange={onProductsSortChange}
        formatPricingCostExplainer={formatPricingCostExplainer}
        showFiscalFlags={data?.taxRegime !== "SIMPLES"}
        taxPercentExplainer={(product) =>
          data?.taxRegime === "SIMPLES"
            ? "Alíquota efetiva do Simples Nacional (DAS), informada manualmente em Configurações > Empresa — aplicada da mesma forma a todos os produtos (o Simples não apura ICMS/PIS/COFINS por SKU)."
            : product.taxPercent !== null &&
                product.taxPercentGeneratedAt &&
                product.taxPercentYear !== null &&
                product.taxPercentMonth !== null
              ? `Média % operacional de imposto apurada no relatório tributário de ${taxReportPeriodLabel(product.taxPercentYear, product.taxPercentMonth)} (recalculado em ${DATE_TIME_FORMATTER.format(new Date(product.taxPercentGeneratedAt))}, ${daysSince(product.taxPercentGeneratedAt)} dia(s) atrás). Se houve vendas ou mudanças fiscais recentes, recalcule o relatório tributário para atualizar este valor.`
              : "Este SKU ainda não aparece em nenhum relatório tributário calculado. Gere/recalcule o relatório tributário para obter o imposto médio deste produto."
        }
        onEdit={(product) =>
          setModal({ mode: "edit", form: formFromProduct(product) })
        }
        onDelete={(sku) => void deleteProduct(sku)}
      />

      {modal ? (
        <ProductFormModal
          initial={modal.form}
          title={modal.mode === "create" ? "Novo produto" : `Editar ${modal.form.sku}`}
          taxRegime={data?.taxRegime ?? "LUCRO_REAL"}
          onClose={() => setModal(null)}
          onSaved={() => void load()}
        />
      ) : null}
    </div>
  );
}
