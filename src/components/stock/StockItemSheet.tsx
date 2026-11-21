"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
import { EXIT_REASON_OPTIONS } from "@/lib/stock/stock-exit";
import { formatMoneyBRLOrDash } from "@/lib/format-money";
import type { StockItemDetail, StockPositionRow } from "@/lib/stock/stock-page-data";
import {
  formatAgo,
  formatDate,
  formatDateTime,
  formatSignedUnits,
  formatUnits,
  listingTypeLabel,
  todayYmd,
} from "@/components/stock/stock-format";

const LOT_STATUS_LABEL = { active: "Vigente", queued: "Na fila", depleted: "Esgotado" } as const;

type Mode = "view" | "adjust" | "out" | "return" | "lead";

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-lg bg-[var(--muted)]/30 p-3">
      <p className="text-xs text-[var(--muted-foreground)]">{label}</p>
      <p className="text-lg font-semibold tabular-nums text-[var(--foreground)]">{value}</p>
      {hint ? <p className="text-[11px] text-[var(--muted-foreground)]">{hint}</p> : null}
    </div>
  );
}

/**
 * Gaveta do produto: saldos, lotes de custo, extrato e ações (ajuste, saída —
 * envio ao Full é o padrão —, voltou do Full, prazo de compra). Abre a partir
 * da tabela de posição.
 */
export function StockItemSheet({
  row,
  onOpenChange,
}: {
  row: StockPositionRow | null;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const [detail, setDetail] = useState<StockItemDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [mode, setMode] = useState<Mode>("view");
  const [qty, setQty] = useState("");
  const [direction, setDirection] = useState<"+" | "-">("-");
  const [reason, setReason] = useState("");
  const [note, setNote] = useState("");
  const [leadDays, setLeadDays] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const stockItemId = row?.stockItemId ?? null;

  useEffect(() => {
    if (!stockItemId) return;
    let cancelled = false;
    setLoading(true);
    setDetail(null);
    setMode("view");
    setError(null);
    fetch(`/api/stock/items/${stockItemId}`)
      .then(async (res) => {
        if (!res.ok) throw new Error(await readApiError(res, "stock_action_failed"));
        return (await res.json()) as StockItemDetail;
      })
      .then((data) => {
        if (!cancelled) setDetail(data);
      })
      .catch((e: unknown) => {
        if (!cancelled) setError(e instanceof Error ? e.message : "Erro ao carregar");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [stockItemId]);

  function openMode(next: Mode) {
    setMode(next);
    setQty("");
    setReason(next === "out" ? "envio_full" : "");
    setNote("");
    setDirection("-");
    setLeadDays(row?.leadTimeDays != null ? String(row.leadTimeDays) : "");
    setError(null);
  }

  async function save() {
    if (!row) return;
    setSaving(true);
    setError(null);
    try {
      let res: Response;
      if (mode === "lead") {
        const days = leadDays.trim() === "" ? null : Math.max(0, Math.round(Number(leadDays)));
        res = await fetch(`/api/stock/items/${row.stockItemId}/lead-time`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ purchaseLeadTimeDays: days }),
        });
      } else {
        const units = Math.round(Number(qty));
        if (!Number.isFinite(units) || units <= 0) {
          setError("Informe a quantidade.");
          return;
        }
        if (mode === "adjust" && !reason.trim()) {
          setError("Informe o motivo.");
          return;
        }
        res =
          mode === "out"
            ? await fetch("/api/stock/exits", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  reason,
                  occurredOn: todayYmd(),
                  note: note.trim() || null,
                  lines: [{ stockItemId: row.stockItemId, quantity: units }],
                }),
              })
            : await fetch(`/api/stock/items/${row.stockItemId}/adjust`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  kind: mode === "return" ? "full_return" : "adjustment",
                  quantity: mode === "adjust" && direction === "-" ? -units : units,
                  reason: mode === "return" ? "Voltou do Full" : reason.trim(),
                  note: note.trim() || null,
                }),
              });
      }
      if (!res.ok) {
        setError(await readApiError(res, "stock_action_failed"));
        return;
      }
      onOpenChange(false);
      router.refresh();
    } finally {
      setSaving(false);
    }
  }

  return (
    <Sheet open={row != null} onOpenChange={onOpenChange}>
      <SheetContent className="sm:max-w-2xl">
        {row ? (
          <>
            <SheetHeader>
              <SheetTitle className="pr-8">{row.title}</SheetTitle>
              <SheetDescription>
                {row.sku ?? "Sem SKU"} · {row.supplierName}
              </SheetDescription>
              <div className="mt-2 flex flex-wrap gap-1">
                {row.listings.map((l) => (
                  <Link key={l.mlItemId} href={`/dashboard/items/${l.mlItemId}`}>
                    <Badge variant={l.registered ? "outline" : "muted"} className="font-normal hover:bg-[var(--accent)]">
                      {listingTypeLabel(l.listingTypeId)} · {l.mlItemId}
                      {l.registered ? "" : " · sem cadastro"}
                    </Badge>
                  </Link>
                ))}
              </div>
            </SheetHeader>
            <SheetBody className="space-y-5">
              <section>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  <Stat label="Em casa" value={formatUnits(row.own)} hint="galpão + depósito" />
                  <Stat label="Galpão" value={formatUnits(row.warehouse)} hint="não separado" />
                  <Stat label="Depósito (ML)" value={formatUnits(row.deposit)} hint="separado p/ venda" />
                  <Stat
                    label="Full"
                    value={formatUnits(row.fullTotal)}
                    hint={
                      row.fullUnavailable
                        ? `${formatUnits(row.fullAvailable)} disponível · ${formatUnits(row.fullUnavailable)} em transferência`
                        : "disponível"
                    }
                  />
                </div>
                <p className="mt-2 text-xs text-[var(--muted-foreground)]">
                  Depósito e Full lidos do Mercado Livre {formatAgo(row.mlReadAt)}.
                </p>
              </section>

              {mode === "view" ? (
                <div className="flex flex-wrap gap-2">
                  <Button variant="outline" size="sm" onClick={() => openMode("adjust")}>
                    Ajustar saldo
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => openMode("out")}>
                    Registrar saída
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => openMode("return")}>
                    Voltou do Full
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => openMode("lead")}>
                    Prazo de compra: {row.leadTimeDays != null ? `${row.leadTimeDays} dias` : "não definido"}
                  </Button>
                </div>
              ) : (
                <section className="space-y-3 rounded-lg border border-[var(--border)] p-4">
                  {mode === "lead" ? (
                    <>
                      <p className="text-sm font-medium">Prazo da compra até chegar no galpão</p>
                      <FormInput
                        label="Dias"
                        type="number"
                        min={0}
                        max={365}
                        value={leadDays}
                        onChange={(e) => setLeadDays(e.target.value)}
                      />
                      <p className="text-xs text-[var(--muted-foreground)]">
                        Usado pelo Compras e pelo Kanban para avisar a hora de comprar.
                      </p>
                    </>
                  ) : (
                    <>
                      <p className="text-sm font-medium">
                        {mode === "adjust"
                          ? "Ajustar o saldo Em casa"
                          : mode === "return"
                            ? "Voltou do Full"
                            : "Registrar saída"}
                      </p>
                      {mode === "adjust" ? (
                        <div className="flex gap-2">
                          <Button
                            type="button"
                            size="sm"
                            variant={direction === "+" ? "default" : "outline"}
                            onClick={() => setDirection("+")}
                          >
                            + Entrou
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant={direction === "-" ? "default" : "outline"}
                            onClick={() => setDirection("-")}
                          >
                            − Saiu
                          </Button>
                        </div>
                      ) : null}
                      <div className="grid gap-3 sm:grid-cols-2">
                        <FormInput
                          label="Quantidade"
                          type="number"
                          min={1}
                          value={qty}
                          onChange={(e) => setQty(e.target.value)}
                        />
                        {mode === "out" ? (
                          <FormSelect label="Motivo" value={reason} onValueChange={setReason} options={EXIT_REASON_OPTIONS} />
                        ) : mode === "adjust" ? (
                          <FormInput
                            label="Motivo"
                            placeholder="Ex.: correção de contagem"
                            value={reason}
                            onChange={(e) => setReason(e.target.value)}
                          />
                        ) : null}
                      </div>
                      <FormInput
                        label="Observação (opcional)"
                        value={note}
                        onChange={(e) => setNote(e.target.value)}
                      />
                      <p className="text-xs text-[var(--muted-foreground)]">
                        {mode === "out" && reason === "envio_full"
                          ? "Sai do Em casa agora. No Full, aparece sozinho quando o Mercado Livre receber."
                          : mode === "return"
                            ? "Mercadoria que voltou do Full para casa: soma ao Em casa sem mexer no custo. Serve também para desfazer um envio lançado por engano."
                            : "Vira uma movimentação no extrato, com data e motivo. Para entrada de compra, use \"Registrar entrada\"."}
                      </p>
                    </>
                  )}
                  {error ? <p className="text-sm text-[var(--destructive)]">{error}</p> : null}
                  <div className="flex justify-end gap-2">
                    <Button variant="ghost" size="sm" onClick={() => setMode("view")} disabled={saving}>
                      Cancelar
                    </Button>
                    <Button size="sm" onClick={() => void save()} disabled={saving}>
                      {saving ? "Salvando…" : "Salvar"}
                    </Button>
                  </div>
                </section>
              )}

              <section>
                <h3 className="text-sm font-semibold">Lotes de custo</h3>
                <p className="mb-2 text-xs text-[var(--muted-foreground)]">
                  O primeiro que entra é o primeiro que sai: o custo vigente só muda quando o lote dele acaba.
                </p>
                {loading ? (
                  <Loader2 className="size-4 animate-spin text-[var(--muted-foreground)]" aria-label="Carregando" />
                ) : detail && detail.lots.length > 0 ? (
                  <ul className="divide-y divide-[var(--border)] rounded-lg border border-[var(--border)] text-sm">
                    {detail.lots.map((lot) => (
                      <li key={lot.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
                        <span className="flex items-center gap-2">
                          <Badge variant={lot.status === "active" ? "success" : "muted"}>
                            {LOT_STATUS_LABEL[lot.status]}
                          </Badge>
                          <span className="text-[var(--muted-foreground)]">
                            {lot.entryId ? `Entrada de ${formatDate(lot.receivedAt)}` : `Saldo inicial · ${formatDate(lot.receivedAt)}`}
                          </span>
                        </span>
                        <span className="text-right tabular-nums">
                          {lot.status === "depleted"
                            ? `${formatUnits(lot.quantity)} un`
                            : `restam ${formatUnits(Math.max(0, lot.quantity - lot.consumedQty))} de ${formatUnits(lot.quantity)} un`}{" "}
                          · {formatMoneyBRLOrDash(lot.unitCost)}/un
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-sm text-[var(--muted-foreground)]">Sem lotes.</p>
                )}
              </section>

              <section>
                <h3 className="mb-2 text-sm font-semibold">Últimas movimentações</h3>
                {loading ? null : detail && detail.movements.length > 0 ? (
                  <ul className="divide-y divide-[var(--border)] rounded-lg border border-[var(--border)] text-sm">
                    {detail.movements.map((m) => (
                      <li key={m.id} className="flex items-center justify-between gap-3 px-3 py-2">
                        <span className="min-w-0">
                          <span className="font-medium">{m.typeLabel}</span>
                          {m.channelLabel ? (
                            <span className="text-[var(--muted-foreground)]"> · {m.channelLabel}</span>
                          ) : null}
                          {m.location === "full" ? (
                            <span className="text-[var(--muted-foreground)]"> · no Full</span>
                          ) : null}
                          <span className="block text-xs text-[var(--muted-foreground)]">
                            {formatDateTime(m.occurredAt)}
                            {m.reason ? ` · ${m.reason}` : ""}
                          </span>
                        </span>
                        <span
                          className={
                            m.location === "full"
                              ? "shrink-0 tabular-nums text-[var(--muted-foreground)]"
                              : m.quantity > 0
                                ? "shrink-0 font-medium tabular-nums text-emerald-700 dark:text-emerald-400"
                                : "shrink-0 font-medium tabular-nums"
                          }
                        >
                          {formatSignedUnits(m.quantity)}
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-sm text-[var(--muted-foreground)]">Nenhuma movimentação ainda.</p>
                )}
                <Link
                  href={`/dashboard/inventory/movimentacoes?item=${row.stockItemId}`}
                  className="mt-2 inline-block text-xs font-medium text-[var(--primary)] underline-offset-2 hover:underline"
                >
                  Ver extrato completo
                </Link>
              </section>
            </SheetBody>
            <SheetFooter>
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                Fechar
              </Button>
            </SheetFooter>
          </>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}
