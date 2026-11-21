"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Combobox } from "@/components/ui/combobox";
import { DateRangePicker } from "@/components/ui/date-range-picker";
import { FormSelect } from "@/components/ui/form-select";
import type { StockMovementRow } from "@/lib/stock/stock-page-data";
import { MOVEMENT_GROUPS, type MovementGroup } from "@/lib/stock/stock-movement-groups";
import { formatDateTime, formatSignedUnits } from "@/components/stock/stock-format";
import { cn } from "@/lib/utils";



export function StockMovementsView({
  rows,
  items,
  filters,
  nextCursor,
}: {
  rows: StockMovementRow[];
  items: Array<{ stockItemId: string; title: string; sku: string | null }>;
  filters: { item: string; group: MovementGroup; location: string; from: string; to: string };
  nextCursor: string | null;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [exporting, setExporting] = useState(false);

  function setParam(patch: Record<string, string | null>) {
    const next = new URLSearchParams(searchParams.toString());
    next.delete("before");
    for (const [key, value] of Object.entries(patch)) {
      if (value) next.set(key, value);
      else next.delete(key);
    }
    router.push(`${pathname}?${next.toString()}`);
  }

  async function exportExcel() {
    setExporting(true);
    try {
      const XLSX = await import("xlsx");
      const sheet = XLSX.utils.json_to_sheet(
        rows.map((m) => ({
          Data: formatDateTime(m.occurredAt),
          Produto: m.itemTitle,
          SKU: m.itemSku ?? "",
          Tipo: m.typeLabel,
          Canal: m.channelLabel ?? "",
          Local: m.location === "full" ? "Full" : "Em casa",
          Quantidade: m.quantity,
          Anúncio: m.listingMlItemId ?? "",
          Origem: m.sourceId,
          Motivo: m.reason ?? "",
          Observação: m.note ?? "",
        })),
      );
      const book = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(book, sheet, "Movimentações");
      XLSX.writeFile(book, `estoque-movimentacoes.xlsx`);
    } finally {
      setExporting(false);
    }
  }

  const moreHref = (() => {
    if (!nextCursor) return null;
    const next = new URLSearchParams(searchParams.toString());
    next.set("before", nextCursor);
    return `${pathname}?${next.toString()}`;
  })();

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:flex-wrap lg:items-end">
        <Combobox
          label="Produto"
          value={filters.item}
          onValueChange={(v) => setParam({ item: v || null })}
          placeholder="Todos os produtos"
          searchPlaceholder="Buscar por nome ou SKU…"
          options={[{ value: "", label: "Todos os produtos" }, ...items.map((i) => ({ value: i.stockItemId, label: i.sku ? `${i.sku} · ${i.title}` : i.title }))]}
          className="lg:w-72"
        />
        <FormSelect
          label="Tipo"
          value={filters.group}
          onValueChange={(v) => setParam({ type: v === "all" ? null : v })}
          options={Object.entries(MOVEMENT_GROUPS).map(([value, g]) => ({ value, label: g.label }))}
          className="lg:w-56"
        />
        <FormSelect
          label="Local"
          value={filters.location || "all"}
          onValueChange={(v) => setParam({ location: v === "all" ? null : v })}
          options={[
            { value: "all", label: "Em casa e Full" },
            { value: "own", label: "Em casa" },
            { value: "full", label: "Full" },
          ]}
          className="lg:w-44"
        />
        <div className="space-y-1.5">
          <span className="block text-xs font-medium text-[var(--muted-foreground)]">Período</span>
          <DateRangePicker
            fromYmd={filters.from}
            toYmd={filters.to}
            triggerLabel={filters.from || filters.to ? undefined : "Qualquer data"}
            onCommit={(from, to) => setParam({ from: from || null, to: to || null })}
          />
        </div>
        <Button variant="outline" onClick={() => void exportExcel()} disabled={exporting || rows.length === 0} className="lg:ml-auto">
          <Download aria-hidden />
          Exportar Excel
        </Button>
      </div>

      <Card className="overflow-hidden rounded-2xl">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-sm">
            <thead className="border-b border-[var(--border)] text-left text-xs text-[var(--muted-foreground)]">
              <tr>
                <th className="px-4 py-2.5 font-medium">Data</th>
                <th className="py-2.5 pr-3 font-medium">Produto</th>
                <th className="py-2.5 pr-3 font-medium">Movimentação</th>
                <th className="py-2.5 pr-3 font-medium">Origem</th>
                <th className="px-4 py-2.5 text-right font-medium">Quantidade</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border)]">
              {rows.map((m) => (
                <tr key={m.id} className={cn(m.location === "full" && "text-[var(--muted-foreground)]")}>
                  <td className="whitespace-nowrap px-4 py-2.5 tabular-nums">{formatDateTime(m.occurredAt)}</td>
                  <td className="py-2.5 pr-3">
                    <span className="line-clamp-1 font-medium">{m.itemTitle}</span>
                    <span className="text-xs text-[var(--muted-foreground)]">{m.itemSku ?? "Sem SKU"}</span>
                  </td>
                  <td className="py-2.5 pr-3">
                    {m.typeLabel}
                    {m.channelLabel ? <span className="text-[var(--muted-foreground)]"> · {m.channelLabel}</span> : null}
                    {m.location === "full" ? <span className="text-[var(--muted-foreground)]"> · no Full</span> : null}
                    {m.reason && m.type !== "sale" ? (
                      <span className="block text-xs text-[var(--muted-foreground)]">{m.reason}</span>
                    ) : null}
                  </td>
                  <td className="py-2.5 pr-3 text-xs text-[var(--muted-foreground)]">
                    {m.sourceType === "ml_order" ? (
                      <>Pedido {m.sourceId}{m.listingMlItemId ? ` · ${m.listingMlItemId}` : ""}</>
                    ) : m.sourceType === "entry" ? (
                      <Link href="/dashboard/inventory/entradas" className="underline-offset-2 hover:underline">
                        Entrada
                      </Link>
                    ) : m.sourceType === "review" ? (
                      "Pendência confirmada"
                    ) : m.sourceType === "activation" ? (
                      "Ativação"
                    ) : (
                      "Manual"
                    )}
                  </td>
                  <td
                    className={cn(
                      "px-4 py-2.5 text-right font-semibold tabular-nums",
                      m.location === "own" && m.quantity > 0 && "text-emerald-700 dark:text-emerald-400",
                    )}
                  >
                    {formatSignedUnits(m.quantity)}
                  </td>
                </tr>
              ))}
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-10 text-center text-sm text-[var(--muted-foreground)]">
                    Nenhuma movimentação com esses filtros.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </Card>
      <div className="flex items-center justify-between text-xs text-[var(--muted-foreground)]">
        <span>Vendas do Full aparecem em cinza: o Full é controlado pelo Mercado Livre e não mexe no Em casa.</span>
        {moreHref ? (
          <Link href={moreHref} className="font-medium text-[var(--primary)] underline-offset-2 hover:underline">
            Mais antigas
          </Link>
        ) : null}
      </div>
    </div>
  );
}
