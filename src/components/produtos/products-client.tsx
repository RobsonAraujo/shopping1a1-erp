"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Boxes, Plus, RefreshCw } from "lucide-react";
import { KitsModal } from "@/components/produtos/kits-modal";
import { ItemListSearch } from "@/components/item-list-search";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { FormInput } from "@/components/ui/form-input";
import {
  Sheet,
  SheetBody,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { ProductsTable } from "@/components/produtos/products-table";
import { ProductLevelingSuggestionSheet } from "@/components/produtos/product-leveling-suggestion-sheet";
import type { DreProductCostLevelingFormValues } from "@/components/dre/dre-product-cost-leveling-fields";
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
  mlItemId: string;
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

function emptyForm(mlItemId = "", sku = ""): ProductFormState {
  return {
    mlItemId,
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
    mlItemId: product.mlItemId,
    sku: product.sku ?? "",
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
  onLevelingSuggested,
}: {
  initial: ProductFormState;
  title: string;
  taxRegime: TaxRegime;
  onClose: () => void;
  onSaved: () => void;
  onLevelingSuggested?: (suggestion: {
    sku: string;
    previousValues: DreProductCostLevelingFormValues;
    productCreatedAt: string;
  }) => void;
}) {
  const [form, setForm] = useState(initial);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isEdit = Boolean(initial.mlItemId && initial.unitCostNf !== null);
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
        ? `/api/products/${encodeURIComponent(form.mlItemId)}`
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
      if (isEdit) {
        const json = (await res.json()) as {
          levelingSuggestion?: {
            previousValues: DreProductCostLevelingFormValues;
            productCreatedAt: string;
          } | null;
        };
        if (json.levelingSuggestion) {
          onLevelingSuggested?.({
            sku: form.sku,
            previousValues: json.levelingSuggestion.previousValues,
            productCreatedAt: json.levelingSuggestion.productCreatedAt,
          });
        }
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
            <div className="sm:col-span-2">
              <FormInput
                label="ID do anúncio no Mercado Livre (MLB...)"
                value={form.mlItemId}
                disabled={isEdit}
                placeholder="MLB1234567890"
                onChange={(e) =>
                  setForm((f) => ({ ...f, mlItemId: e.target.value.trim() }))
                }
              />
              {!isEdit ? (
                <p className="mt-1 text-xs text-[var(--muted-foreground)]">
                  O SKU e o custo são vinculados a este anúncio específico —
                  buscamos o SKU atual dele automaticamente ao salvar.
                </p>
              ) : null}
            </div>
            {isEdit ? (
              <div className="space-y-1 sm:col-span-2">
                <label className="block text-sm font-medium">SKU</label>
                <input
                  value={form.sku}
                  onChange={(e) => setForm((f) => ({ ...f, sku: e.target.value }))}
                  className="h-11 w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-base sm:h-10 sm:text-sm"
                />
                <p className="text-xs text-[var(--muted-foreground)]">
                  Só exibição/filtro — pode ficar desatualizado em relação ao
                  anúncio, não afeta relatórios.
                </p>
              </div>
            ) : null}
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
  const [modal, setModal] = useState<
    | { mode: "create"; form: ProductFormState }
    | { mode: "edit"; form: ProductFormState }
    | null
  >(null);
  const [importing, setImporting] = useState(false);
  const [kitsModalOpen, setKitsModalOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [levelingSuggestion, setLevelingSuggestion] = useState<{
    sku: string;
    previousValues: DreProductCostLevelingFormValues;
    productCreatedAt: string;
  } | null>(null);

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
      (a.sku ?? a.mlItemId).localeCompare(b.sku ?? b.mlItemId, "pt-BR", {
        sensitivity: "base",
      }),
    );
  }, [data?.products]);

  const searchedProducts = useMemo(
    () =>
      filterByItemListSearch(sortedProducts, searchQuery, (product) => ({
        sku: product.sku,
        mlItemId: product.mlItemId,
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
          return product.sku ?? product.mlItemId;
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

  async function importSkus() {
    setImporting(true);
    setError(null);
    try {
      const res = await fetch("/api/products/suggestions");
      if (!res.ok) {
        setError(await readApiError(res, "products_suggestions_failed"));
        return;
      }
      const json = (await res.json()) as {
        suggestions: { mlItemId: string; sku: string | null }[];
      };
      if (json.suggestions.length === 0) {
        setError("Nenhum anúncio novo encontrado.");
        return;
      }
      const first = json.suggestions[0];
      setModal({
        mode: "create",
        form: emptyForm(first.mlItemId, first.sku ?? ""),
      });
    } catch {
      setError("Falha de rede ao importar anúncios.");
    } finally {
      setImporting(false);
    }
  }

  async function deleteProduct(mlItemId: string) {
    const product = sortedProducts.find((p) => p.mlItemId === mlItemId);
    if (!confirm(`Remover cadastro de ${product?.sku ?? mlItemId}?`)) return;
    try {
      const res = await fetch(`/api/products/${encodeURIComponent(mlItemId)}`, {
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
          ) : (
            <div>
              <p className="text-sm text-[var(--muted-foreground)]">
                Alíquota PIS/COFINS
              </p>
              <p className="mt-1 text-2xl font-semibold tabular-nums text-[var(--foreground)]">
                {loading && data === null
                  ? "—"
                  : formatFinancialPercent(data?.pisCofinsPercent ?? null)}
              </p>
              <p className="mt-3 text-xs text-[var(--muted-foreground)]">
                Usada no cálculo de crédito na compra e no imposto para
                precificar, exceto em produtos monofásicos. Edite PIS e COFINS
                em{" "}
                <Link
                  href="/dashboard/configuracoes/tributario"
                  className="font-medium text-[var(--primary)] underline underline-offset-2"
                >
                  Configurações &gt; Config. tributária
                </Link>
                .
              </p>
            </div>
          )}
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
        onDelete={(mlItemId) => void deleteProduct(mlItemId)}
      />

      {modal ? (
        <ProductFormModal
          initial={modal.form}
          title={
            modal.mode === "create"
              ? "Novo produto"
              : `Editar ${modal.form.sku || modal.form.mlItemId}`
          }
          taxRegime={data?.taxRegime ?? "LUCRO_REAL"}
          onClose={() => setModal(null)}
          onSaved={() => void load()}
          onLevelingSuggested={setLevelingSuggestion}
        />
      ) : null}

      {levelingSuggestion ? (
        <ProductLevelingSuggestionSheet
          sku={levelingSuggestion.sku}
          previousValues={levelingSuggestion.previousValues}
          productCreatedAt={levelingSuggestion.productCreatedAt}
          onClose={() => setLevelingSuggestion(null)}
        />
      ) : null}
    </div>
  );
}
