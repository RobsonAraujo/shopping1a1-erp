"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useId, useState } from "react";
import { HelpCircle, ImageOff, Pencil, Settings } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

const MAX_LEAD_DAYS = 365;

export type InventoryRow = {
  mlItemId: string;
  sku: string | null;
  title: string;
  imageUrl?: string;
  mlStock: number;
  warehouseStock: number;
  leadTimeDays: number | null;
  needsPurchaseAttention: boolean;
};

type InventoryStockTableProps = {
  rows: InventoryRow[];
};

function formatLeadTimeDisplay(days: number | null): string {
  if (days === null) return "—";
  if (days === 0) return "0 d";
  if (days % 7 === 0) return `${days / 7} sem.`;
  return `${days} d`;
}

function leadTimeToForm(days: number | null): {
  value: string;
  unit: "weeks" | "days";
} {
  if (days === null || days === 0) return { value: "", unit: "weeks" };
  if (days % 7 === 0) return { value: String(days / 7), unit: "weeks" };
  return { value: String(days), unit: "days" };
}

export function InventoryStockTable({ rows }: InventoryStockTableProps) {
  const router = useRouter();
  const [editId, setEditId] = useState<string | null>(null);
  const [settingsId, setSettingsId] = useState<string | null>(null);
  const editing = editId
    ? (rows.find((r) => r.mlItemId === editId) ?? null)
    : null;
  const settingsRow = settingsId
    ? (rows.find((r) => r.mlItemId === settingsId) ?? null)
    : null;

  return (
    <TooltipProvider delayDuration={200}>
      <Card className="overflow-hidden p-0 shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[52rem] text-left text-sm">
            <thead className="border-b border-[var(--border)] bg-[var(--muted)]/80">
              <tr>
                <th className="px-4 py-3.5 text-xs font-semibold uppercase tracking-wide text-[var(--muted-foreground)]">
                  Produto
                </th>
                <th className="px-4 py-3.5 text-xs font-semibold uppercase tracking-wide text-[var(--muted-foreground)]">
                  Galpão
                </th>
                <th className="px-4 py-3.5 text-xs font-semibold uppercase tracking-wide text-[var(--muted-foreground)]">
                  Mercado Livre
                </th>
                <th className="px-4 py-3.5 text-xs font-semibold uppercase tracking-wide text-[var(--muted-foreground)]">
                  Total
                </th>
                <th className="px-4 py-3.5 text-xs font-semibold uppercase tracking-wide text-[var(--muted-foreground)]">
                  <span className="inline-flex items-center gap-1">
                    Prazo compra
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <button
                          type="button"
                          className="inline-flex cursor-pointer rounded text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
                          aria-label="Informação sobre prazo de compra"
                        >
                          <HelpCircle className="size-3.5" />
                        </button>
                      </TooltipTrigger>
                      <TooltipContent side="top" className="max-w-xs">
                        Tempo entre decidir comprar e o produto chegar no
                        galpão. Usado para planejamento futuro.
                      </TooltipContent>
                    </Tooltip>
                  </span>
                </th>
                <th className="px-4 py-3.5 text-xs font-semibold uppercase tracking-wide text-[var(--muted-foreground)]">
                  Ações
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td
                    colSpan={6}
                    className="px-4 py-12 text-center text-[var(--muted-foreground)]"
                  >
                    Nenhum anúncio ativo nesta página.
                  </td>
                </tr>
              ) : (
                rows.map((row) => {
                  const total = row.warehouseStock + row.mlStock;
                  return (
                    <tr
                      key={row.mlItemId}
                      className="border-b border-[var(--border)] transition-colors last:border-0 hover:bg-[var(--muted)]/40"
                    >
                      <td className="align-middle px-4 py-3.5">
                        <div className="flex gap-3">
                          <span
                            className="relative shrink-0 overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--muted)]"
                            aria-hidden
                          >
                            {row.imageUrl ? (
                              <Image
                                src={row.imageUrl}
                                alt=""
                                width={128}
                                height={128}
                                className="size-12 object-contain sm:size-14"
                                sizes="56px"
                              />
                            ) : (
                              <span className="flex size-12 items-center justify-center sm:size-14">
                                <ImageOff
                                  className="size-5 text-[var(--muted-foreground)]/60"
                                  aria-hidden
                                />
                              </span>
                            )}
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="flex items-center gap-2">
                              <span
                                className="block truncate font-semibold leading-snug text-[var(--foreground)]"
                                title={row.title}
                              >
                                {row.sku ?? "Sem SKU"}
                              </span>
                              {row.needsPurchaseAttention ? (
                                <Badge variant="warning" className="h-5 px-1.5 text-[10px]">
                                  Comprar
                                </Badge>
                              ) : null}
                            </span>
                            <span
                              className="mt-0.5 block text-xs leading-snug text-[var(--muted-foreground)]"
                              title={row.title}
                            >
                              {row.title}
                            </span>
                          </span>
                        </div>
                      </td>
                      <td className="align-middle px-4 py-3.5 tabular-nums">
                        {row.warehouseStock}
                      </td>
                      <td className="align-middle px-4 py-3.5 tabular-nums">
                        {row.mlStock}
                      </td>
                      <td className="align-middle px-4 py-3.5 tabular-nums font-medium">
                        {total}
                      </td>
                      <td className="align-middle px-4 py-3.5 tabular-nums text-[var(--muted-foreground)]">
                        {formatLeadTimeDisplay(row.leadTimeDays)}
                      </td>
                      <td className="align-middle px-4 py-3.5">
                        <div className="flex flex-wrap gap-2">
                          <Button
                            type="button"
                            variant="outline"
                            size="icon-sm"
                            className="shrink-0"
                            title="Configurações do anúncio"
                            aria-label="Configurações do anúncio"
                            onClick={() => setSettingsId(row.mlItemId)}
                          >
                            <Settings className="size-4" aria-hidden />
                          </Button>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="gap-1.5"
                            onClick={() => setEditId(row.mlItemId)}
                          >
                            <Pencil className="size-3.5" aria-hidden />
                            Editar
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {editing ? (
        <WarehouseEditModal
          row={editing}
          onClose={() => setEditId(null)}
          onSaved={() => {
            setEditId(null);
            router.refresh();
          }}
        />
      ) : null}

      {settingsRow ? (
        <LeadTimeSettingsModal
          key={settingsRow.mlItemId}
          row={settingsRow}
          onClose={() => setSettingsId(null)}
          onSaved={() => {
            setSettingsId(null);
            router.refresh();
          }}
        />
      ) : null}
    </TooltipProvider>
  );
}

function WarehouseEditModal({
  row,
  onClose,
  onSaved,
}: {
  row: InventoryRow;
  onClose: () => void;
  onSaved: () => void;
}) {
  const labelId = useId();
  const descId = useId();
  const [value, setValue] = useState(String(row.warehouseStock));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleBackdrop = useCallback(
    (e: React.MouseEvent) => {
      if (e.target === e.currentTarget) onClose();
    },
    [onClose],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function submit() {
    const n = parseInt(value, 10);
    if (!Number.isInteger(n) || n < 0) {
      setError("Informe um número inteiro maior ou igual a zero.");
      return;
    }
    setError(null);
    setSaving(true);
    try {
      const res = await fetch(
        `/api/inventory/${encodeURIComponent(row.mlItemId)}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ quantity: n }),
        },
      );
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setError(data.error ?? "Não foi possível salvar.");
        return;
      }
      onSaved();
    } catch {
      setError("Falha de rede. Tente de novo.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      role="presentation"
      onClick={handleBackdrop}
    >
      <div className="fixed inset-0 bg-black/50" aria-hidden />
      <div
        className={cn(
          "relative z-10 w-full max-w-md rounded-xl border border-[var(--border)] bg-[var(--card)] p-6 shadow-lg",
        )}
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelId}
        aria-describedby={descId}
        onClick={(e) => e.stopPropagation()}
      >
        <h2
          id={labelId}
          className="text-lg font-semibold text-[var(--primary)]"
        >
          Estoque no galpão
        </h2>
        <p
          id={descId}
          className="mt-2 text-sm leading-relaxed text-[var(--muted-foreground)]"
        >
          Ajuste apenas a quantidade física no galpão. O estoque no Mercado
          Livre vem da API do ML e não é alterado aqui.
        </p>
        <div className="mt-3">
          <p className="text-sm font-semibold text-[var(--foreground)]">
            {row.sku ?? "Sem SKU"}
          </p>
          <p
            className="text-xs text-[var(--muted-foreground)] line-clamp-2"
            title={row.title}
          >
            {row.title}
          </p>
        </div>

        <label
          htmlFor="warehouse-qty"
          className="mt-4 block text-sm font-medium text-[var(--foreground)]"
        >
          Quantidade no galpão
        </label>
        <input
          id="warehouse-qty"
          type="number"
          inputMode="numeric"
          min={0}
          step={1}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          className="mt-1.5 w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm tabular-nums text-[var(--foreground)] shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
        />

        {error ? (
          <p className="mt-2 text-sm text-red-600" role="alert">
            {error}
          </p>
        ) : null}

        <div className="mt-6 flex flex-wrap justify-end gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={onClose}
            disabled={saving}
          >
            Cancelar
          </Button>
          <Button type="button" onClick={() => void submit()} disabled={saving}>
            {saving ? "Salvando…" : "Confirmar"}
          </Button>
        </div>
      </div>
    </div>
  );
}

function LeadTimeSettingsModal({
  row,
  onClose,
  onSaved,
}: {
  row: InventoryRow;
  onClose: () => void;
  onSaved: () => void;
}) {
  const labelId = useId();
  const descId = useId();
  const initial = leadTimeToForm(row.leadTimeDays);
  const [value, setValue] = useState(initial.value);
  const [unit, setUnit] = useState<"weeks" | "days">(initial.unit);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const i = leadTimeToForm(row.leadTimeDays);
    setValue(i.value);
    setUnit(i.unit);
  }, [row.mlItemId, row.leadTimeDays]);

  const handleBackdrop = useCallback(
    (e: React.MouseEvent) => {
      if (e.target === e.currentTarget) onClose();
    },
    [onClose],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function submit() {
    const trimmed = value.trim();
    let purchaseLeadTimeDays: number | null;
    if (trimmed === "") {
      purchaseLeadTimeDays = null;
    } else {
      const n = parseInt(trimmed, 10);
      if (!Number.isInteger(n) || n < 0) {
        setError("Informe um número inteiro maior ou igual a zero.");
        return;
      }
      const days = unit === "weeks" ? n * 7 : n;
      if (days > MAX_LEAD_DAYS) {
        setError(`O prazo total não pode passar de ${MAX_LEAD_DAYS} dias.`);
        return;
      }
      purchaseLeadTimeDays = days;
    }

    setError(null);
    setSaving(true);
    try {
      const res = await fetch(
        `/api/inventory/${encodeURIComponent(row.mlItemId)}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            quantity: row.warehouseStock,
            purchaseLeadTimeDays,
          }),
        },
      );
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setError(data.error ?? "Não foi possível salvar.");
        return;
      }
      onSaved();
    } catch {
      setError("Falha de rede. Tente de novo.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      role="presentation"
      onClick={handleBackdrop}
    >
      <div className="fixed inset-0 bg-black/50" aria-hidden />
      <div
        className={cn(
          "relative z-10 w-full max-w-md rounded-xl border border-[var(--border)] bg-[var(--card)] p-6 shadow-lg",
        )}
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelId}
        aria-describedby={descId}
        onClick={(e) => e.stopPropagation()}
      >
        <h2
          id={labelId}
          className="text-lg font-semibold text-[var(--primary)]"
        >
          Configurações do anúncio
        </h2>
        <p
          id={descId}
          className="mt-2 text-sm leading-relaxed text-[var(--muted-foreground)]"
        >
          Ajuste o tempo entre decidir a compra e o produto chegar no galpão.
        </p>
        <div className="mt-3">
          <p className="text-sm font-semibold text-[var(--foreground)]">
            {row.sku ?? "Sem SKU"}
          </p>
          <p
            className="text-xs text-[var(--muted-foreground)] line-clamp-2"
            title={row.title}
          >
            {row.title}
          </p>
        </div>

        <div className="mt-4 space-y-2">
          <div className="flex items-center gap-2">
            <label
              htmlFor="lead-time-value"
              className="text-sm font-medium text-[var(--foreground)]"
            >
              Prazo até o galpão
            </label>
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  className="inline-flex cursor-pointer rounded text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
                  aria-label="O que é este prazo?"
                >
                  <HelpCircle className="size-4" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="top" className="max-w-xs">
                Tempo desde que você decide comprar até a mercadoria chegar no
                galpão. O valor é salvo em dias (se escolher semanas,
                convertemos automaticamente).
              </TooltipContent>
            </Tooltip>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <input
              id="lead-time-value"
              type="number"
              inputMode="numeric"
              min={0}
              step={1}
              placeholder="Ex.: 2"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              className="min-w-0 flex-1 rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm tabular-nums text-[var(--foreground)] shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
            />
            <select
              id="lead-time-unit"
              value={unit}
              onChange={(e) =>
                setUnit(e.target.value === "weeks" ? "weeks" : "days")
              }
              className="rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm text-[var(--foreground)] shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
              aria-label="Unidade do prazo"
            >
              <option value="weeks">Semanas</option>
              <option value="days">Dias</option>
            </select>
          </div>
          <p className="text-xs text-[var(--muted-foreground)]">
            Informe em semanas ou em dias; o sistema grava em dias para cálculos
            futuros. Deixe em branco para remover o prazo.
          </p>
        </div>

        {error ? (
          <p className="mt-2 text-sm text-red-600" role="alert">
            {error}
          </p>
        ) : null}

        <div className="mt-6 flex flex-wrap justify-end gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={onClose}
            disabled={saving}
          >
            Cancelar
          </Button>
          <Button type="button" onClick={() => void submit()} disabled={saving}>
            {saving ? "Salvando…" : "Confirmar"}
          </Button>
        </div>
      </div>
    </div>
  );
}
