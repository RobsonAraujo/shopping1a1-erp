"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, CheckCircle2, Printer } from "lucide-react";
import { toast } from "sonner";
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
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { FormInput } from "@/components/ui/form-input";
import { SegmentedTabs } from "@/components/ui/segmented-tabs";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { readApiError } from "@/lib/api/api-client-error";
import { formatMoneyBRL } from "@/lib/format-money";
import type { StockCountDetail } from "@/lib/stock/stock-counts";
import { formatDateTime, formatSignedUnits, formatUnits } from "@/components/stock/stock-format";
import { cn } from "@/lib/utils";

type Draft = Record<string, { counted: string; note: string }>;
type View = "all" | "pending" | "diff";

export function StockCountDetailView({ count, companyName }: { count: StockCountDetail; companyName: string }) {
  const router = useRouter();
  const editable = count.status === "counting";
  const [draft, setDraft] = useState<Draft>(() =>
    Object.fromEntries(
      count.lines.map((l) => [l.stockItemId, { counted: l.countedQty == null ? "" : String(l.countedQty), note: l.note ?? "" }]),
    ),
  );
  const [dirty, setDirty] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);
  const [view, setView] = useState<View>("all");
  const [confirm, setConfirm] = useState<"approve" | "cancel" | null>(null);
  const [busy, setBusy] = useState(false);
  const inputs = useRef(new Map<string, HTMLInputElement>());

  const lines = useMemo(
    () =>
      count.lines.map((l) => {
        const d = draft[l.stockItemId];
        const counted = d.counted.trim() === "" ? null : Math.max(0, Math.floor(Number(d.counted) || 0));
        const expected = l.expectedOwnQty + l.pendingShipmentQty;
        const diff = counted == null ? null : counted - expected;
        return { ...l, counted, expected, diff, value: diff == null || l.unitCost == null ? null : diff * l.unitCost };
      }),
    [count.lines, draft],
  );

  const summary = useMemo(() => {
    let counted = 0;
    let divergences = 0;
    let value = 0;
    let missing = 0;
    let surplus = 0;
    for (const l of lines) {
      if (l.counted == null) continue;
      counted += 1;
      if (l.diff && l.diff !== 0) {
        divergences += 1;
        value += l.value ?? 0;
        if (l.diff < 0) missing += -l.diff;
        else surplus += l.diff;
      }
    }
    return { counted, divergences, value, missing, surplus };
  }, [lines]);

  const visible = lines.filter((l) =>
    view === "pending" ? l.counted == null : view === "diff" ? l.diff != null && l.diff !== 0 : true,
  );

  // Salva sozinho 1,2 s depois da última digitação.
  useEffect(() => {
    if (!editable || dirty.size === 0) return;
    const id = window.setTimeout(() => void save(), 1200);
    return () => window.clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dirty, draft, editable]);

  async function save(): Promise<boolean> {
    if (dirty.size === 0) return true;
    const ids = [...dirty];
    setSaving(true);
    try {
      const res = await fetch(`/api/stock/counts/${count.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          lines: ids.map((id) => {
            const d = draft[id];
            return {
              stockItemId: id,
              countedQty: d.counted.trim() === "" ? null : Math.max(0, Math.floor(Number(d.counted) || 0)),
              note: d.note.trim() || null,
            };
          }),
        }),
      });
      if (!res.ok) {
        toast.error(await readApiError(res, "stock_action_failed"));
        return false;
      }
      setDirty((prev) => {
        const next = new Set(prev);
        for (const id of ids) next.delete(id);
        return next;
      });
      return true;
    } finally {
      setSaving(false);
    }
  }

  function edit(id: string, patch: Partial<{ counted: string; note: string }>) {
    setDraft((prev) => ({ ...prev, [id]: { ...prev[id], ...patch } }));
    setDirty((prev) => new Set(prev).add(id));
  }

  function focusNext(index: number) {
    const next = visible[index + 1];
    if (next) inputs.current.get(next.stockItemId)?.focus();
  }

  async function finish(action: "approve" | "cancel") {
    setBusy(true);
    try {
      if (action === "approve" && !(await save())) return;
      const res = await fetch(`/api/stock/counts/${count.id}/${action}`, { method: "POST" });
      if (!res.ok) {
        toast.error(await readApiError(res, "stock_action_failed"));
        return;
      }
      if (action === "approve") {
        const json = (await res.json()) as { adjusted: number };
        toast.success(
          json.adjusted > 0
            ? `Inventário aprovado: ${json.adjusted} produto${json.adjusted === 1 ? "" : "s"} ajustado${json.adjusted === 1 ? "" : "s"}.`
            : "Inventário aprovado: tudo bateu.",
        );
      } else {
        toast.success("Inventário cancelado.");
      }
      setConfirm(null);
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  async function printSheet() {
    const { downloadStockCountPdf } = await import("@/lib/stock/stock-count-pdf");
    downloadStockCountPdf(count, companyName);
  }

  const progress = count.lines.length > 0 ? Math.round((summary.counted / count.lines.length) * 100) : 0;

  return (
    <TooltipProvider delayDuration={200}>
      <div className="space-y-4">
        <Card className="rounded-2xl p-5">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-semibold">Inventário de {formatDateTime(count.referenceAt)}</h2>
                <Badge variant={count.status === "approved" ? "success" : count.status === "cancelled" ? "muted" : "warning"}>
                  {count.status === "approved" ? "Aprovado" : count.status === "cancelled" ? "Cancelado" : "Em contagem"}
                </Badge>
              </div>
              <p className="mt-1 text-sm text-[var(--muted-foreground)]">
                {count.supplierName ?? "Todos os fornecedores"} · {formatUnits(count.lines.length)} produtos
                {count.blind ? " · contagem cega" : ""}
                {count.approvedAt ? ` · aprovado em ${formatDateTime(count.approvedAt)}` : ""}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" onClick={() => void printSheet()}>
                <Printer aria-hidden />
                Imprimir folha
              </Button>
              {editable ? (
                <>
                  <Button variant="ghost" onClick={() => setConfirm("cancel")}>
                    Cancelar
                  </Button>
                  <Button onClick={() => setConfirm("approve")} disabled={summary.counted === 0}>
                    <CheckCircle2 aria-hidden />
                    Aprovar ajustes
                  </Button>
                </>
              ) : null}
            </div>
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-4">
            <div>
              <p className="text-xs text-[var(--muted-foreground)]">Contados</p>
              <p className="text-xl font-semibold tabular-nums">
                {formatUnits(summary.counted)} <span className="text-sm font-normal text-[var(--muted-foreground)]">de {formatUnits(count.lines.length)}</span>
              </p>
              <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-[var(--muted)]">
                <div className="h-full rounded-full bg-[var(--primary)]" style={{ width: `${progress}%` }} />
              </div>
            </div>
            <div>
              <p className="text-xs text-[var(--muted-foreground)]">Com diferença</p>
              <p className="text-xl font-semibold tabular-nums">{formatUnits(summary.divergences)}</p>
            </div>
            <div>
              <p className="text-xs text-[var(--muted-foreground)]">Faltando / sobrando</p>
              <p className="text-xl font-semibold tabular-nums">
                −{formatUnits(summary.missing)} / +{formatUnits(summary.surplus)}
              </p>
            </div>
            <div>
              <p className="text-xs text-[var(--muted-foreground)]">Impacto no valor</p>
              <p className={cn("text-xl font-semibold tabular-nums", summary.value < 0 && "text-[var(--destructive)]")}>
                {formatMoneyBRL(summary.value)}
              </p>
            </div>
          </div>
          {editable ? (
            <p className="mt-3 text-xs text-[var(--muted-foreground)]">
              {saving ? "Salvando…" : dirty.size > 0 ? "Alterações não salvas…" : "Tudo salvo."} Deixe em branco o que não
              foi contado: em branco é diferente de 0. Enter pula para o próximo produto.
            </p>
          ) : null}
        </Card>

        <SegmentedTabs
          tabs={[
            { id: "all", label: "Todos" },
            { id: "pending", label: "Não contados" },
            { id: "diff", label: "Com diferença" },
          ]}
          value={view}
          onValueChange={setView}
          baseId="count-view"
          ariaLabel="Filtrar linhas"
        />

        <Card className="overflow-hidden rounded-2xl">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-sm">
              <thead className="border-b border-[var(--border)] text-left text-xs text-[var(--muted-foreground)]">
                <tr>
                  <th className="w-12 px-4 py-2.5 text-right font-medium">Nº</th>
                  <th className="py-2.5 pr-3 font-medium">Produto</th>
                  <th className="py-2.5 pr-3 text-right font-medium">Sistema</th>
                  <th className="w-28 py-2.5 pr-3 text-right font-medium">Contado</th>
                  <th className="py-2.5 pr-3 text-right font-medium">Diferença</th>
                  <th className="py-2.5 pr-3 font-medium">Observação</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border)]">
                {visible.map((l, index) => (
                  <tr key={l.stockItemId} className={cn(l.diff != null && l.diff !== 0 && "bg-amber-500/[0.04]")}>
                    <td className="px-4 py-2 text-right tabular-nums text-[var(--muted-foreground)]">{l.position}</td>
                    <td className="py-2 pr-3">
                      <span className="line-clamp-1 font-medium">{l.title}</span>
                      <span className="text-xs text-[var(--muted-foreground)]">
                        {l.sku ?? "Sem SKU"} · {l.supplierName}
                      </span>
                      {l.salesAfterReference > 0 ? (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span className="ml-1 inline-flex items-center gap-0.5 text-xs text-amber-700 dark:text-amber-400">
                              <AlertTriangle className="size-3" aria-hidden />
                              confira
                            </span>
                          </TooltipTrigger>
                          <TooltipContent className="max-w-xs text-xs">
                            Saíram {formatUnits(l.salesAfterReference)} un de casa depois da impressão. Se elas foram
                            separadas antes da contagem, some-as ao contado: o ERP já baixou essas vendas.
                          </TooltipContent>
                        </Tooltip>
                      ) : null}
                    </td>
                    <td className="py-2 pr-3 text-right tabular-nums">
                      {formatUnits(l.expected)}
                      {l.pendingShipmentQty > 0 ? (
                        <span className="block text-[11px] text-[var(--muted-foreground)]">
                          inclui {formatUnits(l.pendingShipmentQty)} a enviar
                        </span>
                      ) : null}
                    </td>
                    <td className="py-2 pr-3">
                      <FormInput
                        ref={(node) => {
                          if (node) inputs.current.set(l.stockItemId, node);
                          else inputs.current.delete(l.stockItemId);
                        }}
                        type="number"
                        min={0}
                        inputMode="numeric"
                        aria-label={`Contado de ${l.title}`}
                        disabled={!editable}
                        value={draft[l.stockItemId].counted}
                        onChange={(e) => edit(l.stockItemId, { counted: e.target.value })}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            focusNext(index);
                          }
                        }}
                        className="ml-auto w-24 space-y-0"
                        inputClassName="h-9 text-right tabular-nums sm:h-9"
                      />
                    </td>
                    <td
                      className={cn(
                        "py-2 pr-3 text-right font-semibold tabular-nums",
                        l.diff != null && l.diff < 0 && "text-[var(--destructive)]",
                        l.diff != null && l.diff > 0 && "text-emerald-700 dark:text-emerald-400",
                      )}
                    >
                      {l.diff == null ? "—" : formatSignedUnits(l.diff)}
                      {l.value != null && l.diff !== 0 ? (
                        <span className="block text-[11px] font-normal text-[var(--muted-foreground)]">
                          {formatMoneyBRL(l.value)}
                        </span>
                      ) : null}
                    </td>
                    <td className="py-2 pr-3">
                      <FormInput
                        aria-label={`Observação de ${l.title}`}
                        disabled={!editable}
                        value={draft[l.stockItemId].note}
                        onChange={(e) => edit(l.stockItemId, { note: e.target.value })}
                        placeholder={editable ? "—" : ""}
                        className="space-y-0"
                        inputClassName="h-9 sm:h-9"
                      />
                    </td>
                  </tr>
                ))}
                {visible.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-10 text-center text-sm text-[var(--muted-foreground)]">
                      Nada neste filtro.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </Card>

        <AlertDialog open={confirm != null} onOpenChange={(o) => !o && setConfirm(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>{confirm === "approve" ? "Aprovar os ajustes?" : "Cancelar este inventário?"}</AlertDialogTitle>
              <AlertDialogDescription>
                {confirm === "approve"
                  ? `${summary.divergences} produto${summary.divergences === 1 ? "" : "s"} com diferença viram ajustes de estoque (−${formatUnits(summary.missing)} / +${formatUnits(summary.surplus)} un, ${formatMoneyBRL(summary.value)}). Os não contados ficam como estão. O inventário fica travado como registro.`
                  : "Nada muda no estoque. O que já foi digitado fica guardado, mas o inventário não pode mais ser aprovado."}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={busy}>Voltar</AlertDialogCancel>
              <AlertDialogAction disabled={busy} onClick={() => confirm && void finish(confirm)}>
                {confirm === "approve" ? "Aprovar" : "Cancelar inventário"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </TooltipProvider>
  );
}
