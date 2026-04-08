"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useId, useState } from "react";
import { ImageOff, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export type InventoryRow = {
  mlItemId: string;
  title: string;
  imageUrl?: string;
  mlStock: number;
  warehouseStock: number;
};

type InventoryStockTableProps = {
  rows: InventoryRow[];
};

export function InventoryStockTable({ rows }: InventoryStockTableProps) {
  const router = useRouter();
  const [editId, setEditId] = useState<string | null>(null);
  const editing = editId
    ? rows.find((r) => r.mlItemId === editId) ?? null
    : null;

  return (
    <>
      <Card className="overflow-hidden p-0 shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[44rem] text-left text-sm">
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
                  Ações
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td
                    colSpan={5}
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
                          <span className="min-w-0 flex-1 font-medium leading-snug text-[var(--foreground)]">
                            {row.title}
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
                      <td className="align-middle px-4 py-3.5">
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
    </>
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
      const res = await fetch(`/api/inventory/${encodeURIComponent(row.mlItemId)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ quantity: n }),
      });
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
      <div
        className="fixed inset-0 bg-black/50"
        aria-hidden
      />
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
        <p className="mt-3 text-sm font-medium text-[var(--foreground)] line-clamp-2">
          {row.title}
        </p>

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
