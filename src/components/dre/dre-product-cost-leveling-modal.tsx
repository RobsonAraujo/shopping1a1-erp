"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import type { DateRange } from "react-day-picker";
import {
  CalendarIcon,
  Check,
  ChevronsUpDown,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  Trash2,
} from "lucide-react";
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
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { FormInput } from "@/components/ui/form-input";
import {
  localDateToYmd,
  ymdToLocalDate,
} from "@/components/ui/date-range-picker";
import {
  Sheet,
  SheetBody,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Switch } from "@/components/ui/switch";
import {
  MaskedMoneyField,
  MaskedPercentField,
} from "@/components/financial-cost-input-fields";
import { useApiResource } from "@/hooks/use-api-resource";
import { readApiError } from "@/lib/api-client-error";
import {
  computeLevelingPricingCost,
  enumerateMonthsOverlappingDateRange,
  type DreProductCostLevelingView,
} from "@/lib/dre/dre-product-cost-leveling-shared";
import { formatFinancialMoney } from "@/lib/financial-margin";
import { isDreMonthSyncable } from "@/lib/mercadolibre/revenue-periods";
import { cn } from "@/lib/utils";

type DreProductCostLevelingModalProps = {
  open: boolean;
  year: number;
  onClose: () => void;
  onError: (message: string | null) => void;
  /** Sincroniza meses do ano atual do DRE afetados pelo nivelamento. */
  onSyncAffectedMonths: (months: number[]) => void;
};

type FormState = {
  sku: string;
  startDate: string;
  endDate: string;
  hasIcmsSt: boolean;
  unitCostNf: number | null;
  purchaseCostWithSt: number | null;
  ipiPercent: number | null;
};

function emptyForm(year: number): FormState {
  return {
    sku: "",
    startDate: `${year}-01-01`,
    endDate: `${year}-03-31`,
    hasIcmsSt: false,
    unitCostNf: null,
    purchaseCostWithSt: null,
    ipiPercent: 0,
  };
}

function formFromItem(item: DreProductCostLevelingView): FormState {
  return {
    sku: item.sku,
    startDate: item.startDate,
    endDate: item.endDate,
    hasIcmsSt: item.hasIcmsSt,
    unitCostNf: item.unitCostNf,
    purchaseCostWithSt: item.purchaseCostWithSt,
    ipiPercent: item.ipiPercent,
  };
}

function periodLabel(startDate: string, endDate: string): string {
  const from = ymdToLocalDate(startDate);
  const to = ymdToLocalDate(endDate);
  if (!from || !to) return `${startDate} – ${endDate}`;
  if (startDate === endDate) {
    return format(from, "dd MMM yyyy", { locale: ptBR });
  }
  return `${format(from, "dd MMM yyyy", { locale: ptBR })} – ${format(to, "dd MMM yyyy", { locale: ptBR })}`;
}

function PeriodDateRangeField({
  startDate,
  endDate,
  onChange,
  disabled,
}: {
  startDate: string;
  endDate: string;
  onChange: (startDate: string, endDate: string) => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<DateRange | undefined>();
  const rootRef = useRef<HTMLDivElement>(null);

  function openPicker() {
    setDraft({
      from: ymdToLocalDate(startDate),
      to: ymdToLocalDate(endDate),
    });
    setOpen(true);
  }

  function cancelPicker() {
    setDraft(undefined);
    setOpen(false);
  }

  function applyPicker() {
    if (!draft?.from) return;
    const from = localDateToYmd(draft.from);
    const to = localDateToYmd(draft.to ?? draft.from);
    onChange(from, to);
    setDraft(undefined);
    setOpen(false);
  }

  useEffect(() => {
    if (!open) return;

    function onPointerDown(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) {
        cancelPicker();
      }
    }

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") cancelPicker();
    }

    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  const canApply = Boolean(draft?.from);

  return (
    <div ref={rootRef} className="space-y-1.5">
      <label className="block text-xs font-medium text-[var(--muted-foreground)]">
        Período
      </label>
      <Button
        type="button"
        variant="outline"
        disabled={disabled}
        className="h-10 w-full justify-start gap-2 font-normal"
        onClick={() => {
          if (open) cancelPicker();
          else openPicker();
        }}
      >
        <CalendarIcon className="size-4 shrink-0 opacity-70" aria-hidden />
        <span className="truncate">{periodLabel(startDate, endDate)}</span>
      </Button>
      {open ? (
        <div className="overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--popover)] shadow-sm">
          <div className="p-2">
            <Calendar
              mode="range"
              locale={ptBR}
              defaultMonth={draft?.from ?? draft?.to ?? new Date()}
              selected={draft}
              onSelect={(range) => {
                setDraft(range);
              }}
              numberOfMonths={1}
              className="mx-auto"
            />
          </div>
          <div className="flex justify-end gap-2 border-t border-[var(--border)] px-3 py-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-8 text-xs"
              onClick={cancelPicker}
            >
              Cancelar
            </Button>
            <Button
              type="button"
              size="sm"
              className="h-8 text-xs"
              disabled={!canApply}
              onClick={applyPicker}
            >
              Aplicar
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function SkuComboboxField({
  value,
  onValueChange,
  options,
  disabled,
  loading,
}: {
  value: string;
  onValueChange: (value: string) => void;
  options: string[];
  disabled?: boolean;
  loading?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const rootRef = useRef<HTMLDivElement>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter((sku) => sku.toLowerCase().includes(q));
  }, [options, query]);

  useEffect(() => {
    if (!open) return;

    function onPointerDown(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
        setQuery("");
      }
    }

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
        setQuery("");
      }
    }

    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <div ref={rootRef} className="space-y-1.5">
      <label className="block text-xs font-medium text-[var(--muted-foreground)]">
        SKU
      </label>
      <Button
        type="button"
        variant="outline"
        disabled={disabled || loading}
        role="combobox"
        aria-expanded={open}
        className="h-10 w-full justify-between font-normal"
        onClick={() => {
          setOpen((prev) => {
            const next = !prev;
            if (!next) setQuery("");
            return next;
          });
        }}
      >
        <span
          className={cn(
            "truncate",
            !value && "text-[var(--muted-foreground)]",
          )}
        >
          {loading
            ? "Carregando SKUs…"
            : value || "Selecione um SKU cadastrado…"}
        </span>
        <ChevronsUpDown className="size-4 shrink-0 opacity-50" aria-hidden />
      </Button>

      {open ? (
        <div className="overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--popover)] text-[var(--popover-foreground)] shadow-sm">
          <div className="relative border-b border-[var(--border)] p-2">
            <Search
              className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-[var(--muted-foreground)]"
              aria-hidden
            />
            <FormInput
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Pesquisar SKU…"
              inputClassName="h-9 pl-9"
              aria-label="Pesquisar SKU"
              autoComplete="off"
              autoFocus
            />
          </div>
          <ul className="max-h-56 overflow-y-auto py-1">
            {filtered.length === 0 ? (
              <li className="px-3 py-6 text-center text-sm text-[var(--muted-foreground)]">
                {options.length === 0
                  ? "Nenhum SKU cadastrado em Meus produtos."
                  : `Nenhum SKU para “${query.trim()}”.`}
              </li>
            ) : (
              filtered.map((sku) => {
                const selected = sku === value;
                return (
                  <li key={sku}>
                    <button
                      type="button"
                      className={cn(
                        "flex w-full cursor-pointer items-center gap-2 px-3 py-2 text-left text-sm hover:bg-[var(--accent)]/40",
                        selected && "bg-[var(--accent)]/30",
                      )}
                      onClick={() => {
                        onValueChange(sku);
                        setOpen(false);
                        setQuery("");
                      }}
                    >
                      <Check
                        className={cn(
                          "size-3.5 shrink-0",
                          selected ? "opacity-100" : "opacity-0",
                        )}
                        aria-hidden
                      />
                      <span className="truncate">{sku}</span>
                    </button>
                  </li>
                );
              })
            )}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

export function DreProductCostLevelingModal({
  open,
  year,
  onClose,
  onError,
  onSyncAffectedMonths,
}: DreProductCostLevelingModalProps) {
  const [items, setItems] = useState<DreProductCostLevelingView[]>([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(() => emptyForm(year));
  const [pendingDelete, setPendingDelete] =
    useState<DreProductCostLevelingView | null>(null);
  const [pendingResync, setPendingResync] = useState<{
    startDate: string;
    endDate: string;
  } | null>(null);

  const productsResource = useApiResource<{
    products: Array<{
      sku: string;
      unitCostNf: number;
      hasIcmsSt: boolean;
      purchaseCostWithSt: number | null;
      ipiPercent: number;
    }>;
  }>("/api/products", { enabled: open, fallbackError: "products_load_failed" });
  const productSkus = useMemo(
    () =>
      (productsResource.data?.products ?? [])
        .map((p) => p.sku)
        .sort((a, b) => a.localeCompare(b, "pt-BR")),
    [productsResource.data],
  );
  const productBySku = useMemo(() => {
    const map = new Map<
      string,
      {
        unitCostNf: number;
        hasIcmsSt: boolean;
        purchaseCostWithSt: number | null;
        ipiPercent: number;
      }
    >();
    for (const product of productsResource.data?.products ?? []) {
      map.set(product.sku, {
        unitCostNf: product.unitCostNf,
        hasIcmsSt: product.hasIcmsSt,
        purchaseCostWithSt: product.purchaseCostWithSt,
        ipiPercent: product.ipiPercent,
      });
    }
    return map;
  }, [productsResource.data]);

  function applySkuSelection(sku: string) {
    const product = productBySku.get(sku);
    setForm((f) => ({
      ...f,
      sku,
      ...(product
        ? {
            hasIcmsSt: product.hasIcmsSt,
            unitCostNf: product.unitCostNf,
            purchaseCostWithSt: product.purchaseCostWithSt,
            ipiPercent: product.ipiPercent,
          }
        : {}),
    }));
  }

  const previewCost = useMemo(
    () =>
      computeLevelingPricingCost({
        hasIcmsSt: form.hasIcmsSt,
        unitCostNf: form.unitCostNf ?? 0,
        purchaseCostWithSt: form.purchaseCostWithSt,
        ipiPercent: form.ipiPercent ?? 0,
      }),
    [form],
  );

  const loadItems = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/dre/product-cost-leveling");
      if (!res.ok) {
        onError(await readApiError(res, "dre_product_cost_leveling_failed"));
        return;
      }
      const json = (await res.json()) as { items?: DreProductCostLevelingView[] };
      setItems(json.items ?? []);
      onError(null);
    } catch {
      onError("Falha de rede ao carregar nivelamentos.");
    } finally {
      setLoading(false);
    }
  }, [onError]);

  useEffect(() => {
    if (!open) return;
    setEditingId(null);
    setForm(emptyForm(year));
    setPendingResync(null);
    void loadItems();
  }, [open, year, loadItems]);

  function resetForm() {
    setEditingId(null);
    setForm(emptyForm(year));
  }

  async function save() {
    const sku = form.sku.trim();
    if (!sku) {
      onError("Informe o SKU.");
      return;
    }
    if (form.hasIcmsSt) {
      if (form.purchaseCostWithSt === null) {
        onError("Informe o custo de compra somado ICMS-ST.");
        return;
      }
    } else if (form.unitCostNf === null) {
      onError("Informe o custo unitário NF.");
      return;
    }

    const body = {
      sku,
      startDate: form.startDate,
      endDate: form.endDate,
      hasIcmsSt: form.hasIcmsSt,
      unitCostNf: form.unitCostNf ?? 0,
      purchaseCostWithSt: form.hasIcmsSt ? form.purchaseCostWithSt : null,
      ipiPercent: form.ipiPercent ?? 0,
    };

    setBusy(true);
    try {
      const res = await fetch(
        editingId
          ? `/api/dre/product-cost-leveling/${editingId}`
          : "/api/dre/product-cost-leveling",
        {
          method: editingId ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        },
      );
      if (!res.ok) {
        onError(await readApiError(res, "dre_product_cost_leveling_save_failed"));
        return;
      }
      onError(null);
      setPendingResync({
        startDate: body.startDate,
        endDate: body.endDate,
      });
      resetForm();
      await loadItems();
    } catch {
      onError("Falha de rede ao salvar nivelamento.");
    } finally {
      setBusy(false);
    }
  }

  async function confirmDelete() {
    if (!pendingDelete) return;
    setBusy(true);
    try {
      const res = await fetch(
        `/api/dre/product-cost-leveling/${pendingDelete.id}`,
        { method: "DELETE" },
      );
      if (!res.ok) {
        onError(await readApiError(res, "dre_product_cost_leveling_delete_failed"));
        return;
      }
      onError(null);
      setPendingResync({
        startDate: pendingDelete.startDate,
        endDate: pendingDelete.endDate,
      });
      if (editingId === pendingDelete.id) resetForm();
      setPendingDelete(null);
      await loadItems();
    } catch {
      onError("Falha de rede ao excluir nivelamento.");
    } finally {
      setBusy(false);
    }
  }

  function syncAffected() {
    if (!pendingResync) return;
    const months = enumerateMonthsOverlappingDateRange(
      pendingResync.startDate,
      pendingResync.endDate,
    )
      .filter((m) => m.year === year && isDreMonthSyncable(m.year, m.month))
      .map((m) => m.month);
    if (months.length > 0) {
      onSyncAffectedMonths(months);
    }
    setPendingResync(null);
    onClose();
  }

  const otherYearMonths = pendingResync
    ? enumerateMonthsOverlappingDateRange(
        pendingResync.startDate,
        pendingResync.endDate,
      ).filter((m) => m.year !== year)
    : [];

  return (
    <>
      <Sheet
        open={open}
        onOpenChange={(next) => {
          if (!next) onClose();
        }}
      >
        <SheetContent className="flex h-[92vh] flex-col sm:max-h-[92vh] sm:w-[95vw] sm:max-w-3xl">
          <SheetHeader>
            <SheetTitle>Nivelar custos de produto</SheetTitle>
            <SheetDescription>
              Cadastre um custo unitário por SKU e intervalo de datas só para o
              DRE. Pedidos nesse período usam o custo nivelado; fora dele, o
              cadastro de Meus produtos. Depois de salvar, re-sincronize os
              meses afetados.
            </SheetDescription>
          </SheetHeader>

          <SheetBody className="flex flex-1 flex-col gap-4 overflow-y-auto">
            {pendingResync ? (
              <div className="rounded-lg border border-amber-200 bg-amber-50/70 px-3 py-2 text-xs text-amber-900">
                <p className="font-medium">
                  Nivelamento salvo. Re-sincronize para aplicar no DRE.
                </p>
                <p className="mt-1">
                  Período:{" "}
                  {periodLabel(
                    pendingResync.startDate,
                    pendingResync.endDate,
                  )}
                  .
                  {otherYearMonths.length > 0
                    ? ` Há meses em outros anos — troque o ano do DRE e sincronize também.`
                    : null}
                </p>
                <Button
                  type="button"
                  size="sm"
                  className="mt-2 h-8 gap-1 text-xs"
                  onClick={syncAffected}
                >
                  <RefreshCw className="size-3.5" aria-hidden />
                  Sincronizar meses afetados ({year})
                </Button>
              </div>
            ) : null}

            <div className="space-y-3 rounded-xl border border-[var(--border)] p-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-[var(--muted-foreground)]">
                {editingId ? "Editar nivelamento" : "Novo nivelamento"}
              </p>
              <SkuComboboxField
                value={form.sku}
                onValueChange={applySkuSelection}
                options={productSkus}
                disabled={busy}
                loading={productsResource.loading && productSkus.length === 0}
              />
              <PeriodDateRangeField
                startDate={form.startDate}
                endDate={form.endDate}
                disabled={busy}
                onChange={(startDate, endDate) =>
                  setForm((f) => ({ ...f, startDate, endDate }))
                }
              />

              <div className="flex items-center gap-2">
                <Switch
                  id="dre-leveling-st"
                  checked={form.hasIcmsSt}
                  onCheckedChange={(checked) =>
                    setForm((f) => ({ ...f, hasIcmsSt: checked }))
                  }
                  disabled={busy}
                />
                <label
                  htmlFor="dre-leveling-st"
                  className="text-sm text-[var(--foreground)]"
                >
                  ICMS-ST
                </label>
              </div>

              {form.hasIcmsSt ? (
                <MaskedMoneyField
                  id="dre-leveling-st-cost"
                  label="Custo de compra somado ICMS-ST"
                  value={form.purchaseCostWithSt}
                  onValueChange={(v) =>
                    setForm((f) => ({ ...f, purchaseCostWithSt: v }))
                  }
                  readOnly={busy}
                />
              ) : (
                <MaskedMoneyField
                  id="dre-leveling-nf"
                  label="Custo unitário NF"
                  value={form.unitCostNf}
                  onValueChange={(v) =>
                    setForm((f) => ({ ...f, unitCostNf: v }))
                  }
                  readOnly={busy}
                />
              )}

              <MaskedPercentField
                id="dre-leveling-ipi"
                label="IPI"
                value={form.ipiPercent}
                onValueChange={(v) =>
                  setForm((f) => ({ ...f, ipiPercent: v }))
                }
                readOnly={busy}
              />

              <p className="text-xs text-[var(--muted-foreground)]">
                Custo efetivo:{" "}
                <span className="font-semibold text-[var(--foreground)]">
                  {previewCost === null
                    ? "—"
                    : formatFinancialMoney(previewCost)}
                </span>
              </p>

              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  size="sm"
                  className="h-8 gap-1 text-xs"
                  disabled={busy}
                  onClick={() => void save()}
                >
                  <Plus className="size-3.5" aria-hidden />
                  {editingId ? "Salvar alterações" : "Cadastrar"}
                </Button>
                {editingId ? (
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    className="h-8 text-xs"
                    disabled={busy}
                    onClick={resetForm}
                  >
                    Cancelar edição
                  </Button>
                ) : null}
              </div>
            </div>

            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-[var(--muted-foreground)]">
                Nivelamentos cadastrados
              </p>
              {loading ? (
                <p className="text-sm text-[var(--muted-foreground)]">
                  Carregando…
                </p>
              ) : items.length === 0 ? (
                <p className="text-sm text-[var(--muted-foreground)]">
                  Nenhum nivelamento ainda.
                </p>
              ) : (
                <ul className="divide-y divide-[var(--border)] rounded-xl border border-[var(--border)]">
                  {items.map((item) => (
                    <li
                      key={item.id}
                      className="flex flex-col gap-2 px-3 py-3 sm:flex-row sm:items-center sm:justify-between"
                    >
                      <div className="min-w-0">
                        <p className="truncate font-medium">{item.sku}</p>
                        <p className="text-xs text-[var(--muted-foreground)]">
                          {periodLabel(item.startDate, item.endDate)} ·{" "}
                          {formatFinancialMoney(item.pricingCost)}
                          {item.hasIcmsSt ? " (com ST)" : " (NF)"}
                        </p>
                      </div>
                      <div className="flex gap-1">
                        <Button
                          type="button"
                          size="icon-sm"
                          variant="ghost"
                          aria-label={`Editar ${item.sku}`}
                          disabled={busy}
                          onClick={() => {
                            setEditingId(item.id);
                            setForm(formFromItem(item));
                          }}
                        >
                          <Pencil className="size-3.5" aria-hidden />
                        </Button>
                        <Button
                          type="button"
                          size="icon-sm"
                          variant="ghost"
                          aria-label={`Excluir ${item.sku}`}
                          disabled={busy}
                          onClick={() => setPendingDelete(item)}
                        >
                          <Trash2 className="size-3.5" aria-hidden />
                        </Button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
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
            <AlertDialogTitle>Excluir nivelamento?</AlertDialogTitle>
            <AlertDialogDescription>
              {pendingDelete
                ? `Remover o nivelamento de ${pendingDelete.sku} (${periodLabel(
                    pendingDelete.startDate,
                    pendingDelete.endDate,
                  )})? O DRE voltará a usar o cadastro de Meus produtos após re-sincronizar.`
                : null}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              disabled={busy}
              onClick={(e) => {
                e.preventDefault();
                void confirmDelete();
              }}
            >
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
