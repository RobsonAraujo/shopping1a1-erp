"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, Info, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Combobox } from "@/components/ui/combobox";
import { DatePicker } from "@/components/ui/date-picker";
import { FormInput } from "@/components/ui/form-input";
import { Switch } from "@/components/ui/switch";
import {
  Sheet,
  SheetBody,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { MaskedMoneyField, MaskedPercentField } from "@/components/shared/FinancialCostInputFields";
import { readApiError } from "@/lib/api/api-client-error";
import { formatMoneyBRL } from "@/lib/format-money";
import type { StockItemOption } from "@/lib/stock/stock-page-data";
import { formatUnits, todayYmd } from "@/components/stock/stock-format";
import { cn } from "@/lib/utils";

type Cost = NonNullable<StockItemOption["cost"]>;

type Line = {
  key: number;
  stockItemId: string;
  quantity: string;
  unitCostNf: number | null;
  purchaseIcmsPercent: number | null;
  hasIcmsSt: boolean;
  purchaseCostWithSt: number | null;
  ipiPercent: number | null;
  extraCosts: number | null;
  showFiscal: boolean;
  /** Custo aberto para edição. Fechado = vai com o custo atual (sem nivelamento). */
  editingCost: boolean;
};

let nextKey = 1;
function emptyLine(): Line {
  return {
    key: nextKey++,
    stockItemId: "",
    quantity: "",
    unitCostNf: null,
    purchaseIcmsPercent: null,
    hasIcmsSt: false,
    purchaseCostWithSt: null,
    ipiPercent: null,
    extraCosts: null,
    showFiscal: false,
    editingCost: false,
  };
}

/** O custo que a pessoa reconhece: com ST, o custo com ST; senão, o da NF. */
function displayCost(cost: Pick<Cost, "hasIcmsSt" | "purchaseCostWithSt" | "unitCostNf">): number {
  return cost.hasIcmsSt ? (cost.purchaseCostWithSt ?? cost.unitCostNf) : cost.unitCostNf;
}

function withCost(line: Line, cost: Cost | null): Line {
  return {
    ...line,
    unitCostNf: cost?.unitCostNf ?? null,
    purchaseIcmsPercent: cost?.purchaseIcmsPercent ?? null,
    hasIcmsSt: cost?.hasIcmsSt ?? false,
    purchaseCostWithSt: cost?.purchaseCostWithSt ?? null,
    ipiPercent: cost?.ipiPercent ?? null,
    extraCosts: cost?.extraCosts ?? null,
  };
}

function costChanged(line: Line, current: Cost | null): boolean {
  if (!current) return line.unitCostNf != null;
  const eq = (a: number | null, b: number | null) => Math.abs((a ?? 0) - (b ?? 0)) < 0.005;
  return (
    !eq(line.unitCostNf, current.unitCostNf) ||
    !eq(line.purchaseIcmsPercent, current.purchaseIcmsPercent) ||
    line.hasIcmsSt !== current.hasIcmsSt ||
    !eq(line.purchaseCostWithSt, current.purchaseCostWithSt) ||
    !eq(line.ipiPercent, current.ipiPercent) ||
    !eq(line.extraCosts, current.extraCosts)
  );
}

/**
 * "Registrar entrada": mercadoria que chegou no galpão. Cada linha vira um
 * lote. O padrão é o custo atual, sem campo aberto: não muda custo nem
 * registra nivelamento. "Mudar o custo desta compra" abre o custo; com valor
 * diferente, ele fica programado e só começa a contar (com o nivelamento)
 * depois que o estoque atual acabar (PEPS).
 */
export function StockEntryForm({
  open,
  onOpenChange,
  items,
  suppliers,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  items: StockItemOption[];
  suppliers: Array<{ id: string; name: string }>;
}) {
  const router = useRouter();
  const [arrivedOn, setArrivedOn] = useState(todayYmd());
  const [supplierId, setSupplierId] = useState("");
  const [invoice, setInvoice] = useState("");
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState<Line[]>(() => [emptyLine()]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const itemById = useMemo(() => new Map(items.map((i) => [i.stockItemId, i])), [items]);
  const options = useMemo(
    () => items.map((i) => ({ value: i.stockItemId, label: i.sku ? `${i.sku} · ${i.title}` : i.title })),
    [items],
  );

  function update(key: number, patch: Partial<Line>) {
    setLines((prev) => prev.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  }

  function reset() {
    setArrivedOn(todayYmd());
    setSupplierId("");
    setInvoice("");
    setNotes("");
    setLines([emptyLine()]);
    setError(null);
  }

  const summary = useMemo(() => {
    let units = 0;
    let value = 0;
    let valueKnown = true;
    for (const l of lines) {
      const q = Math.round(Number(l.quantity) || 0);
      units += q;
      if (l.unitCostNf == null) valueKnown = false;
      else value += q * (l.hasIcmsSt ? (l.purchaseCostWithSt ?? 0) : l.unitCostNf) * (1 + (l.ipiPercent ?? 0) / 100);
    }
    return { units, value: valueKnown ? value : null };
  }, [lines]);

  async function submit() {
    setError(null);
    const valid = lines.filter((l) => l.stockItemId && Math.round(Number(l.quantity)) > 0);
    if (valid.length === 0) {
      setError("Escolha pelo menos um produto e a quantidade.");
      return;
    }
    if (valid.length !== lines.filter((l) => l.stockItemId || l.quantity).length) {
      setError("Tem linha sem produto ou sem quantidade.");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/stock/entries", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          arrivedOn,
          supplierId: supplierId || null,
          invoiceNumber: invoice.trim() || null,
          notes: notes.trim() || null,
          lines: valid.map((l) => ({
            stockItemId: l.stockItemId,
            quantity: Math.round(Number(l.quantity)),
            cost:
              l.unitCostNf == null
                ? null
                : {
                    unitCostNf: l.unitCostNf,
                    purchaseIcmsPercent: l.purchaseIcmsPercent ?? 0,
                    hasIcmsSt: l.hasIcmsSt,
                    purchaseCostWithSt: l.hasIcmsSt ? (l.purchaseCostWithSt ?? 0) : null,
                    ipiPercent: l.ipiPercent ?? 0,
                    extraCosts: l.extraCosts ?? 0,
                  },
          })),
        }),
      });
      if (!res.ok) {
        setError(await readApiError(res, "stock_action_failed"));
        return;
      }
      toast.success(`Entrada registrada: ${formatUnits(summary.units)} un no galpão.`);
      reset();
      onOpenChange(false);
      router.refresh();
    } finally {
      setSaving(false);
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="sm:max-w-3xl">
        <SheetHeader>
          <SheetTitle>Registrar entrada</SheetTitle>
          <SheetDescription>
            Mercadoria que chegou no galpão. Escolha o produto e a quantidade; o custo atual já vem junto.
          </SheetDescription>
        </SheetHeader>
        <SheetBody className="space-y-5">
          <div className="grid gap-3 sm:grid-cols-3">
            <DatePicker label="Chegou em" valueYmd={arrivedOn} onChange={setArrivedOn} />
            <Combobox
              label="Fornecedor (opcional)"
              value={supplierId}
              onValueChange={setSupplierId}
              placeholder="Sem fornecedor"
              searchPlaceholder="Buscar fornecedor…"
              options={suppliers.map((s) => ({ value: s.id, label: s.name }))}
            />
            <FormInput
              label="Nota fiscal (opcional)"
              placeholder="Nº da NF"
              value={invoice}
              onChange={(e) => setInvoice(e.target.value)}
            />
          </div>

          <div className="space-y-3">
            {lines.map((line, index) => {
              const option = line.stockItemId ? itemById.get(line.stockItemId) : undefined;
              const current = option?.cost ?? null;
              const changed = option ? costChanged(line, current) : false;
              const showCostEditor = option != null && (line.editingCost || current == null);
              return (
                <div key={line.key} className="rounded-xl border border-[var(--border)] p-3">
                  <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_110px_auto] sm:items-end">
                    <Combobox
                      label={index === 0 ? "Produto" : undefined}
                      aria-label="Produto"
                      className="min-w-0"
                      value={line.stockItemId}
                      onValueChange={(value) => {
                        const opt = itemById.get(value);
                        setLines((prev) =>
                          prev.map((l) =>
                            l.key === line.key
                              ? {
                                  ...withCost({ ...l, stockItemId: value }, opt?.cost ?? null),
                                  editingCost: false,
                                  showFiscal: false,
                                }
                              : l,
                          ),
                        );
                      }}
                      placeholder="Escolha o produto…"
                      searchPlaceholder="Buscar por nome ou SKU…"
                      options={options}
                    />
                    <FormInput
                      label={index === 0 ? "Quantidade" : undefined}
                      aria-label="Quantidade"
                      type="number"
                      min={1}
                      inputMode="numeric"
                      value={line.quantity}
                      onChange={(e) => update(line.key, { quantity: e.target.value })}
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      aria-label="Remover linha"
                      disabled={lines.length === 1}
                      onClick={() => setLines((prev) => prev.filter((l) => l.key !== line.key))}
                    >
                      <Trash2 />
                    </Button>
                  </div>

                  {option && current && !showCostEditor ? (
                    <p className="mt-2 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-xs text-[var(--muted-foreground)]">
                      <span>
                        {current.hasIcmsSt ? "Custo com ST" : "Custo NF"}:{" "}
                        <strong className="tabular-nums text-[var(--foreground)]">{formatMoneyBRL(displayCost(current))}</strong>{" "}
                        (custo atual)
                      </span>
                      <span aria-hidden>·</span>
                      <span>Mesmo custo: não registra nivelamento.</span>
                      <span aria-hidden>·</span>
                      <button
                        type="button"
                        onClick={() => update(line.key, { editingCost: true })}
                        className="cursor-pointer font-medium text-[var(--primary)] underline-offset-2 hover:underline"
                      >
                        Mudar o custo desta compra
                      </button>
                    </p>
                  ) : null}

                  {showCostEditor ? (
                    <div className="mt-3 space-y-3 rounded-lg bg-[var(--muted)]/25 p-3">
                      <div className="flex flex-wrap items-end gap-3">
                        <MaskedMoneyField
                          id={`entry-cost-${line.key}`}
                          label="Custo unitário (NF)"
                          value={line.unitCostNf}
                          onValueChange={(v) => update(line.key, { unitCostNf: v })}
                          className="w-44"
                        />
                        {current ? (
                          <button
                            type="button"
                            onClick={() =>
                              setLines((prev) =>
                                prev.map((l) =>
                                  l.key === line.key
                                    ? { ...withCost(l, current), editingCost: false, showFiscal: false }
                                    : l,
                                ),
                              )
                            }
                            className="cursor-pointer pb-2.5 text-xs font-medium text-[var(--muted-foreground)] underline-offset-2 hover:text-[var(--foreground)] hover:underline"
                          >
                            Usar o custo atual
                          </button>
                        ) : null}
                      </div>
                      <p className="flex items-start gap-1.5 text-xs text-[var(--muted-foreground)]">
                        <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden />
                        <span>
                          {current == null
                            ? "Produto sem custo cadastrado: informe o custo da NF desta compra."
                            : !changed
                              ? "É o mesmo custo atual: não registra nivelamento."
                              : option.lotRemaining && option.lotRemaining > 0
                                ? `Custo novo programado. As ${formatUnits(option.lotRemaining)} un que restam continuam a ${formatMoneyBRL(displayCost(current))}. O custo de ${formatMoneyBRL(displayCost({ hasIcmsSt: line.hasIcmsSt, purchaseCostWithSt: line.purchaseCostWithSt, unitCostNf: line.unitCostNf ?? 0 }))} só começa a contar quando elas acabarem; aí o ERP registra o nivelamento e passa a usar o custo novo para as unidades desta entrada.`
                                : "Não há estoque no custo atual: o custo novo passa a valer já."}
                        </span>
                      </p>
                      <button
                        type="button"
                        onClick={() => update(line.key, { showFiscal: !line.showFiscal })}
                        className="inline-flex cursor-pointer items-center gap-1 text-xs font-medium text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
                      >
                        <ChevronDown className={cn("size-3.5 transition-transform", line.showFiscal && "rotate-180")} />
                        Detalhes fiscais (ICMS, ST, IPI, custos extras)
                      </button>
                      {line.showFiscal ? (
                        <div className="grid gap-3 sm:grid-cols-4">
                          <MaskedPercentField
                            id={`entry-icms-${line.key}`}
                            label="ICMS da compra"
                            value={line.purchaseIcmsPercent}
                            onValueChange={(v) => update(line.key, { purchaseIcmsPercent: v })}
                          />
                          <MaskedPercentField
                            id={`entry-ipi-${line.key}`}
                            label="IPI"
                            value={line.ipiPercent}
                            onValueChange={(v) => update(line.key, { ipiPercent: v })}
                          />
                          <MaskedMoneyField
                            id={`entry-extra-${line.key}`}
                            label="Custos extras/un"
                            value={line.extraCosts}
                            onValueChange={(v) => update(line.key, { extraCosts: v })}
                          />
                          <div className="space-y-1.5">
                            <label className="flex items-center gap-2 text-xs font-medium text-[var(--muted-foreground)]">
                              <Switch
                                checked={line.hasIcmsSt}
                                onCheckedChange={(v) => update(line.key, { hasIcmsSt: v === true })}
                              />
                              Com ICMS-ST
                            </label>
                            {line.hasIcmsSt ? (
                              <MaskedMoneyField
                                id={`entry-st-${line.key}`}
                                label="Custo com ST"
                                value={line.purchaseCostWithSt}
                                onValueChange={(v) => update(line.key, { purchaseCostWithSt: v })}
                              />
                            ) : null}
                          </div>
                        </div>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              );
            })}
            <Button type="button" variant="outline" size="sm" onClick={() => setLines((prev) => [...prev, emptyLine()])}>
              <Plus aria-hidden />
              Adicionar produto
            </Button>
          </div>

          <FormInput
            label="Observação (opcional)"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        </SheetBody>
        <SheetFooter className="flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-[var(--muted-foreground)]">
            <span className="font-semibold tabular-nums text-[var(--foreground)]">{formatUnits(summary.units)} un</span>
            {summary.value != null && summary.units > 0 ? ` · ${formatMoneyBRL(summary.value)}` : ""}
          </p>
          <div className="flex items-center gap-2">
            {error ? <span className="text-sm text-[var(--destructive)]">{error}</span> : null}
            <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
              Cancelar
            </Button>
            <Button onClick={() => void submit()} disabled={saving}>
              {saving ? "Registrando…" : "Registrar entrada"}
            </Button>
          </div>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
