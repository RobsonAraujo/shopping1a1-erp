"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ClipboardCheck, Plus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { FormSelect } from "@/components/ui/form-select";
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
import { readApiError } from "@/lib/api/api-client-error";
import { formatMoneyBRL } from "@/lib/format-money";
import type { StockCountSummary } from "@/lib/stock/stock-counts";
import { formatDateTime, formatUnits } from "@/components/stock/stock-format";

const STATUS = {
  counting: { label: "Em contagem", variant: "warning" },
  approved: { label: "Aprovado", variant: "success" },
  cancelled: { label: "Cancelado", variant: "muted" },
} as const;

export function StockCountsView({ counts, suppliers }: { counts: StockCountSummary[]; suppliers: string[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [supplier, setSupplier] = useState("__all");
  const [onlyWithStock, setOnlyWithStock] = useState(true);
  const [blind, setBlind] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function create() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/stock/counts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ supplierName: supplier === "__all" ? null : supplier, onlyWithStock, blind }),
      });
      if (!res.ok) {
        setError(await readApiError(res, "stock_action_failed"));
        return;
      }
      const json = (await res.json()) as { countId: string };
      router.push(`/dashboard/inventory/inventario/${json.countId}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-2xl text-sm text-[var(--muted-foreground)]">
          Conferência física: imprima a folha, conte com a prancheta e digite o que encontrou. O ERP calcula as
          diferenças e, ao aprovar, corrige o estoque.
        </p>
        <Button onClick={() => setOpen(true)}>
          <Plus aria-hidden />
          Novo inventário
        </Button>
      </div>

      {counts.length === 0 ? (
        <Card className="flex flex-col items-center gap-3 rounded-2xl p-10 text-center">
          <span className="flex size-11 items-center justify-center rounded-full bg-[var(--primary)]/10 text-[var(--primary)]">
            <ClipboardCheck className="size-5" aria-hidden />
          </span>
          <p className="font-medium">Nenhum inventário ainda</p>
          <p className="max-w-md text-sm text-[var(--muted-foreground)]">
            O recomendado é um por mês. Conte num momento sem separação de pedidos (por exemplo, depois da coleta do
            dia): assim a folha bate com a prateleira.
          </p>
        </Card>
      ) : (
        <Card className="overflow-hidden rounded-2xl">
          <ul className="divide-y divide-[var(--border)]">
            {counts.map((c) => (
              <li key={c.id}>
                <Link
                  href={`/dashboard/inventory/inventario/${c.id}`}
                  className="flex flex-wrap items-center gap-3 px-4 py-3 hover:bg-[var(--accent)]/40"
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium">
                      Inventário de {formatDateTime(c.referenceAt)}
                      {c.supplierName ? ` · ${c.supplierName}` : ""}
                    </p>
                    <p className="text-xs text-[var(--muted-foreground)]">
                      {formatUnits(c.counted)} de {formatUnits(c.lines)} produtos contados
                      {c.divergences > 0
                        ? ` · ${c.divergences} com diferença (${formatMoneyBRL(c.divergenceValue)})`
                        : ""}
                      {c.blind ? " · contagem cega" : ""}
                    </p>
                  </div>
                  <Badge variant={STATUS[c.status].variant}>{STATUS[c.status].label}</Badge>
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent>
          <SheetHeader>
            <SheetTitle>Novo inventário</SheetTitle>
            <SheetDescription>
              A hora de agora vira a referência. Vendas depois dela continuam valendo quando você aprovar.
            </SheetDescription>
          </SheetHeader>
          <SheetBody className="space-y-4">
            <FormSelect
              label="Produtos"
              value={supplier}
              onValueChange={setSupplier}
              options={[{ value: "__all", label: "Todos os fornecedores" }, ...suppliers.map((s) => ({ value: s, label: s }))]}
            />
            <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-[var(--border)] p-3">
              <Switch checked={onlyWithStock} onCheckedChange={(v) => setOnlyWithStock(v === true)} className="mt-0.5" />
              <span className="text-sm">
                <span className="font-medium">Só produtos com estoque em casa</span>
                <span className="block text-[var(--muted-foreground)]">Desligado, entram também os zerados.</span>
              </span>
            </label>
            <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-[var(--border)] p-3">
              <Switch checked={blind} onCheckedChange={(v) => setBlind(v === true)} className="mt-0.5" />
              <span className="text-sm">
                <span className="font-medium">Contagem cega</span>
                <span className="block text-[var(--muted-foreground)]">
                  A folha sai sem a quantidade do sistema: quem conta anota o que vê, sem se influenciar.
                </span>
              </span>
            </label>
            {error ? <p className="text-sm text-[var(--destructive)]">{error}</p> : null}
          </SheetBody>
          <SheetFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={busy}>
              Cancelar
            </Button>
            <Button onClick={() => void create()} disabled={busy}>
              {busy ? "Criando…" : "Criar e abrir"}
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </div>
  );
}
