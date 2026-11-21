"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Info, Minus, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Combobox } from "@/components/ui/combobox";
import { DatePicker } from "@/components/ui/date-picker";
import { FormInput } from "@/components/ui/form-input";
import { FormSelect } from "@/components/ui/form-select";
import {
  Sheet,
  SheetBody,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { readApiError } from "@/lib/api/api-client-error";
import { EXIT_REASON_OPTIONS, EXIT_REASONS, type ExitReason } from "@/lib/stock/stock-exit";
import { formatUnits, todayYmd } from "@/components/stock/stock-format";

export type StockExitItemOption = {
  stockItemId: string;
  title: string;
  sku: string | null;
  ownQty: number;
};

type Line = { key: number; stockItemId: string; quantity: string };

let nextKey = 1;
const emptyLine = (stockItemId = ""): Line => ({ key: nextKey++, stockItemId, quantity: "" });

/**
 * "Registrar saída": mandou mercadoria para o Full (padrão), perdeu, deu de
 * brinde… Escolhe os produtos e a quantidade, e pronto. Envio ao Full só tira
 * do Em casa (o Full sobe sozinho no ML quando chega); os outros motivos tiram
 * do estoque de vez.
 */
export function StockExitForm({
  open,
  onOpenChange,
  items,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  items: StockExitItemOption[];
}) {
  const router = useRouter();
  const [reason, setReason] = useState<ExitReason>("envio_full");
  const [occurredOn, setOccurredOn] = useState(todayYmd());
  const [note, setNote] = useState("");
  const [lines, setLines] = useState<Line[]>(() => [emptyLine()]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const itemById = useMemo(() => new Map(items.map((i) => [i.stockItemId, i])), [items]);
  const options = useMemo(
    () => items.map((i) => ({ value: i.stockItemId, label: i.sku ? `${i.sku} · ${i.title}` : i.title })),
    [items],
  );
  const totalUnits = lines.reduce((sum, l) => sum + Math.max(0, Math.round(Number(l.quantity) || 0)), 0);

  function update(key: number, patch: Partial<Line>) {
    setLines((prev) => prev.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  }

  function reset() {
    setReason("envio_full");
    setOccurredOn(todayYmd());
    setNote("");
    setLines([emptyLine()]);
    setError(null);
  }

  async function submit() {
    setError(null);
    const filled = lines.filter((l) => l.stockItemId || l.quantity);
    const valid = filled.filter((l) => l.stockItemId && Math.round(Number(l.quantity)) > 0);
    if (valid.length === 0 || valid.length !== filled.length) {
      setError("Escolha o produto e a quantidade de cada linha.");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/stock/exits", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          reason,
          occurredOn,
          note: note.trim() || null,
          lines: valid.map((l) => ({ stockItemId: l.stockItemId, quantity: Math.round(Number(l.quantity)) })),
        }),
      });
      if (!res.ok) {
        setError(await readApiError(res, "stock_action_failed"));
        return;
      }
      toast.success(`${EXIT_REASONS[reason]}: ${formatUnits(totalUnits)} un registradas.`);
      reset();
      onOpenChange(false);
      router.refresh();
    } finally {
      setSaving(false);
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="sm:max-w-2xl">
        <SheetHeader>
          <SheetTitle>Registrar saída</SheetTitle>
          <SheetDescription>
            {reason === "envio_full"
              ? "Sai do Em casa agora. No Full, a mercadoria aparece sozinha quando o Mercado Livre recebe."
              : "Sai do estoque de vez (com o custo do lote vigente)."}
          </SheetDescription>
        </SheetHeader>
        <SheetBody className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <FormSelect
              label="Motivo"
              value={reason}
              onValueChange={(v) => setReason(v as ExitReason)}
              options={EXIT_REASON_OPTIONS}
            />
            <DatePicker label="Data" valueYmd={occurredOn} onChange={setOccurredOn} />
          </div>

          <div className="space-y-2">
            {lines.map((line, index) => {
              const item = line.stockItemId ? itemById.get(line.stockItemId) : undefined;
              const qty = Math.round(Number(line.quantity) || 0);
              const over = item != null && qty > item.ownQty;
              return (
                <div key={line.key} className="rounded-xl border border-[var(--border)] p-3">
                  <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_120px_auto] sm:items-end">
                    <Combobox
                      label={index === 0 ? "Produto" : undefined}
                      aria-label="Produto"
                      className="min-w-0"
                      value={line.stockItemId}
                      onValueChange={(value) => update(line.key, { stockItemId: value })}
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
                  {item ? (
                    <p className={over ? "mt-2 flex items-center gap-1 text-xs text-amber-700 dark:text-amber-400" : "mt-2 text-xs text-[var(--muted-foreground)]"}>
                      {over ? <Info className="size-3.5" aria-hidden /> : null}
                      Em casa: {formatUnits(item.ownQty)} un
                      {over ? " · saindo mais do que o estoque mostra (confira, ou registre a entrada que faltou)" : ""}
                    </p>
                  ) : null}
                </div>
              );
            })}
            <Button type="button" variant="outline" size="sm" onClick={() => setLines((prev) => [...prev, emptyLine()])}>
              <Plus aria-hidden />
              Adicionar produto
            </Button>
          </div>

          <FormInput label="Observação (opcional)" value={note} onChange={(e) => setNote(e.target.value)} />
        </SheetBody>
        <SheetFooter className="flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="flex items-center gap-1 text-sm text-[var(--muted-foreground)]">
            <Minus className="size-3.5" aria-hidden />
            <span className="font-semibold tabular-nums text-[var(--foreground)]">{formatUnits(totalUnits)} un</span>
            {reason === "envio_full" ? " saindo para o Full" : " saindo do estoque"}
          </p>
          <div className="flex items-center gap-2">
            {error ? <span className="text-sm text-[var(--destructive)]">{error}</span> : null}
            <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
              Cancelar
            </Button>
            <Button onClick={() => void submit()} disabled={saving}>
              {saving ? "Registrando…" : "Registrar saída"}
            </Button>
          </div>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

/** Botão + formulário, para os topos de página. */
export function StockExitButton({ items, variant = "outline" }: { items: StockExitItemOption[]; variant?: "outline" | "default" }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant={variant} onClick={() => setOpen(true)}>
        <Minus aria-hidden />
        Registrar saída
      </Button>
      <StockExitForm open={open} onOpenChange={setOpen} items={items} />
    </>
  );
}
